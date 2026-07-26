(function () {
  // Find current server origin from script source
  const scriptEl = document.getElementById('livedesk-widget-script');
  const serverUrl = scriptEl ? new URL(scriptEl.src).origin : window.location.origin;
  const projectId = scriptEl ? (new URL(scriptEl.src).searchParams.get('project') || 'default') : 'default';

  // Generate or retrieve visitor ID
  let visitorId = localStorage.getItem('livedesk_visitor_id');
  if (!visitorId) {
    visitorId = 'v_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('livedesk_visitor_id', visitorId);
  }

  // Load Socket.io Client dynamically
  const ioScript = document.createElement('script');
  ioScript.src = `${serverUrl}/socket.io/socket.io.js`;
  ioScript.onload = initWidget;
  document.head.appendChild(ioScript);

  function initWidget() {
    let socket = io(serverUrl);
    let session = null;
    let typingTimeout = null;
    let brandingConfig = { chatbotName: 'AI Chatbot', teamSubtitle: 'Support Representative' };

    // Create container for widget and attach shadow DOM
    const container = document.createElement('div');
    container.id = 'livedesk-chat-widget-root';
    document.body.appendChild(container);

    const shadow = container.attachShadow({ mode: 'open' });

    // Inject stylesheet link into shadow DOM
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${serverUrl}/widget/widget.css`;
    shadow.appendChild(link);

    // Create Widget Markup
    const widgetWrapper = document.createElement('div');
    widgetWrapper.className = 'ld-widget-wrapper';
    widgetWrapper.innerHTML = `
      <!-- Launcher Bubble -->
      <button class="ld-launcher" id="ld-launcher-btn" aria-label="Open Chat">
        <svg class="ld-icon-chat" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <svg class="ld-icon-close ld-hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <!-- Chat Window Panel -->
      <div class="ld-chat-panel ld-hidden" id="ld-chat-panel-win">
        <!-- Lead Form Screen -->
        <div class="ld-lead-form-screen" id="ld-lead-form-panel">
          <div class="ld-lead-header">
            <div class="ld-lead-logo">💬</div>
            <h3>Welcome!</h3>
            <p>Introduce yourself to start chatting (optional)</p>
          </div>
          <form id="ld-lead-form" class="ld-lead-form">
            <div class="ld-form-group">
              <label>Name</label>
              <input type="text" id="ld-lead-name" placeholder="e.g. John Doe">
            </div>
            <div class="ld-form-group">
              <label>Email Address</label>
              <input type="email" id="ld-lead-email" placeholder="e.g. john@example.com">
            </div>
            <div class="ld-form-group">
              <label>Phone Number</label>
              <div class="ld-phone-input-wrapper">
                <input type="text" id="ld-lead-phone-code" placeholder="+1" value="+1">
                <input type="text" id="ld-lead-phone" placeholder="123 456 7890">
              </div>
            </div>
            <div class="ld-lead-actions">
              <button type="button" class="ld-btn-skip" id="ld-lead-btn-skip">Skip</button>
              <button type="submit" class="ld-btn-submit" id="ld-lead-btn-submit">Start Chat</button>
            </div>
          </form>
        </div>

        <!-- Header -->
        <div class="ld-header ld-chat-content-el ld-hidden">
          <div class="ld-header-avatar">🤖</div>
          <div class="ld-header-info">
            <div class="ld-header-title" id="ld-header-title-text">AI Assistant</div>
            <div class="ld-header-status" id="ld-header-status-text">Online</div>
          </div>
          <button class="ld-btn-close" id="ld-header-close-btn" aria-label="Minimize Chat">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        <!-- Messages stream -->
        <div class="ld-messages ld-chat-content-el ld-hidden" id="ld-messages-scroll">
          <div class="ld-message ld-bot">
            <div class="ld-bubble">Hello! Welcome to our website. How can I help you today?</div>
          </div>
        </div>

        <!-- Suggested Questions -->
        <div class="ld-suggested-questions ld-chat-content-el ld-hidden" id="ld-suggested-questions-box"></div>

        <!-- Composer area -->
        <form class="ld-composer ld-chat-content-el ld-hidden" id="ld-composer-form">
          <input type="text" id="ld-message-input" placeholder="Ask a question..." autocomplete="off" required>
          <button type="submit" class="ld-btn-send" aria-label="Send message">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    `;
    shadow.appendChild(widgetWrapper);

    // Elements inside shadow DOM
    const launcherBtn = shadow.getElementById('ld-launcher-btn');
    const chatPanelWin = shadow.getElementById('ld-chat-panel-win');
    const headerCloseBtn = shadow.getElementById('ld-header-close-btn');
    const iconChat = shadow.querySelector('.ld-icon-chat');
    const iconClose = shadow.querySelector('.ld-icon-close');
    
    const headerAvatar = shadow.querySelector('.ld-header-avatar');
    const headerTitle = shadow.getElementById('ld-header-title-text');
    const headerStatus = shadow.getElementById('ld-header-status-text');
    const messagesScroll = shadow.getElementById('ld-messages-scroll');
    const composerForm = shadow.getElementById('ld-composer-form');
    const messageInput = shadow.getElementById('ld-message-input');

    // Lead Form UI elements
    const leadFormPanel = shadow.getElementById('ld-lead-form-panel');
    const leadForm = shadow.getElementById('ld-lead-form');
    const leadName = shadow.getElementById('ld-lead-name');
    const leadEmail = shadow.getElementById('ld-lead-email');
    const leadPhoneCode = shadow.getElementById('ld-lead-phone-code');
    const leadPhone = shadow.getElementById('ld-lead-phone');
    const leadBtnSkip = shadow.getElementById('ld-lead-btn-skip');
    const suggestedQuestionsBox = shadow.getElementById('ld-suggested-questions-box');

    const defaultQuestions = {
      'default': [
        "What is LiveDesk?",
        "How do I set up the chat widget?",
        "How can I talk to a human agent?"
      ],
      'project_salesroute': [
        "What is SalesRoute AI?",
        "Tell me about the features",
        "How can I request a demo?"
      ]
    };

    function renderSuggestedQuestions() {
      if (!suggestedQuestionsBox) return;
      suggestedQuestionsBox.innerHTML = '';
      
      // Only show suggested questions if session is in 'bot' status
      if (session && session.status !== 'bot') {
        suggestedQuestionsBox.classList.add('ld-hidden');
        return;
      }
      
      const submitted = localStorage.getItem('livedesk_visitor_info_submitted') === 'true';
      if (!submitted) {
        suggestedQuestionsBox.classList.add('ld-hidden');
        return;
      }

      suggestedQuestionsBox.classList.remove('ld-hidden');
      
      const list = defaultQuestions[projectId] || defaultQuestions['default'];
      list.forEach(q => {
        const btn = document.createElement('button');
        btn.className = 'ld-suggested-btn';
        btn.textContent = q;
        btn.type = 'button';
        btn.addEventListener('click', () => {
          socket.emit('visitor:message', { text: q });
          
          // Hide suggested questions temporarily until response
          suggestedQuestionsBox.classList.add('ld-hidden');
        });
        suggestedQuestionsBox.appendChild(btn);
      });
    }

    // Create typing indicator element
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'ld-message ld-bot ld-typing-row ld-hidden';
    typingIndicator.innerHTML = `
      <div class="ld-bubble ld-typing-bubble">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    messagesScroll.appendChild(typingIndicator);

    // Toggle Chat Panel
    function toggleChat() {
      const isHidden = chatPanelWin.classList.contains('ld-hidden');
      if (isHidden) {
        chatPanelWin.classList.remove('ld-hidden');
        iconChat.classList.add('ld-hidden');
        iconClose.classList.remove('ld-hidden');
        scrollToBottom();
        
        // Focus form or message input depending on state
        const submitted = localStorage.getItem('livedesk_visitor_info_submitted') === 'true';
        if (submitted) {
          messageInput.focus();
          renderSuggestedQuestions();
        } else {
          leadName.focus();
        }
      } else {
        chatPanelWin.classList.add('ld-hidden');
        iconChat.classList.remove('ld-hidden');
        iconClose.classList.add('ld-hidden');
      }
    }

    launcherBtn.addEventListener('click', toggleChat);
    headerCloseBtn.addEventListener('click', toggleChat);

    // Function to check and render active screens
    function checkFormState() {
      const submitted = localStorage.getItem('livedesk_visitor_info_submitted') === 'true';
      const contentEls = shadow.querySelectorAll('.ld-chat-content-el');
      
      if (submitted) {
        if (leadFormPanel) leadFormPanel.classList.add('ld-hidden');
        contentEls.forEach(el => el.classList.remove('ld-hidden'));
      } else {
        if (leadFormPanel) leadFormPanel.classList.remove('ld-hidden');
        contentEls.forEach(el => el.classList.add('ld-hidden'));
      }
    }

    // Call state check initially
    checkFormState();

    // Skip lead form
    if (leadBtnSkip) {
      leadBtnSkip.addEventListener('click', () => {
        localStorage.setItem('livedesk_visitor_info_submitted', 'true');
        checkFormState();
        renderSuggestedQuestions();
        messageInput.focus();
      });
    }

    // Submit lead form
    if (leadForm) {
      leadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = leadName.value.trim();
        const email = leadEmail.value.trim();
        const phone = (leadPhoneCode.value.trim() + " " + leadPhone.value.trim()).trim();

        if (name) localStorage.setItem('livedesk_visitor_name', name);
        if (email) localStorage.setItem('livedesk_visitor_email', email);
        if (phone) localStorage.setItem('livedesk_visitor_phone', phone);
        localStorage.setItem('livedesk_visitor_info_submitted', 'true');

        // Send profile update to socket
        socket.emit('visitor:update_profile', { name, email, phone });

        checkFormState();
        renderSuggestedQuestions();
        messageInput.focus();
      });
    }

    // --- SOCKET INTEGRATION ---

    // Register visitor session details (include saved profile data)
    const savedName = localStorage.getItem('livedesk_visitor_name') || '';
    const savedEmail = localStorage.getItem('livedesk_visitor_email') || '';
    const savedPhone = localStorage.getItem('livedesk_visitor_phone') || '';

    socket.emit('visitor:register', {
      projectId,
      visitorId,
      pageUrl: window.location.href,
      pageTitle: document.title,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      name: savedName,
      email: savedEmail,
      phone: savedPhone
    });

    socket.on('visitor:init', (data) => {
      session = data.session;
      if (data.branding) brandingConfig = data.branding;
      updateHeader(session);
      renderSuggestedQuestions();

      // Render history
      if (data.messages.length > 0) {
        messagesScroll.innerHTML = ''; // Clear default greeting if history exists
        data.messages.forEach(appendMessage);
        messagesScroll.appendChild(typingIndicator); // Re-append typing indicator
      }
      scrollToBottom();
    });

    socket.on('session:status_changed', (data) => {
      if (session) {
        session.status = data.status;
        session.assignedAgent = data.assignedAgent;
        updateHeader(session);
        renderSuggestedQuestions();
      }
    });

    socket.on('message:new', (msg) => {
      appendMessage(msg);
      renderSuggestedQuestions();
      scrollToBottom();
    });

    socket.on('session:status_changed', (data) => {
      if (session) {
        session.status = data.status;
        session.assignedAgent = data.assignedAgent;
        updateHeader(session);
      }
    });

    // Listen for custom simulated page changes in mock website
    window.addEventListener('livedesk:pagechange', (e) => {
      const { pageUrl, pageTitle } = e.detail;
      socket.emit('visitor:page_view', { pageUrl, pageTitle });
      if (session) {
        session.visitorInfo.currentPage = pageUrl;
        session.visitorInfo.title = pageTitle;
      }
    });

    // Chatbot typing animation triggers
    socket.on('bot:typing', (isTyping) => {
      if (isTyping) {
        typingIndicator.classList.remove('ld-hidden');
        scrollToBottom();
      } else {
        typingIndicator.classList.add('ld-hidden');
      }
    });

    // Human agent typing indicators
    socket.on('agent:typing_state', (isTyping) => {
      if (isTyping && session && session.status === 'active') {
        typingIndicator.classList.remove('ld-hidden');
        scrollToBottom();
      } else {
        typingIndicator.classList.add('ld-hidden');
      }
    });

    // Composer Form Submit
    composerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = messageInput.value.trim();
      if (!text) return;

      socket.emit('visitor:message', { text });
      messageInput.value = '';

      // Reset typing state
      socket.emit('visitor:typing', false);
    });

    // Visitor typing indicators
    messageInput.addEventListener('input', () => {
      socket.emit('visitor:typing', true);

      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.emit('visitor:typing', false);
      }, 1500);
    });

    // Helper functions
    function updateHeader(sess) {
      if (sess.status === 'active' && sess.assignedAgent) {
        headerAvatar.textContent = sess.assignedAgent.username.charAt(0).toUpperCase();
        headerAvatar.style.backgroundColor = 'var(--primary)';
        headerTitle.textContent = sess.assignedAgent.username;
        headerStatus.textContent = brandingConfig.teamSubtitle || 'Support Representative';
        headerStatus.style.color = 'var(--text-muted)';
      } else {
        headerAvatar.textContent = '🤖';
        headerAvatar.style.backgroundColor = '#2c3347';
        headerTitle.textContent = brandingConfig.chatbotName || 'AI Chatbot';
        headerStatus.textContent = 'Knowledge Assistant';
        headerStatus.style.color = '#3b82f6';
      }
    }

    function appendMessage(msg) {
      // Remove typing indicator if we were typing
      typingIndicator.classList.add('ld-hidden');

      const isBotOrAgent = msg.sender === 'bot' || msg.sender === 'agent';
      const senderClass = isBotOrAgent ? 'ld-bot' : 'ld-user';

      const row = document.createElement('div');
      row.className = `ld-message ${senderClass}`;

      const bubble = document.createElement('div');
      bubble.className = 'ld-bubble';
      bubble.textContent = msg.text;

      row.appendChild(bubble);
      if (messagesScroll.contains(typingIndicator)) {
        messagesScroll.insertBefore(row, typingIndicator);
      } else {
        messagesScroll.appendChild(row);
      }
    }

    function scrollToBottom() {
      messagesScroll.scrollTop = messagesScroll.scrollHeight;
    }
  }
})();
