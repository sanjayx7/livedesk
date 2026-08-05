const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const Agent = require('./models/Agent');
const Session = require('./models/Session');
const Message = require('./models/Message');
const Setting = require('./models/Setting');
const { queryKnowledgeBase, generateAnswer } = require('./services/rag');
const { getBusinessHours, isWithinBusinessHours } = require('./services/businessHours');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-livedesk-token-key-2026';

// Helper: GeoIP resolution for visitor IP and country
async function resolveGeoIP(rawIp) {
  let ip = (rawIp || '').split(',')[0].trim();
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }

  if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    try {
      const res = await fetch('http://ip-api.com/json/', { timeout: 3000 });
      if (res.ok) {
        const geo = await res.json();
        if (geo && geo.status === 'success') {
          return {
            ip: geo.query || ip || '127.0.0.1',
            country: geo.country || 'Localhost',
            countryCode: geo.countryCode || 'IN',
            city: geo.city || '',
            location: `${geo.city ? geo.city + ', ' : ''}${geo.country || 'Local Network'}`
          };
        }
      }
    } catch (e) {
      // ignore
    }
    return {
      ip: ip || '127.0.0.1',
      country: 'Local Network',
      countryCode: 'IN',
      city: 'Local',
      location: 'Local Network'
    };
  }

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}`, { timeout: 3000 });
    if (res.ok) {
      const geo = await res.json();
      if (geo && geo.status === 'success') {
        return {
          ip,
          country: geo.country || '',
          countryCode: geo.countryCode || '',
          city: geo.city || '',
          location: `${geo.city ? geo.city + ', ' : ''}${geo.country || ip}`
        };
      }
    }
  } catch (e) {
    // ignore
  }

  return {
    ip,
    country: '',
    countryCode: '',
    city: '',
    location: ip
  };
}

function initSocket(server) {
  const io = socketIO(server, {
    cors: {
      origin: '*', // Allow all origins for the client embedding
      methods: ['GET', 'POST']
    }
  });

  // Helper: Broadcast updated session list to all agents of a project
  async function broadcastSessionList(projectId = 'default') {
    try {
      const sessions = await Session.find({ projectId })
        .populate('assignedAgent', 'username status')
        .sort({ updatedAt: -1 });
      io.to(`agents_${projectId}`).emit('sessions:update', sessions);
    } catch (err) {
      console.error("Error broadcasting session list:", err);
    }
  }

  // Helper: Broadcast online agents list to all agents of a project
  async function broadcastAgentList(projectId = 'default') {
    try {
      const agents = await Agent.find({}, 'username status role');
      io.to(`agents_${projectId}`).emit('agents:update', agents);
    } catch (err) {
      console.error("Error broadcasting agent list:", err);
    }
  }

  io.on('connection', async (socket) => {
    let currentAgent = null;
    let currentVisitorId = null;
    let currentSessionId = null;
    let currentProjectId = 'default';

    // Check if connection is from an agent
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        currentAgent = await Agent.findById(decoded.id);
        if (currentAgent) {
          // Set status online upon connection
          currentAgent.status = 'online';
          await currentAgent.save();

          socket.join(`agents_${currentProjectId}`);
          console.log(`Agent connected: ${currentAgent.username} inside project: ${currentProjectId}`);

          // Send initial details for default project
          const sessions = await Session.find({ projectId: currentProjectId })
            .populate('assignedAgent', 'username status')
            .sort({ updatedAt: -1 });
          socket.emit('sessions:init', sessions);

          const agents = await Agent.find({}, 'username status role');
          socket.emit('agents:init', agents);

          // Broadcast status change to other agents
          broadcastAgentList(currentProjectId);
        }
      } catch (err) {
        console.error("Agent socket connection auth failed:", err.message);
        socket.emit('auth:error', 'Invalid token');
        socket.disconnect();
        return;
      }
    }

    // --- VISITOR EVENTS ---

    // Register visitor and load chat history
    socket.on('visitor:register', async (data) => {
      const { projectId, visitorId, pageUrl, pageTitle, referrer, userAgent, name, email, phone } = data;
      currentVisitorId = visitorId;
      currentProjectId = projectId || 'default';

      try {
        const rawIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.headers['x-real-ip'] || socket.handshake.address;
        const geoInfo = await resolveGeoIP(rawIp);

        // Find or create session
        let session = await Session.findOne({ visitorId });
        if (!session) {
          session = await Session.create({
            visitorId,
            projectId: currentProjectId,
            status: 'bot',
            visitorInfo: {
              ip: geoInfo.ip,
              country: geoInfo.country,
              countryCode: geoInfo.countryCode,
              city: geoInfo.city,
              location: geoInfo.location,
              userAgent,
              currentPage: pageUrl,
              title: pageTitle,
              referrer,
              name: name || '',
              email: email || '',
              phone: phone || ''
            }
          });
        } else {
          // Update details
          session.projectId = currentProjectId;
          session.visitorInfo.ip = geoInfo.ip || session.visitorInfo.ip;
          if (geoInfo.country) session.visitorInfo.country = geoInfo.country;
          if (geoInfo.countryCode) session.visitorInfo.countryCode = geoInfo.countryCode;
          if (geoInfo.city) session.visitorInfo.city = geoInfo.city;
          if (geoInfo.location) session.visitorInfo.location = geoInfo.location;
          session.visitorInfo.currentPage = pageUrl;
          session.visitorInfo.title = pageTitle;
          session.visitorInfo.userAgent = userAgent;
          if (name) session.visitorInfo.name = name;
          if (email) session.visitorInfo.email = email;
          if (phone) session.visitorInfo.phone = phone;
          await session.save();
        }

        currentSessionId = session._id.toString();
        socket.join(`session_${currentSessionId}`);
        console.log(`Visitor registered: ${visitorId} in session ${currentSessionId}`);

        // Fetch history and project-specific branding
        const messages = await Message.find({ sessionId: session._id }).sort({ timestamp: 1 });
        const brandingDoc = await Setting.findOne({ key: 'widget_branding', projectId: session.projectId || 'default' });
        const branding = brandingDoc ? brandingDoc.value : { chatbotName: 'AI Chatbot', teamSubtitle: 'Support Representative' };
        
        socket.emit('visitor:init', {
          session,
          messages,
          branding
        });

        // Notify agents of new visitor registration
        broadcastSessionList(session.projectId);
      } catch (err) {
        console.error("Error in visitor:register:", err);
      }
    });

    // Handle incoming message from visitor
    socket.on('visitor:message', async (data) => {
      const { text, sessionId } = data;
      const targetSessionId = sessionId || currentSessionId;
      if (!targetSessionId) return;

      try {
        let session = await Session.findById(targetSessionId);
        if (!session) return;

        // Save visitor message
        const userMsg = await Message.create({
          sessionId: session._id,
          sender: 'visitor',
          text
        });

        // Broadcast to session room (so user and assigned agent see it)
        io.to(`session_${targetSessionId}`).emit('message:new', userMsg);

        // Increment unread count for agent dashboard notifications
        session.unreadCount = (session.unreadCount || 0) + 1;

        // Fetch real-time open/online status
        const bhSettings = await getBusinessHours(session.projectId || 'default');
        const isBusinessOpen = isWithinBusinessHours(bhSettings);
        const onlineAgentsCount = await Agent.countDocuments({ status: 'online' });
        const hasOnlineAgents = onlineAgentsCount > 0;
        const isSystemOnline = isBusinessOpen && hasOnlineAgents;

        // Routing logic:
        // If session is explicitly set to 'bot', preserve 'bot' mode so AI chatbot handles response.
        // If system is offline, force session to 'bot' mode unless closed.
        // If system is online and session was not previously bot, set to 'active'.
        if (!isSystemOnline && session.status !== 'closed') {
          if (session.status !== 'bot') {
            session.status = 'bot';
            session.assignedAgent = null;
            await session.save();

            const statusChangePayload = { status: 'bot', assignedAgent: null };
            io.to(`session_${targetSessionId}`).emit('session:status_changed', statusChangePayload);
            io.to(`agents_${session.projectId || 'default'}`).emit('session:status_changed', {
              sessionId: session._id,
              ...statusChangePayload
            });
          }
        } else if (session.status === 'active') {
          // Trigger dashboard audio alert alarm for human agent when in active mode
          io.to('agents_' + (session.projectId || 'default')).emit('notification:new_message', {
            sessionId: session._id,
            visitorId: session.visitorId,
            text: userMsg.text
          });
        }

        // Retrieve recent messages for multi-turn history context
        const recentMessages = await Message.find({ sessionId: session._id }).sort({ timestamp: -1 }).limit(6);
        const historyText = recentMessages.slice().reverse().map(m => `${m.sender.toUpperCase()}: ${m.text}`).join('\n');

        // Check if visitor is asking to connect to salesman/human agent OR confirming "yes" to a bot offer
        const lowerText = text.trim().toLowerCase();
        const isDirectConnectRequest = /\b(connect|talk|speak|chat|call|transfer)\b.*\b(sales|salesman|agent|human|rep|representative|team|support)\b/i.test(lowerText)
          || /\b(salesman|sales representative|human agent|live agent)\b/i.test(lowerText);

        const lastBotMessage = recentMessages.find(m => m.sender === 'bot');
        const botOfferedConnection = lastBotMessage && (
          /connect/i.test(lastBotMessage.text) || 
          /agent/i.test(lastBotMessage.text) || 
          /sales/i.test(lastBotMessage.text) || 
          /representative/i.test(lastBotMessage.text)
        );
        const isAffirmativeResponse = /^(yes|yeah|yep|sure|ok|okay|please|connect|connect me|yup|do it|pls)\b/i.test(lowerText);

        const wantsToConnect = isDirectConnectRequest || (botOfferedConnection && isAffirmativeResponse);

        // Routing & Intent Handling
        if (session.status === 'bot' && wantsToConnect) {
          if (isSystemOnline) {
            // System is ONLINE: Hand off session to active human agent, trigger notifications & audio alarm
            session.status = 'active';
            await session.save();

            const statusPayload = { status: 'active', assignedAgent: session.assignedAgent };
            io.to(`session_${targetSessionId}`).emit('session:status_changed', statusPayload);
            io.to(`agents_${session.projectId || 'default'}`).emit('session:status_changed', {
              sessionId: session._id,
              ...statusPayload
            });

            // Trigger dashboard audio alert alarm for human agent
            io.to('agents_' + (session.projectId || 'default')).emit('notification:new_message', {
              sessionId: session._id,
              visitorId: session.visitorId,
              text: userMsg.text
            });

            // Bot reply confirming connection to salesman/agent
            const botMsg = await Message.create({
              sessionId: session._id,
              sender: 'bot',
              text: "Certainly! I am connecting you to an available sales representative right away. Please stay on the line..."
            });
            io.to(`session_${targetSessionId}`).emit('message:new', botMsg);

            broadcastSessionList(session.projectId);
            return;
            // Fetch project name and branding options for prompt personalization
            let projectName = '';
            try {
              const projectsDoc = await Setting.findOne({ key: 'projects_list' });
              if (projectsDoc && Array.isArray(projectsDoc.value)) {
                const proj = projectsDoc.value.find(p => p.id === (session.projectId || 'default'));
                if (proj) projectName = proj.name;
              }
            } catch (e) {}

            const brandingDoc = await Setting.findOne({ key: 'widget_branding', projectId: session.projectId || 'default' });
            const branding = brandingDoc ? brandingDoc.value : {};
            const ragOptions = {
              projectName: projectName || branding.chatbotName || 'our company',
              chatbotName: branding.chatbotName || 'AI Assistant'
            };

            // System is OFFLINE: Keep in bot mode, do NOT trigger alarms, present offline contact/lead capture
            io.to(`session_${targetSessionId}`).emit('bot:typing', true);
            const relevantChunks = await queryKnowledgeBase(text, session.projectId || 'default', 3);
            const botResponseText = await generateAnswer(text, relevantChunks, historyText, false, ragOptions);

            setTimeout(async () => {
              const botMsg = await Message.create({
                sessionId: session._id,
                sender: 'bot',
                text: botResponseText
              });
              io.to(`session_${targetSessionId}`).emit('bot:typing', false);
              io.to(`session_${targetSessionId}`).emit('message:new', botMsg);

              session.updatedAt = new Date();
              await session.save();
              broadcastSessionList(session.projectId);
            }, 800);
            return;
          }
        }

        // Update session's update time
        session.updatedAt = new Date();
        await session.save();
        broadcastSessionList(session.projectId);

        // Regular bot response if session status is bot
        if (session.status === 'bot') {
          // Send typing indicator for bot
          io.to(`session_${targetSessionId}`).emit('bot:typing', true);

          // Fetch project name and branding options for prompt personalization
          let projectName = '';
          try {
            const projectsDoc = await Setting.findOne({ key: 'projects_list' });
            if (projectsDoc && Array.isArray(projectsDoc.value)) {
              const proj = projectsDoc.value.find(p => p.id === (session.projectId || 'default'));
              if (proj) projectName = proj.name;
            }
          } catch (e) {}

          const brandingDoc = await Setting.findOne({ key: 'widget_branding', projectId: session.projectId || 'default' });
          const branding = brandingDoc ? brandingDoc.value : {};
          const ragOptions = {
            projectName: projectName || branding.chatbotName || 'our company',
            chatbotName: branding.chatbotName || 'AI Assistant'
          };

          // Perform knowledge retrieval and generation with history
          const relevantChunks = await queryKnowledgeBase(text, session.projectId || 'default', 3);
          const botResponseText = await generateAnswer(text, relevantChunks, historyText, isSystemOnline, ragOptions);

          // Simulate slight typing delay
          setTimeout(async () => {
            const botMsg = await Message.create({
              sessionId: session._id,
              sender: 'bot',
              text: botResponseText
            });

            io.to(`session_${targetSessionId}`).emit('bot:typing', false);
            io.to(`session_${targetSessionId}`).emit('message:new', botMsg);
            
            session.updatedAt = new Date();
            await session.save();
            broadcastSessionList(session.projectId);
          }, 800);
        }
      } catch (err) {
        console.error("Error in visitor:message:", err);
      }
    });

    // Visitor page view update
    socket.on('visitor:page_view', async (data) => {
      const { pageUrl, pageTitle } = data;
      if (!currentSessionId) return;

      try {
        const session = await Session.findById(currentSessionId);
        if (session) {
          session.visitorInfo.currentPage = pageUrl;
          session.visitorInfo.title = pageTitle;
          await session.save();
          broadcastSessionList(session.projectId);
        }
      } catch (err) {
        console.error("Error in visitor:page_view:", err);
      }
    });

    // Visitor update profile (from lead capture form)
    socket.on('visitor:update_profile', async (data) => {
      const { name, email, phone } = data;
      if (!currentSessionId) return;

      try {
        const session = await Session.findById(currentSessionId);
        if (session) {
          session.visitorInfo.name = name;
          session.visitorInfo.email = email;
          session.visitorInfo.phone = phone;
          await session.save();
          broadcastSessionList(session.projectId);
        }
      } catch (err) {
        console.error("Error in visitor:update_profile:", err);
      }
    });

    // Visitor typing indicator
    socket.on('visitor:typing', (isTyping) => {
      if (currentSessionId) {
        io.to(`session_${currentSessionId}`).emit('visitor:typing_state', isTyping);
      }
    });

    // --- AGENT EVENTS ---

    // Agent switches project
    socket.on('agent:select_project', async (data) => {
      if (!currentAgent) return;
      const { projectId } = data;
      
      // Leave old project room
      socket.leave(`agents_${currentProjectId}`);
      
      currentProjectId = projectId || 'default';
      socket.join(`agents_${currentProjectId}`);
      
      // Send initial details for switched project
      const sessions = await Session.find({ projectId: currentProjectId })
        .populate('assignedAgent', 'username status')
        .sort({ updatedAt: -1 });
      socket.emit('sessions:init', sessions);
      
      console.log(`Agent ${currentAgent.username} joined project room: agents_${currentProjectId}`);
    });

    // Agent views a chat session (without altering status)
    socket.on('agent:view_chat', async (data) => {
      if (!currentAgent) return;
      const { sessionId } = data;

      try {
        const session = await Session.findById(sessionId);
        if (session) {
          socket.join(`session_${sessionId}`);
          console.log(`Agent ${currentAgent.username} viewing session ${sessionId}`);

          const messages = await Message.find({ sessionId: session._id }).sort({ timestamp: 1 });
          socket.emit('agent:chat_history', { sessionId, messages });
        }
      } catch (err) {
        console.error("Error in agent:view_chat:", err);
      }
    });

    // Agent joins a chat (takeover)
    socket.on('agent:join_chat', async (data) => {
      if (!currentAgent) return;
      const { sessionId } = data;

      try {
        const session = await Session.findById(sessionId);
        if (session) {
          session.status = 'active';
          session.assignedAgent = currentAgent._id;
          session.unreadCount = 0; // Reset unread on agent takeover
          await session.save();

          socket.join(`session_${sessionId}`);
          console.log(`Agent ${currentAgent.username} took over session ${sessionId}`);

          const statusPayload = {
            sessionId: session._id.toString(),
            status: 'active',
            assignedAgent: { username: currentAgent.username, _id: currentAgent._id }
          };

          // Notify visitor and agents that agent joined
          io.to(`session_${sessionId}`).emit('session:status_changed', statusPayload);
          io.to(`agents_${session.projectId || 'default'}`).emit('session:status_changed', statusPayload);

          // Fetch full messages of this session for agent
          const messages = await Message.find({ sessionId: session._id }).sort({ timestamp: 1 });
          socket.emit('agent:chat_history', { sessionId, messages });

          broadcastSessionList(session.projectId);
        }
      } catch (err) {
        console.error("Error in agent:join_chat:", err);
      }
    });

    // Agent sends a message
    socket.on('agent:message', async (data) => {
      if (!currentAgent) return;
      const { sessionId, text } = data;

      try {
        const session = await Session.findById(sessionId);
        if (!session) return;

        const agentMsg = await Message.create({
          sessionId: session._id,
          sender: 'agent',
          text
        });

        io.to(`session_${sessionId}`).emit('message:new', agentMsg);
        
        session.updatedAt = new Date();
        await session.save();
        broadcastSessionList(session.projectId);
      } catch (err) {
        console.error("Error in agent:message:", err);
      }
    });

    // Agent marks session as read (resets unread count)
    socket.on('agent:mark_read', async (data) => {
      if (!currentAgent) return;
      const { sessionId } = data;
      try {
        const session = await Session.findById(sessionId);
        if (session) {
          session.unreadCount = 0;
          await session.save();
          broadcastSessionList(session.projectId);
        }
      } catch (err) {
        console.error("Error in agent:mark_read:", err);
      }
    });

    // Agent hands off chat back to bot
    socket.on('agent:handoff_bot', async (data) => {
      if (!currentAgent) return;
      const { sessionId } = data;

      try {
        const session = await Session.findById(sessionId);
        if (session) {
          session.status = 'bot';
          session.assignedAgent = null;
          await session.save();

          const statusPayload = {
            sessionId: session._id.toString(),
            status: 'bot',
            assignedAgent: null
          };

          io.to(`session_${sessionId}`).emit('session:status_changed', statusPayload);
          io.to(`agents_${session.projectId || 'default'}`).emit('session:status_changed', statusPayload);

          broadcastSessionList(session.projectId);
        }
      } catch (err) {
        console.error("Error in agent:handoff_bot:", err);
      }
    });

    // Agent closes chat
    socket.on('agent:close_chat', async (data) => {
      if (!currentAgent) return;
      const { sessionId } = data;

      try {
        const session = await Session.findById(sessionId);
        if (session) {
          session.status = 'closed';
          await session.save();

          const statusPayload = {
            sessionId: session._id.toString(),
            status: 'closed',
            assignedAgent: null
          };

          io.to(`session_${sessionId}`).emit('session:status_changed', statusPayload);
          io.to(`agents_${session.projectId || 'default'}`).emit('session:status_changed', statusPayload);

          broadcastSessionList(session.projectId);
        }
      } catch (err) {
        console.error("Error in agent:close_chat:", err);
      }
    });

    // Agent typing indicator
    socket.on('agent:typing', (data) => {
      if (!currentAgent) return;
      const { sessionId, isTyping } = data;
      io.to(`session_${sessionId}`).emit('agent:typing_state', isTyping);
    });

    // Agent manually toggles status online/offline
    socket.on('agent:status_toggle', async (data) => {
      if (!currentAgent) return;
      const { status } = data;

      if (['online', 'offline'].includes(status)) {
        currentAgent.status = status;
        await currentAgent.save();
        console.log(`Agent ${currentAgent.username} toggled status to ${status}`);
        
        broadcastAgentList(currentProjectId);
      }
    });

    // Clean up on disconnect
    socket.on('disconnect', async () => {
      if (currentAgent) {
        currentAgent.status = 'offline';
        await currentAgent.save();
        console.log(`Agent disconnected: ${currentAgent.username}`);
        
        broadcastAgentList(currentProjectId);
      } else if (currentVisitorId) {
        console.log(`Visitor disconnected: ${currentVisitorId}`);
      }
    });
  });
}

module.exports = initSocket;
