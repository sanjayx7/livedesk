// Utility helper for safe ObjectId string comparison
function isSameId(id1, id2) {
  if (!id1 || !id2) return false;
  return String(id1) === String(id2);
}

// State Management
let socket = null;
let currentAgent = null;
let currentSessionId = null;
let sessions = [];
let agents = [];
let typingTimeout = null;

// Alarm Notification State
let audioCtx = null;
let alarmInterval = null;
let alarmTimeout = null;
let isAlarmPlaying = false;

// DOM Elements
const loginContainer = document.getElementById('login-container');
const loginForm = document.getElementById('login-form');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const loginError = document.getElementById('login-error');

const appContainer = document.getElementById('app-container');
const agentDisplayName = document.getElementById('agent-display-name');
const agentDisplayRole = document.getElementById('agent-display-role');
const agentAvatarChar = document.getElementById('agent-avatar-char');
const agentStatusCheckbox = document.getElementById('agent-status-checkbox');
const agentStatusLabel = document.getElementById('agent-status-label');
const btnLogout = document.getElementById('btn-logout');
const btnStopAlarm = document.getElementById('btn-stop-alarm');

// Navigation Tabs
const navItems = document.querySelectorAll('.nav-item');
const tabPanels = document.querySelectorAll('.tab-panel');

// Conversation Lists
const listActiveChats = document.getElementById('list-active-chats');
const listBotChats = document.getElementById('list-bot-chats');
const listClosedChats = document.getElementById('list-closed-chats');
const chatSearchInput = document.getElementById('chat-search-input');
const navChatsUnreadCount = document.getElementById('nav-chats-unread-count');

// Chat Panel
const activeChatWindow = document.getElementById('active-chat-window');
const emptyChatState = document.getElementById('empty-chat-state');
const chatWindowHeader = document.getElementById('chat-window-header');
const chatVisitorTitle = document.getElementById('chat-visitor-title');
const chatVisitorSubtitle = document.getElementById('chat-visitor-subtitle');
const chatStatusTag = document.getElementById('chat-status-tag');
const btnTakeover = document.getElementById('btn-takeover');
const btnHandoffBot = document.getElementById('btn-handoff-bot');
const btnCloseChat = document.getElementById('btn-close-chat');

const chatMessagesScroll = document.getElementById('chat-messages-scroll');
const messagesListFlow = document.getElementById('messages-list-flow');
const visitorTypingIndicator = document.getElementById('visitor-typing-indicator');

const chatInputWrapper = document.getElementById('chat-input-wrapper');
const chatComposerForm = document.getElementById('chat-composer-form');
const chatMessageInput = document.getElementById('chat-message-input');

// Visitor Details
const visitorDetailsPanel = document.getElementById('visitor-details-panel');
const detailVisitorIp = document.getElementById('detail-visitor-ip');
const detailVisitorUa = document.getElementById('detail-visitor-ua');
const detailVisitorReferrer = document.getElementById('detail-visitor-referrer');
const detailVisitorUrl = document.getElementById('detail-visitor-url');
const detailVisitorTitle = document.getElementById('detail-visitor-title');
const detailVisitorName = document.getElementById('detail-visitor-name');
const detailVisitorEmail = document.getElementById('detail-visitor-email');
const detailVisitorPhone = document.getElementById('detail-visitor-phone');
const btnBackToList = document.getElementById('btn-back-to-list');

// Projects & Themes & Dashboard UI
let activeProjectId = localStorage.getItem('ld_active_project_id') || null;
let activeDashboardRange = 'weekly'; // 'weekly' | 'monthly'

const projectDropdownSelect = document.getElementById('project-dropdown-select');
const btnCreateProjectModal = document.getElementById('btn-create-project-modal');
const settingsThemeToggle = document.getElementById('settings-theme-toggle');
const trendChartContainer = document.getElementById('trend-chart-container');
const dashboardToggleWeekly = document.getElementById('dashboard-toggle-weekly');
const dashboardToggleMonthly = document.getElementById('dashboard-toggle-monthly');

// New Tawk.to dashboard metrics
const metricTodayVisitors = document.getElementById('metric-today-visitors');
const metricActiveVisitors = document.getElementById('metric-active-visitors');
const metricTotalChats = document.getElementById('metric-total-chats');
const metricChatsActive = document.getElementById('metric-chats-active');
const metricTodayViews = document.getElementById('metric-today-views');
const metricWeekViews = document.getElementById('metric-week-views');
const dashboardHistoryTbody = document.getElementById('dashboard-history-tbody');

const settingsWidgetCodeSnippet = document.getElementById('settings-widget-code-snippet');
const btnCopyWidgetCode = document.getElementById('btn-copy-widget-code');
const copySuccessAlert = document.getElementById('copy-success-alert');

// Onboarding elements
const projectOnboardingOverlay = document.getElementById('project-onboarding-overlay');
const onboardingProjectForm = document.getElementById('onboarding-project-form');
const onboardingProjectName = document.getElementById('onboarding-project-name');

// Knowledge Base
const kbUploadForm = document.getElementById('kb-upload-form');
const kbDocTitle = document.getElementById('kb-doc-title');
const kbDocContent = document.getElementById('kb-doc-content');
const kbDocumentsList = document.getElementById('kb-documents-list');

// Settings
const settingsHoursForm = document.getElementById('settings-hours-form');
const settingsHoursEnabled = document.getElementById('settings-hours-enabled');
const settingsTimezone = document.getElementById('settings-timezone');
const settingsStartTime = document.getElementById('settings-start-time');
const settingsEndTime = document.getElementById('settings-end-time');
const dayCheckboxInputs = document.querySelectorAll('.day-checkbox-input');
const settingsSuccessAlert = document.getElementById('settings-success-alert');

const settingsBrandingForm = document.getElementById('settings-branding-form');
const settingsChatbotName = document.getElementById('settings-chatbot-name');
const settingsTeamSubtitle = document.getElementById('settings-team-subtitle');
const brandingSuccessAlert = document.getElementById('branding-success-alert');

const adminRegistrationCard = document.getElementById('admin-registration-card');
const agentRegisterForm = document.getElementById('agent-register-form');
const regUsername = document.getElementById('reg-username');
const regPassword = document.getElementById('reg-password');
const regRole = document.getElementById('reg-role');
const regSuccessAlert = document.getElementById('reg-success-alert');
const regErrorAlert = document.getElementById('reg-error-alert');

// --- AUTH & INITIALIZATION ---

function init() {
  const token = localStorage.getItem('ld_token');
  const agentInfo = localStorage.getItem('ld_agent');

  // Load and apply the saved theme
  const savedTheme = localStorage.getItem('ld_theme') || 'dark';
  document.body.classList.toggle('light-theme', savedTheme === 'light');
  if (settingsThemeToggle) {
    settingsThemeToggle.checked = (savedTheme === 'light');
  }

  if (token && agentInfo) {
    currentAgent = JSON.parse(agentInfo);
    showApp();
    connectSocket(token);
  } else {
    showLogin();
  }
}

function showLogin() {
  loginContainer.classList.remove('hidden');
  appContainer.classList.add('hidden');
}

function showApp() {
  loginContainer.classList.add('hidden');
  appContainer.classList.remove('remove', 'hidden');

  // Update Agent Details Card
  agentDisplayName.textContent = currentAgent.username;
  agentDisplayRole.textContent = currentAgent.role === 'admin' ? 'Administrator' : 'Support Agent';
  agentAvatarChar.textContent = currentAgent.username.charAt(0).toUpperCase();

  // Show Admin configuration card if admin role
  if (currentAgent.role === 'admin') {
    adminRegistrationCard.classList.remove('hidden');
  } else {
    adminRegistrationCard.classList.add('hidden');
  }

  // Load static panels data
  loadProjects();
  loadKB();
  loadSettings();
}

// Log In Action
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');

  const username = loginUsernameInput.value.trim();
  const password = loginPasswordInput.value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Login failed');
    }

    localStorage.setItem('ld_token', data.token);
    localStorage.setItem('ld_agent', JSON.stringify(data.agent));
    currentAgent = data.agent;

    showApp();
    connectSocket(data.token);
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove('hidden');
  }
});

// Logout Action
btnLogout.addEventListener('click', () => {
  if (socket) {
    socket.disconnect();
  }
  localStorage.removeItem('ld_token');
  localStorage.removeItem('ld_agent');
  currentAgent = null;
  currentSessionId = null;
  window.location.reload();
});

// --- SOCKET CONNECTOR ---

function connectSocket(token) {
  socket = io({
    auth: { token }
  });

  let isFirstConnect = true;

  socket.on('connect', () => {
    console.log("Socket connected successfully!");
    const savedStatus = localStorage.getItem('ld_agent_status') || 'online';
    const isOnline = savedStatus === 'online';
    agentStatusCheckbox.checked = isOnline;
    agentStatusLabel.textContent = isOnline ? "Online" : "Offline";
    agentStatusLabel.style.color = isOnline ? "var(--success)" : "var(--text-muted)";

    if (socket) {
      socket.emit('agent:status_toggle', { status: savedStatus });
    }
    
    // Always sync active project room on socket connect/reconnect
    if (activeProjectId) {
      socket.emit('agent:select_project', { projectId: activeProjectId });
    }

    if (!isFirstConnect) {
      // Restore active chat session room membership on reconnect
      if (currentSessionId) {
        socket.emit('agent:join_chat', { sessionId: currentSessionId });
      }
    }
    isFirstConnect = false;
  });

  socket.on('disconnect', () => {
    agentStatusCheckbox.checked = false;
    agentStatusLabel.textContent = "Offline";
    agentStatusLabel.style.color = "var(--text-muted)";
  });

  // Listeners
  socket.on('sessions:init', (data) => {
    sessions = data;
    renderSessions();
  });

  socket.on('sessions:update', (data) => {
    sessions = data;
    renderSessions();
    // Update currently open session details/status
    if (currentSessionId) {
      const activeSession = sessions.find(s => isSameId(s._id, currentSessionId));
      if (activeSession) {
        updateChatHeaderAndDetails(activeSession);
      }
    }
  });

  socket.on('agents:init', (data) => {
    agents = data;
  });

  socket.on('agents:update', (data) => {
    agents = data;
  });

  socket.on('message:new', (msg) => {
    if (currentSessionId && isSameId(msg.sessionId, currentSessionId)) {
      appendMessage(msg);
      scrollToBottom();
      socket.emit('agent:mark_read', { sessionId: currentSessionId });
      const s = sessions.find(item => isSameId(item._id, currentSessionId));
      if (s) s.unreadCount = 0;
    } else if (msg.sender === 'visitor') {
      const s = sessions.find(item => isSameId(item._id, msg.sessionId));
      if (s) {
        s.unreadCount = (s.unreadCount || 0) + 1;
      }
    }
    renderSessions();
  });

  socket.on('agent:chat_history', (data) => {
    if (currentSessionId && isSameId(data.sessionId, currentSessionId)) {
      messagesListFlow.innerHTML = '';
      data.messages.forEach(appendMessage);
      scrollToBottom();
    }
  });

  socket.on('visitor:typing_state', (isTyping) => {
    if (isTyping) {
      visitorTypingIndicator.classList.remove('hidden');
      scrollToBottom();
    } else {
      visitorTypingIndicator.classList.add('hidden');
    }
  });

  socket.on('session:status_changed', (data) => {
    const sId = data.sessionId || data.session?._id;
    if (currentSessionId && isSameId(sId, currentSessionId)) {
      const activeSession = sessions.find(s => isSameId(s._id, currentSessionId));
      if (activeSession) {
        activeSession.status = data.status;
        activeSession.assignedAgent = data.assignedAgent;
        updateChatHeaderAndDetails(activeSession);
      }
    }
    renderSessions();
  });

  socket.on('notification:new_message', (data) => {
    // Show who sent the message
    const sessionEntry = sessions.find(s => s._id === (data.sessionId?.toString?.() || data.sessionId));
    const visitorName = sessionEntry?.visitorInfo?.name || (data.visitorId ? `Visitor #${data.visitorId.substring(0, 5)}` : 'A visitor');
    showToastNotification(visitorName, data.text);
    // Play audio warning when a new visitor message arrives
    startAlarmSound();
  });

  socket.on('auth:error', (msg) => {
    alert("Authentication failure: " + msg);
    btnLogout.click();
  });
}

// Stop Alarm Button Listener
if (btnStopAlarm) {
  btnStopAlarm.addEventListener('click', () => {
    stopAlarmSound();
  });
}

// Agent Manual status toggle switch
agentStatusCheckbox.addEventListener('change', (e) => {
  const status = e.target.checked ? 'online' : 'offline';
  localStorage.setItem('ld_agent_status', status);
  if (socket) {
    socket.emit('agent:status_toggle', { status });
    agentStatusLabel.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    agentStatusLabel.style.color = status === 'online' ? 'var(--success)' : 'var(--text-muted)';
  }
});

// --- RENDER CONVERSATIONS ---

function renderSessions() {
  const searchQuery = chatSearchInput.value.toLowerCase().trim();

  // Filter sessions
  const filtered = sessions.filter(s => {
    const idStr = s.visitorId.substring(0, 8);
    const pageTitle = (s.visitorInfo?.title || '').toLowerCase();
    const lastMsgText = ''; // Can fetch last message text if needed
    return idStr.includes(searchQuery) || pageTitle.includes(searchQuery);
  });

  listActiveChats.innerHTML = '';
  listBotChats.innerHTML = '';
  listClosedChats.innerHTML = '';

  let activeCount = 0;
  let botCount = 0;
  let closedCount = 0;

  // Calculate total unread count across all sessions for main left sidebar tab badge
  const totalUnread = sessions.reduce((acc, s) => acc + (s.unreadCount || 0), 0);
  if (navChatsUnreadCount) {
    if (totalUnread > 0) {
      navChatsUnreadCount.textContent = totalUnread > 99 ? '99+' : totalUnread;
      navChatsUnreadCount.classList.remove('hidden');
    } else {
      navChatsUnreadCount.classList.add('hidden');
    }
  }

  filtered.forEach(session => {
    const unread = session.unreadCount || 0;
    const isSelected = isSameId(currentSessionId, session._id);

    const item = document.createElement('div');
    item.className = `chat-item ${isSelected ? 'selected' : ''} ${unread > 0 && !isSelected ? 'unread' : ''}`;
    item.onclick = () => selectSession(session._id);

    const initial = (session.visitorInfo?.name?.charAt(0) || session.visitorInfo?.title?.charAt(0) || 'V').toUpperCase();
    const title = session.visitorInfo?.name || `Visitor #${session.visitorId.substring(0, 5)}`;
    const pageSubtitle = session.visitorInfo?.title || 'Viewing Site';
    const relativeTime = getRelativeTime(session.updatedAt);

    const unreadBadge = unread > 0 && !isSelected
      ? `<div class="chat-unread-badge">${unread > 99 ? '99+' : unread}</div>`
      : '';

    item.innerHTML = `
      <div class="chat-item-avatar">${initial}</div>
      <div class="chat-item-info">
        <div class="chat-item-header">
          <div class="chat-item-title">${title}</div>
          <div class="chat-item-time">${relativeTime}</div>
        </div>
        <div class="chat-item-preview">${pageSubtitle}</div>
      </div>
      ${unreadBadge}
    `;

    if (session.status === 'active') {
      listActiveChats.appendChild(item);
      activeCount++;
    } else if (session.status === 'bot') {
      listBotChats.appendChild(item);
      botCount++;
    } else if (session.status === 'closed') {
      listClosedChats.appendChild(item);
      closedCount++;
    }
  });

  if (activeCount === 0) listActiveChats.innerHTML = '<div class="empty-state-list">No active chats</div>';
  if (botCount === 0) listBotChats.innerHTML = '<div class="empty-state-list">No bot chats</div>';
  if (closedCount === 0) listClosedChats.innerHTML = '<div class="empty-state-list">No closed chats</div>';
  
  // Keep dashboard history table updated in real-time
  updateDashboardHistory();
}

chatSearchInput.addEventListener('input', renderSessions);

// --- CONVERSATION SELECTION ---

function selectSession(sessionId) {
  currentSessionId = sessionId;

  // Reset unread count locally and on server
  const session = sessions.find(s => isSameId(s._id, sessionId));
  if (session && session.unreadCount > 0) {
    session.unreadCount = 0;
    if (socket) {
      socket.emit('agent:mark_read', { sessionId });
    }
  }

  // Highlight in sidebar
  renderSessions();

  if (!session) return;

  // Show active layout elements
  emptyChatState.classList.add('hidden');
  chatWindowHeader.classList.remove('hidden');
  messagesListFlow.classList.remove('hidden');
  chatInputWrapper.classList.remove('hidden');
  visitorDetailsPanel.classList.remove('hidden');
  document.querySelector('.chat-layout').classList.add('has-active-chat');

  // Load chat header details & status buttons
  updateChatHeaderAndDetails(session);

  // View full conversation history via socket (without taking over automatically)
  socket.emit('agent:view_chat', { sessionId });
  
  // Clear composer input
  chatMessageInput.value = '';
}

// --- DEVICE & GEO UTILITIES ---

function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function parseUserAgent(ua) {
  if (!ua) return { os: 'Unknown OS', osBadge: '💻', browser: 'Browser', browserBadge: '🌐' };

  let os = 'Desktop';
  let osBadge = '💻';

  if (/windows/i.test(ua)) {
    os = 'Windows';
    osBadge = '🪟';
  } else if (/macintosh|mac os/i.test(ua)) {
    os = 'macOS';
    osBadge = '🍎';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'iOS';
    osBadge = '📱';
  } else if (/android/i.test(ua)) {
    os = 'Android';
    osBadge = '📱';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
    osBadge = '🐧';
  }

  let browser = 'Browser';
  let browserBadge = '🌐';

  if (/edg/i.test(ua)) {
    browser = 'Edge';
    browserBadge = '🌊';
  } else if (/chrome|crios/i.test(ua)) {
    browser = 'Chrome';
    browserBadge = '🌐';
  } else if (/firefox|fxios/i.test(ua)) {
    browser = 'Firefox';
    browserBadge = '🦊';
  } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
    browser = 'Safari';
    browserBadge = '🧭';
  } else if (/opr\//i.test(ua)) {
    browser = 'Opera';
    browserBadge = '🔴';
  }

  return { os, osBadge, browser, browserBadge };
}

function updateChatHeaderAndDetails(session) {
  // Title & subtitle
  chatVisitorTitle.textContent = session.visitorInfo?.name || `Visitor #${session.visitorId.substring(0, 8)}`;
  chatVisitorSubtitle.textContent = `Viewing: ${session.visitorInfo?.title || 'Unknown Page'}`;

  // Tag indicator
  chatStatusTag.className = 'status-tag';
  if (session.status === 'active') {
    chatStatusTag.textContent = session.assignedAgent 
      ? `Assigned to ${session.assignedAgent.username || 'Agent'}` 
      : 'Active Agent';
    chatStatusTag.classList.add('tag-active');

    btnTakeover.classList.add('hidden');
    btnHandoffBot.classList.remove('hidden');
    btnCloseChat.classList.remove('hidden');
    chatMessageInput.disabled = false;
    chatMessageInput.placeholder = "Type a message...";
  } else if (session.status === 'bot') {
    chatStatusTag.textContent = 'Bot Mode';
    chatStatusTag.classList.add('tag-bot');

    btnTakeover.classList.remove('hidden');
    btnHandoffBot.classList.add('hidden');
    btnCloseChat.classList.add('hidden');
    chatMessageInput.disabled = true;
    chatMessageInput.placeholder = "Take over chat to reply...";
  } else if (session.status === 'closed') {
    chatStatusTag.textContent = 'Closed';
    chatStatusTag.classList.add('tag-closed');

    btnTakeover.classList.remove('hidden');
    btnHandoffBot.classList.add('hidden');
    btnCloseChat.classList.add('hidden');
    chatMessageInput.disabled = true;
    chatMessageInput.placeholder = "Conversation is closed...";
  }

  // Sidebar navigation & Geo/Device details
  const flag = getFlagEmoji(session.visitorInfo?.countryCode);
  const location = session.visitorInfo?.location || session.visitorInfo?.country || 'Local Network';
  const device = parseUserAgent(session.visitorInfo?.userAgent);

  detailVisitorIp.textContent = `${flag} ${session.visitorInfo?.ip || '127.0.0.1'} (${location})`;
  detailVisitorUa.textContent = `${device.osBadge} ${device.os} • ${device.browserBadge} ${device.browser}`;
  detailVisitorReferrer.textContent = session.visitorInfo?.referrer || 'Direct Visit';
  detailVisitorUrl.href = session.visitorInfo?.currentPage || '#';
  detailVisitorUrl.textContent = session.visitorInfo?.currentPage || '--';
  detailVisitorTitle.textContent = session.visitorInfo?.title || '--';

  if (detailVisitorName) detailVisitorName.textContent = session.visitorInfo?.name || '--';
  if (detailVisitorEmail) detailVisitorEmail.textContent = session.visitorInfo?.email || '--';
  if (detailVisitorPhone) detailVisitorPhone.textContent = session.visitorInfo?.phone || '--';
}

// Action Button Listeners
if (btnBackToList) {
  btnBackToList.addEventListener('click', () => {
    currentSessionId = null;
    document.querySelector('.chat-layout').classList.remove('has-active-chat');
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('selected'));
    emptyChatState.classList.remove('hidden');
    chatWindowHeader.classList.add('hidden');
    messagesListFlow.classList.add('hidden');
    chatInputWrapper.classList.add('hidden');
    visitorDetailsPanel.classList.add('hidden');
    renderSessions();
  });
}
btnTakeover.addEventListener('click', () => {
  if (currentSessionId) {
    socket.emit('agent:join_chat', { sessionId: currentSessionId });
  }
});

btnHandoffBot.addEventListener('click', () => {
  if (currentSessionId) {
    socket.emit('agent:handoff_bot', { sessionId: currentSessionId });
    const s = sessions.find(item => isSameId(item._id, currentSessionId));
    if (s) {
      s.status = 'bot';
      s.assignedAgent = null;
      updateChatHeaderAndDetails(s);
      renderSessions();
    }
  }
});

btnCloseChat.addEventListener('click', () => {
  if (currentSessionId) {
    if (confirm("Are you sure you want to close this chat session?")) {
      socket.emit('agent:close_chat', { sessionId: currentSessionId });
    }
  }
});

// --- MESSAGES FLOW ---

function appendMessage(msg) {
  const row = document.createElement('div');
  row.className = `message-bubble-row ${msg.sender}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = msg.text;

  row.appendChild(bubble);
  messagesListFlow.appendChild(row);
}

function scrollToBottom() {
  chatMessagesScroll.scrollTop = chatMessagesScroll.scrollHeight;
}

// Chat Send Form
chatComposerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatMessageInput.value.trim();
  if (!text || !currentSessionId) return;

  // Emit agent message
  socket.emit('agent:message', { sessionId: currentSessionId, text });
  chatMessageInput.value = '';

  // Cancel typing indicators
  if (socket) {
    socket.emit('agent:typing', { sessionId: currentSessionId, isTyping: false });
  }
});

// Typing indicator trigger for agent
chatMessageInput.addEventListener('input', () => {
  if (!socket || !currentSessionId) return;

  socket.emit('agent:typing', { sessionId: currentSessionId, isTyping: true });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('agent:typing', { sessionId: currentSessionId, isTyping: false });
  }, 1500);
});

// --- KNOWLEDGE BASE LOGIC ---

async function loadKB() {
  if (!activeProjectId) return;
  try {
    const res = await fetch(`/api/kb?projectId=${activeProjectId}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('ld_token')}`
      }
    });
    const documents = await res.json();
    renderKBDocuments(documents);
  } catch (err) {
    console.error("Error loading KB documents:", err);
  }
}

function renderKBDocuments(documents) {
  kbDocumentsList.innerHTML = '';
  if (documents.length === 0) {
    kbDocumentsList.innerHTML = `
      <div class="empty-inventory">
        <i data-lucide="file-text"></i>
        <p>No knowledge base documents indexed yet.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  documents.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'kb-item-card';

    const dateStr = new Date(doc.createdAt).toLocaleDateString();

    item.innerHTML = `
      <div class="kb-item-meta">
        <h4>${escapeHTML(doc._id)}</h4>
        <span>Indexed on ${dateStr} • ${doc.chunksCount} chunks</span>
      </div>
      <button class="btn-delete-kb" onclick="deleteKBDocument('${escapeHTML(doc._id)}')">
        <i data-lucide="trash-2"></i>
      </button>
    `;
    kbDocumentsList.appendChild(item);
  });
  lucide.createIcons();
}

// Upload KB Document
kbUploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btnSubmit = document.getElementById('btn-kb-submit');
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<i data-lucide="loader"></i> Indexing...`;
  lucide.createIcons();

  const title = kbDocTitle.value.trim();
  const content = kbDocContent.value.trim();

  try {
    const res = await fetch('/api/kb', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('ld_token')}`
      },
      body: JSON.stringify({ title, content, projectId: activeProjectId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    kbDocTitle.value = '';
    kbDocContent.value = '';
    loadKB();
  } catch (err) {
    alert("Error indexing KB document: " + err.message);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `<i data-lucide="upload-cloud"></i> Index Document`;
    lucide.createIcons();
  }
});

// Delete KB Document
window.deleteKBDocument = async function(title) {
  if (confirm(`Are you sure you want to delete the document "${title}"? This cannot be undone.`)) {
    try {
      const res = await fetch('/api/kb', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('ld_token')}`
        },
        body: JSON.stringify({ title, projectId: activeProjectId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      loadKB();
    } catch (err) {
      alert("Error deleting KB document: " + err.message);
    }
  }
};

// --- SETTINGS LOGIC ---

async function loadSettings() {
  if (!activeProjectId) return;
  try {
    const res = await fetch(`/api/settings/business-hours?projectId=${activeProjectId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ld_token')}` }
    });
    const data = await res.json();

    // Populate business hours inputs
    settingsHoursEnabled.checked = data.enabled;
    settingsTimezone.value = data.timezone;
    settingsStartTime.value = data.start;
    settingsEndTime.value = data.end;

    // Check weekday boxes
    dayCheckboxInputs.forEach(checkbox => {
      checkbox.checked = data.days.includes(parseInt(checkbox.value));
    });

    // Load branding settings
    const brandingRes = await fetch(`/api/settings/branding?projectId=${activeProjectId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ld_token')}` }
    });
    if (brandingRes.ok) {
      const brandingData = await brandingRes.json();
      if (settingsChatbotName) settingsChatbotName.value = brandingData.chatbotName || 'Nora AI';
      if (settingsTeamSubtitle) settingsTeamSubtitle.value = brandingData.teamSubtitle || 'Support Representative';
      
      const welcomeInput = document.getElementById('settings-welcome-message');
      if (welcomeInput) welcomeInput.value = brandingData.welcomeMessage || 'Hi there! 👋 How can we help you today?';

      const primaryColorInput = document.getElementById('settings-primary-color');
      const primaryColorTextInput = document.getElementById('settings-primary-color-text');
      if (primaryColorInput) {
        primaryColorInput.value = brandingData.primaryColor || '#4f46e5';
        if (primaryColorTextInput) primaryColorTextInput.value = brandingData.primaryColor || '#4f46e5';
      }

      const launcherIconSelect = document.getElementById('settings-launcher-icon');
      if (launcherIconSelect) {
        launcherIconSelect.value = brandingData.launcherIcon || 'chat';
        updateCustomDropdownUI('dropdown-launcher-icon', 'label-launcher-icon', 'menu-launcher-icon', launcherIconSelect.value);
      }

      const positionSelect = document.getElementById('settings-widget-position');
      if (positionSelect) {
        positionSelect.value = brandingData.position || 'right';
        updateCustomDropdownUI('dropdown-widget-position', 'label-widget-position', 'menu-widget-position', positionSelect.value);
      }

      const settingsQuickQuestions = document.getElementById('settings-quick-questions');
      if (settingsQuickQuestions) {
        const qList = Array.isArray(brandingData.suggestedQuestions) ? brandingData.suggestedQuestions : [];
        settingsQuickQuestions.value = qList.join('\n');
      }

      updateLivePreview();
    }
  } catch (err) {
    console.error("Error loading settings:", err);
  }
}

// Save Settings
settingsHoursForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const enabled = settingsHoursEnabled.checked;
  const timezone = settingsTimezone.value;
  const start = settingsStartTime.value;
  const end = settingsEndTime.value;

  const days = [];
  dayCheckboxInputs.forEach(checkbox => {
    if (checkbox.checked) {
      days.push(parseInt(checkbox.value));
    }
  });

  try {
    const res = await fetch('/api/settings/business-hours', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('ld_token')}`
      },
      body: JSON.stringify({
        projectId: activeProjectId,
        hours: { enabled, timezone, start, end, days }
      })
    });

    if (!res.ok) throw new Error("Failed to save settings");

    settingsSuccessAlert.classList.remove('hidden');
    setTimeout(() => settingsSuccessAlert.classList.add('hidden'), 3000);
  } catch (err) {
    alert("Error saving settings: " + err.message);
  }
});

// Save Widget Branding & Theme Settings
if (settingsBrandingForm) {
  settingsBrandingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const chatbotName = settingsChatbotName.value.trim();
    const teamSubtitle = settingsTeamSubtitle.value.trim();
    const welcomeMessage = document.getElementById('settings-welcome-message')?.value.trim() || 'Hi there! 👋 How can we help you today?';
    const primaryColor = document.getElementById('settings-primary-color')?.value || '#4f46e5';
    const launcherIcon = document.getElementById('settings-launcher-icon')?.value || 'chat';
    const position = document.getElementById('settings-widget-position')?.value || 'right';

    const settingsQuickQuestions = document.getElementById('settings-quick-questions');
    const rawQuestions = settingsQuickQuestions ? settingsQuickQuestions.value : '';
    const suggestedQuestions = rawQuestions
      .split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 0);

    const branding = {
      chatbotName,
      teamSubtitle,
      welcomeMessage,
      primaryColor,
      headerBg: primaryColor,
      launcherIcon,
      position,
      suggestedQuestions
    };

    try {
      const res = await fetch('/api/settings/branding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('ld_token')}`
        },
        body: JSON.stringify({
          projectId: activeProjectId,
          branding
        })
      });

      if (!res.ok) throw new Error("Failed to save branding settings");

      brandingSuccessAlert.classList.remove('hidden');
      setTimeout(() => brandingSuccessAlert.classList.add('hidden'), 3000);
      updateLivePreview();
    } catch (err) {
      alert("Error saving branding settings: " + err.message);
    }
  });
}

// Admin registers new agent
agentRegisterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  regSuccessAlert.classList.add('hidden');
  regErrorAlert.classList.add('hidden');

  const username = regUsername.value.trim();
  const password = regPassword.value;
  const role = regRole.value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('ld_token')}`
      },
      body: JSON.stringify({ username, password, role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Register agent failed');

    regUsername.value = '';
    regPassword.value = '';
    regSuccessAlert.classList.remove('hidden');
    setTimeout(() => regSuccessAlert.classList.add('hidden'), 3000);
  } catch (err) {
    regErrorAlert.textContent = err.message;
    regErrorAlert.classList.remove('hidden');
  }
});

// --- NAVIGATION NAVIGATION ---

navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    const tab = item.dataset.tab;
    tabPanels.forEach(panel => {
      if (panel.id === `tab-panel-${tab}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    // Refresh contents
    if (tab === 'dashboard') loadAnalytics();
    if (tab === 'chats') renderSessionList();
    if (tab === 'leads') loadLeads();
    if (tab === 'kb') loadKB();
    if (tab === 'settings') loadSettings();
  });
});

// --- LEADS DIRECTORY & FILTERING LOGIC ---
let currentLeads = [];

async function loadLeads() {
  if (!activeProjectId) return;
  initFlatpickrDatePickers();
  const token = localStorage.getItem('ld_token');
  const startDate = document.getElementById('leads-start-date')?.value || '';
  const endDate = document.getElementById('leads-end-date')?.value || '';
  const search = document.getElementById('leads-search-input')?.value || '';

  try {
    const query = new URLSearchParams({
      projectId: activeProjectId,
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(search && { search })
    });

    const res = await fetch(`/api/leads?${query.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      currentLeads = await res.json();
      renderLeadsTable(currentLeads);
    }
  } catch (err) {
    console.error("Error loading leads:", err);
  }
}

function renderLeadsTable(leads) {
  const tbody = document.getElementById('leads-table-tbody');
  const countEl = document.getElementById('leads-count-total');
  if (countEl) countEl.textContent = leads.length;
  if (!tbody) return;

  tbody.innerHTML = '';
  if (leads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-table" style="text-align: center; padding: 32px; color: var(--text-dark);">
          No leads captured matching your selected filters.
        </td>
      </tr>
    `;
    return;
  }

  leads.forEach(lead => {
    const tr = document.createElement('tr');
    const info = lead.visitorInfo || {};
    const name = info.name || 'Anonymous Visitor';
    const email = info.email || 'N/A';
    const phone = info.phone || 'N/A';
    const dateStr = new Date(lead.createdAt).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const pageUrl = info.currentPage || '#';
    const pageTitle = info.title || pageUrl;
    const location = info.city && info.country ? `${info.city}, ${info.country}` : (info.country || info.ip || 'Local Network');
    const flag = getFlagEmoji(info.countryCode);

    let statusBadge = `<span class="metric-badge trend-down">BOT</span>`;
    if (lead.status === 'active') statusBadge = `<span class="metric-badge trend-up">ACTIVE</span>`;
    else if (lead.status === 'closed') statusBadge = `<span class="metric-badge">CLOSED</span>`;

    tr.innerHTML = `
      <td><strong>${escapeHTML(name)}</strong></td>
      <td><a href="mailto:${escapeHTML(email)}" style="color: var(--primary); text-decoration: none;">${escapeHTML(email)}</a></td>
      <td>${escapeHTML(phone)}</td>
      <td><span style="font-size: 0.82rem; color: var(--text-muted);">${dateStr}</span></td>
      <td><a href="${escapeHTML(pageUrl)}" target="_blank" style="color: var(--text-main); font-size: 0.82rem;">${escapeHTML(pageTitle)}</a></td>
      <td><span style="font-size: 0.82rem;">${flag} ${escapeHTML(location)}</span></td>
      <td>${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}

function exportLeadsCSV() {
  if (currentLeads.length === 0) {
    alert("No lead data available to export.");
    return;
  }

  const headers = ["Visitor Name", "Email Address", "Phone", "Captured Date", "Landing Page URL", "City", "Country", "IP Address", "Status"];
  const rows = currentLeads.map(l => [
    `"${(l.visitorInfo?.name || '').replace(/"/g, '""')}"`,
    `"${(l.visitorInfo?.email || '').replace(/"/g, '""')}"`,
    `"${(l.visitorInfo?.phone || '').replace(/"/g, '""')}"`,
    `"${new Date(l.createdAt).toISOString()}"`,
    `"${(l.visitorInfo?.currentPage || '').replace(/"/g, '""')}"`,
    `"${(l.visitorInfo?.city || '').replace(/"/g, '""')}"`,
    `"${(l.visitorInfo?.country || '').replace(/"/g, '""')}"`,
    `"${(l.visitorInfo?.ip || '').replace(/"/g, '""')}"`,
    `"${l.status}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `livedesk_leads_${activeProjectId}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function applyLeadDatePreset(preset) {
  const startDateInput = document.getElementById('leads-start-date');
  const endDateInput = document.getElementById('leads-end-date');
  if (!startDateInput || !endDateInput) return;

  const now = new Date();
  let start = new Date();

  if (preset === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (preset === 'yesterday') {
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    startDateInput.value = start.toISOString().split('T')[0];
    endDateInput.value = end.toISOString().split('T')[0];
    loadLeads();
    return;
  } else if (preset === '7days') {
    start.setDate(now.getDate() - 7);
  } else if (preset === '30days') {
    start.setDate(now.getDate() - 30);
  } else if (preset === 'all') {
    startDateInput.value = '';
    endDateInput.value = '';
    loadLeads();
    return;
  }

  startDateInput.value = start.toISOString().split('T')[0];
  endDateInput.value = now.toISOString().split('T')[0];
  loadLeads();
}

// Setup Leads Filter Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  initFlatpickrDatePickers();

  const startDateInput = document.getElementById('leads-start-date');
  const endDateInput = document.getElementById('leads-end-date');
  const searchInput = document.getElementById('leads-search-input');
  const exportBtn = document.getElementById('btn-export-leads-csv');
  const presetBtns = document.querySelectorAll('.preset-btn');

  if (startDateInput) startDateInput.addEventListener('change', loadLeads);
  if (endDateInput) endDateInput.addEventListener('change', loadLeads);
  if (searchInput) {
    let searchDebounce = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(loadLeads, 300);
    });
  }

  if (exportBtn) exportBtn.addEventListener('click', exportLeadsCSV);

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyLeadDatePreset(btn.dataset.preset);
    });
  });
});

// --- LIVE WIDGET PREVIEW UPDATER ---
function updateLivePreview() {
  const primaryColor = document.getElementById('settings-primary-color')?.value || '#4f46e5';
  const chatbotName = settingsChatbotName?.value || 'Nora AI';
  const teamSubtitle = settingsTeamSubtitle?.value || 'Support Representative';
  const welcomeMsg = document.getElementById('settings-welcome-message')?.value || 'Hi there! 👋 How can we help you today?';
  const position = document.getElementById('settings-widget-position')?.value || 'right';
  const iconChoice = document.getElementById('settings-launcher-icon')?.value || 'chat';

  const previewHeader = document.getElementById('preview-widget-header');
  const previewSendBtn = document.getElementById('preview-send-btn');
  const previewLauncher = document.getElementById('preview-widget-launcher');
  const previewWidgetWindow = document.getElementById('preview-widget-window');
  const previewBotName = document.getElementById('preview-bot-name');
  const previewBotSub = document.getElementById('preview-bot-sub');
  const previewWelcomeBubble = document.getElementById('preview-welcome-bubble');
  const previewLauncherIcon = document.getElementById('preview-launcher-icon');

  if (previewHeader) previewHeader.style.backgroundColor = 'hsl(222, 28%, 9%)';
  if (previewSendBtn) previewSendBtn.style.backgroundColor = primaryColor;
  if (previewLauncher) {
    previewLauncher.style.backgroundColor = primaryColor;
    previewLauncher.style.boxShadow = `0 8px 24px ${primaryColor}66`;
  }
  if (previewBotName) previewBotName.textContent = chatbotName;
  if (previewBotSub) {
    previewBotSub.textContent = teamSubtitle;
    previewBotSub.style.color = primaryColor;
  }
  if (previewWelcomeBubble) previewWelcomeBubble.textContent = welcomeMsg;

  // Update visitor chat bubbles in Live Preview to match selected primary color
  document.querySelectorAll('.preview-msg.visitor').forEach(msg => {
    msg.style.backgroundColor = primaryColor;
  });

  const iconMap = { chat: '💬', bot: '🤖', sparkles: '✨', support: '🎧' };
  if (previewLauncherIcon) previewLauncherIcon.textContent = iconMap[iconChoice] || '💬';

  if (previewWidgetWindow && previewLauncher) {
    if (position === 'left') {
      previewWidgetWindow.classList.add('pos-left');
      previewLauncher.classList.add('pos-left');
    } else {
      previewWidgetWindow.classList.remove('pos-left');
      previewLauncher.classList.remove('pos-left');
    }
  }
}

// Live preview event listeners on theme controls
document.addEventListener('DOMContentLoaded', () => {
  const primaryColorInput = document.getElementById('settings-primary-color');
  const primaryColorTextInput = document.getElementById('settings-primary-color-text');
  const launcherIconSelect = document.getElementById('settings-launcher-icon');
  const positionSelect = document.getElementById('settings-widget-position');
  const welcomeInput = document.getElementById('settings-welcome-message');

  if (primaryColorInput) {
    primaryColorInput.addEventListener('input', (e) => {
      if (primaryColorTextInput) primaryColorTextInput.value = e.target.value;
      updateLivePreview();
    });
  }
  if (primaryColorTextInput) {
    primaryColorTextInput.addEventListener('input', (e) => {
      if (primaryColorInput) primaryColorInput.value = e.target.value;
      updateLivePreview();
    });
  }

  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const color = swatch.dataset.color;
      if (primaryColorInput) primaryColorInput.value = color;
      if (primaryColorTextInput) primaryColorTextInput.value = color;
      updateLivePreview();
    });
  });

  if (launcherIconSelect) launcherIconSelect.addEventListener('change', updateLivePreview);
  if (positionSelect) positionSelect.addEventListener('change', updateLivePreview);
  if (welcomeInput) welcomeInput.addEventListener('input', updateLivePreview);
  if (settingsChatbotName) settingsChatbotName.addEventListener('input', updateLivePreview);
  if (settingsTeamSubtitle) settingsTeamSubtitle.addEventListener('input', updateLivePreview);
});

// Projects Selector Change
if (projectDropdownSelect) {
  projectDropdownSelect.addEventListener('change', (e) => {
    activeProjectId = e.target.value;
    localStorage.setItem('ld_active_project_id', activeProjectId);
    
    if (socket) {
      socket.emit('agent:select_project', { projectId: activeProjectId });
    }
    
    // Refresh all active tabs
    loadAnalytics();
    loadKB();
    loadSettings();
    updateWidgetCodeSnippet();
  });
}

// Create Project Trigger
if (btnCreateProjectModal) {
  btnCreateProjectModal.addEventListener('click', async () => {
    const name = prompt("Enter a name for the new project:");
    if (!name || name.trim() === '') return;
    
    const token = localStorage.getItem('ld_token');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: name.trim() })
      });
      if (res.ok) {
        const projects = await res.json();
        renderProjectsDropdown(projects);
        
        // Auto select the new project
        const newProj = projects[projects.length - 1];
        activeProjectId = newProj.id;
        localStorage.setItem('ld_active_project_id', activeProjectId);
        if (projectDropdownSelect) {
          projectDropdownSelect.value = activeProjectId;
        }
        if (socket) {
          socket.emit('agent:select_project', { projectId: activeProjectId });
        }
        
        loadAnalytics();
        loadKB();
        loadSettings();
      }
    } catch (err) {
      console.error("Error creating project:", err);
    }
  });
}

// Load Project lists
async function loadProjects() {
  const token = localStorage.getItem('ld_token');
  try {
    const res = await fetch('/api/projects', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const projects = await res.json();
      
      if (projects.length === 0) {
        // Show onboarding overlay
        if (projectOnboardingOverlay) projectOnboardingOverlay.classList.remove('hidden');
        activeProjectId = null;
      } else {
        // Hide onboarding overlay
        if (projectOnboardingOverlay) projectOnboardingOverlay.classList.add('hidden');
        
        // Verify activeProjectId is valid, otherwise set to first project
        const activeExists = projects.find(p => p.id === activeProjectId);
        if (!activeExists) {
          activeProjectId = projects[0].id;
          localStorage.setItem('ld_active_project_id', activeProjectId);
        }
        
        renderProjectsDropdown(projects);

        // Re-sync socket to the correct project room after projects load
        // (the socket may have connected before loadProjects validated the activeProjectId)
        if (socket && socket.connected) {
          socket.emit('agent:select_project', { projectId: activeProjectId });
        }
      }
    }
  } catch (err) {
    console.error("Error loading projects:", err);
  }
}

let flatpickrStart = null;
let flatpickrEnd = null;

function initFlatpickrDatePickers() {
  if (typeof flatpickr !== 'undefined') {
    const startDateInput = document.getElementById('leads-start-date');
    const endDateInput = document.getElementById('leads-end-date');

    if (startDateInput && !flatpickrStart) {
      flatpickrStart = flatpickr(startDateInput, {
        theme: "dark",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "F j, Y",
        onChange: function() {
          loadLeads();
        }
      });
    }

    if (endDateInput && !flatpickrEnd) {
      flatpickrEnd = flatpickr(endDateInput, {
        theme: "dark",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "F j, Y",
        onChange: function() {
          loadLeads();
        }
      });
    }
  }
}

function selectProject(projId, projName) {
  activeProjectId = projId;
  localStorage.setItem('ld_active_project_id', activeProjectId);

  const labelEl = document.getElementById('project-dropdown-label');
  if (labelEl) labelEl.textContent = projName;

  if (projectDropdownSelect) projectDropdownSelect.value = projId;

  // Close dropdown menu
  const dropdownMenu = document.getElementById('project-dropdown-menu');
  const dropdownContainer = document.getElementById('project-custom-dropdown');
  if (dropdownMenu) dropdownMenu.classList.add('hidden');
  if (dropdownContainer) dropdownContainer.classList.remove('open');

  if (socket) {
    socket.emit('agent:select_project', { projectId: activeProjectId });
  }

  loadAnalytics();
  loadKB();
  loadSettings();
  loadLeads();
  updateWidgetCodeSnippet();
}

function renderProjectsDropdown(projects) {
  const container = document.getElementById('project-custom-dropdown');
  const labelEl = document.getElementById('project-dropdown-label');
  const itemsContainer = document.getElementById('project-dropdown-items');

  if (projectDropdownSelect) {
    projectDropdownSelect.innerHTML = '';
  }
  if (itemsContainer) {
    itemsContainer.innerHTML = '';
  }

  const activeProj = projects.find(p => p.id === activeProjectId) || projects[0];
  if (labelEl && activeProj) {
    labelEl.textContent = activeProj.name;
  }

  projects.forEach(p => {
    // Populate hidden select
    if (projectDropdownSelect) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === activeProjectId) opt.selected = true;
      projectDropdownSelect.appendChild(opt);
    }

    // Populate custom dropdown list
    if (itemsContainer) {
      const itemBtn = document.createElement('div');
      itemBtn.className = `custom-dropdown-item ${p.id === activeProjectId ? 'active' : ''}`;
      itemBtn.innerHTML = `
        <i data-lucide="folder"></i>
        <span>${escapeHTML(p.name)}</span>
      `;
      itemBtn.addEventListener('click', () => {
        selectProject(p.id, p.name);
      });
      itemsContainer.appendChild(itemBtn);
    }
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();

  loadAnalytics();
  loadKB();
  loadSettings();
  loadLeads();
  updateWidgetCodeSnippet();
}

// Analytics and Charts rendering
async function loadAnalytics() {
  if (!activeProjectId) return;
  const token = localStorage.getItem('ld_token');
  try {
    const res = await fetch(`/api/analytics?projectId=${activeProjectId}&range=${activeDashboardRange}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      
      // Update Tawk.to metrics cards
      if (metricTodayVisitors) metricTodayVisitors.textContent = data.totalVisits || 0;
      if (metricActiveVisitors) metricActiveVisitors.textContent = data.activeCount || 0;
      if (metricTotalChats) metricTotalChats.textContent = data.totalChats || 0;
      if (metricChatsActive) metricChatsActive.textContent = data.activeCount || 0;
      if (metricTodayViews) metricTodayViews.textContent = Math.round((data.totalVisits || 0) * 1.5);
      if (metricWeekViews) metricWeekViews.textContent = Math.round((data.totalVisits || 0) * 6.5);
      
      renderTrendChart(data.chartData);
      updateDashboardHistory();
    }
  } catch (err) {
    console.error("Error loading analytics:", err);
  }
}

function renderTrendChart(chartData) {
  if (!trendChartContainer) return;
  trendChartContainer.innerHTML = '';
  
  if (!chartData || chartData.length === 0) {
    trendChartContainer.innerHTML = '<div class="empty-state-list">No data available</div>';
    return;
  }
  
  const maxCount = Math.max(...chartData.map(d => d.count), 1);
  
  chartData.forEach(d => {
    const barWrapper = document.createElement('div');
    barWrapper.className = 'chart-bar-wrapper';
    
    const heightPercent = (d.count / maxCount) * 100;
    
    barWrapper.innerHTML = `
      <div class="chart-bar" style="height: ${Math.max(heightPercent, 5)}%">
        <span class="chart-bar-tooltip">${d.count} visits</span>
      </div>
      <span class="chart-bar-label">${d.label}</span>
    `;
    
    trendChartContainer.appendChild(barWrapper);
  });
}

// Weekly / Monthly switches
if (dashboardToggleWeekly) {
  dashboardToggleWeekly.addEventListener('click', () => {
    dashboardToggleWeekly.classList.add('active');
    dashboardToggleMonthly.classList.remove('active');
    activeDashboardRange = 'weekly';
    loadAnalytics();
  });
}

if (dashboardToggleMonthly) {
  dashboardToggleMonthly.addEventListener('click', () => {
    dashboardToggleMonthly.classList.add('active');
    dashboardToggleWeekly.classList.remove('active');
    activeDashboardRange = 'monthly';
    loadAnalytics();
  });
}

// Theme settings switch
if (settingsThemeToggle) {
  settingsThemeToggle.addEventListener('change', (e) => {
    const theme = e.target.checked ? 'light' : 'dark';
    document.body.classList.toggle('light-theme', theme === 'light');
    localStorage.setItem('ld_theme', theme);
  });
}

// Onboarding Project Form Submit
if (onboardingProjectForm) {
  onboardingProjectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = onboardingProjectName.value.trim();
    if (!name) return;

    const token = localStorage.getItem('ld_token');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        const projects = await res.json();

        // Hide onboarding overlay
        if (projectOnboardingOverlay) projectOnboardingOverlay.classList.add('hidden');

        // Select the newly created project
        const newProj = projects[projects.length - 1];
        activeProjectId = newProj.id;
        localStorage.setItem('ld_active_project_id', activeProjectId);

        renderProjectsDropdown(projects);

        if (socket) {
          socket.emit('agent:select_project', { projectId: activeProjectId });
        }
      }
    } catch (err) {
      console.error("Error creating onboarding project:", err);
    }
  });
}

// Visitor Session History Renderer
function updateDashboardHistory() {
  if (!dashboardHistoryTbody) return;
  dashboardHistoryTbody.innerHTML = '';

  const recentSessions = sessions.slice(0, 10);

  if (recentSessions.length === 0) {
    dashboardHistoryTbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-dark); padding: 24px;">
          No visitor sessions recorded for this project yet.
        </td>
      </tr>
    `;
    return;
  }

  recentSessions.forEach(s => {
    const tr = document.createElement('tr');
    const name = s.visitorInfo?.name || `Visitor #${s.visitorId.substring(0, 8)}`;
    const pageTitle = s.visitorInfo?.title || 'Viewing Site';
    const pageUrl = s.visitorInfo?.currentPage || '#';
    const lastActive = getRelativeTime(s.updatedAt);
    
    const flag = getFlagEmoji(s.visitorInfo?.countryCode);
    const country = s.visitorInfo?.country || s.visitorInfo?.location || 'Local Network';
    const ip = s.visitorInfo?.ip || '127.0.0.1';
    const device = parseUserAgent(s.visitorInfo?.userAgent);

    let statusClass = 'metric-badge trend-down';
    if (s.status === 'active') statusClass = 'metric-badge trend-up';
    else if (s.status === 'bot') statusClass = 'metric-badge';

    const agentName = s.assignedAgent ? (s.assignedAgent.username || 'Agent') : 'AI Chatbot';

    tr.innerHTML = `
      <td><strong>${flag} ${escapeHTML(name)}</strong></td>
      <td>
        <span style="font-weight: 500;">${escapeHTML(country)}</span><br>
        <small style="color: var(--text-dark); font-family: monospace;">${escapeHTML(ip)}</small>
      </td>
      <td>
        <span>${device.osBadge} ${escapeHTML(device.os)}</span> &bull; 
        <span>${device.browserBadge} ${escapeHTML(device.browser)}</span>
      </td>
      <td><span class="${statusClass}">${s.status.toUpperCase()}</span></td>
      <td>
        <span>${lastActive}</span><br>
        <small style="color: var(--text-dark);">Assigned: <strong>${escapeHTML(agentName)}</strong></small>
      </td>
    `;
    dashboardHistoryTbody.appendChild(tr);
  });
}

// --- ALARM SOUND FUNCTIONS ---

// Show notification toast with visitor name and message preview
function showToastNotification(visitorName, messageText) {
  // Remove existing toast if any
  const existingToast = document.getElementById('ld-notification-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.id = 'ld-notification-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-left: 4px solid var(--primary);
    border-radius: var(--border-radius-md);
    padding: 14px 18px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    z-index: 9999;
    max-width: 300px;
    min-width: 220px;
    animation: slideInToast 0.3s ease-out;
    cursor: pointer;
  `;
  const preview = messageText ? (messageText.length > 60 ? messageText.substring(0, 57) + '...' : messageText) : 'New message';
  toast.innerHTML = `
    <div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:4px;">💬 New message</div>
    <div style="font-weight:700; color:var(--text-main); margin-bottom:4px;">${escapeHTML(visitorName)}</div>
    <div style="font-size:0.85rem; color:var(--text-dark);">${escapeHTML(preview)}</div>
  `;
  toast.addEventListener('click', () => {
    // Try to find and open this session
    const matchedSession = sessions.find(s => {
      const name = s.visitorInfo?.name || `Visitor #${s.visitorId.substring(0, 5)}`;
      return name === visitorName;
    });
    if (matchedSession) {
      selectSession(matchedSession._id);
      // Switch to chats tab
      document.querySelector('[data-tab="chats"]')?.click();
    }
    toast.remove();
  });

  document.body.appendChild(toast);

  // Auto-remove after 6 seconds
  setTimeout(() => toast.remove(), 6000);
}

function startAlarmSound() {
  if (isAlarmPlaying) return;
  isAlarmPlaying = true;
  
  if (btnStopAlarm) {
    btnStopAlarm.classList.remove('hidden');
  }
  
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  const playBeep = () => {
    try {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, audioCtx.currentTime); // High pitch alert beep
      
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (err) {
      console.warn("Could not play alarm sound:", err);
    }
  };
  
  // Play first beep immediately
  playBeep();
  
  // Pulse every 600ms
  alarmInterval = setInterval(playBeep, 600);
  
  // Auto stop after 5000ms (5 seconds)
  alarmTimeout = setTimeout(() => {
    stopAlarmSound();
  }, 5000);
}

function stopAlarmSound() {
  isAlarmPlaying = false;
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  if (alarmTimeout) {
    clearTimeout(alarmTimeout);
    alarmTimeout = null;
  }
  if (btnStopAlarm) {
    btnStopAlarm.classList.add('hidden');
  }
}

// --- GENERAL UTILITIES ---

function getRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Trigger initial setup
init();
lucide.createIcons();

// Update widget embed code snippet block
function updateWidgetCodeSnippet() {
  if (!settingsWidgetCodeSnippet) return;
  const origin = window.location.origin;
  const pid = activeProjectId || 'YOUR_PROJECT_ID';
  const code = `<script id="livedesk-widget-script" src="${origin}/widget/widget.js?project=${pid}"></script>`;
  settingsWidgetCodeSnippet.textContent = code;
}

// Copy embed code button click listener
if (btnCopyWidgetCode) {
  btnCopyWidgetCode.addEventListener('click', () => {
    const codeText = settingsWidgetCodeSnippet.textContent;
    navigator.clipboard.writeText(codeText).then(() => {
      copySuccessAlert.classList.remove('hidden');
      setTimeout(() => copySuccessAlert.classList.add('hidden'), 3000);
    }).catch(err => {
      console.error("Failed to copy code snippet:", err);
    });
  });
}

// Universal Custom Dropdown Component System
function setupCustomSelectDropdown(containerId, triggerId, menuId, labelId, selectId, onChangeCallback) {
  const container = document.getElementById(containerId);
  const trigger = document.getElementById(triggerId);
  const menu = document.getElementById(menuId);
  const label = document.getElementById(labelId);
  const select = document.getElementById(selectId);

  if (!container || !trigger || !menu || !select) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.custom-dropdown-menu').forEach(m => {
      if (m !== menu) m.classList.add('hidden');
    });
    document.querySelectorAll('.custom-dropdown-container').forEach(c => {
      if (c !== container) c.classList.remove('open');
    });

    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
      menu.classList.remove('hidden');
      container.classList.add('open');
    } else {
      menu.classList.add('hidden');
      container.classList.remove('open');
    }
  });

  menu.querySelectorAll('.custom-dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      const val = item.dataset.value;
      const text = item.textContent.trim();

      select.value = val;
      if (label) label.textContent = text;

      menu.querySelectorAll('.custom-dropdown-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      menu.classList.add('hidden');
      container.classList.remove('open');

      select.dispatchEvent(new Event('change'));
      if (onChangeCallback) onChangeCallback(val);
    });
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      menu.classList.add('hidden');
      container.classList.remove('open');
    }
  });
}

function updateCustomDropdownUI(containerId, labelId, menuId, val) {
  const menu = document.getElementById(menuId);
  const label = document.getElementById(labelId);
  if (!menu) return;

  menu.querySelectorAll('.custom-dropdown-item').forEach(item => {
    if (item.dataset.value === val) {
      item.classList.add('active');
      if (label) label.textContent = item.textContent.trim();
    } else {
      item.classList.remove('active');
    }
  });
}

// Custom Project Selector Dropdown Toggle & Outside Click Listener
document.addEventListener('DOMContentLoaded', () => {
  const triggerBtn = document.getElementById('project-dropdown-trigger');
  const dropdownMenu = document.getElementById('project-dropdown-menu');
  const dropdownContainer = document.getElementById('project-custom-dropdown');
  const btnCreateProjectDropdown = document.getElementById('btn-create-project-dropdown');

  if (triggerBtn && dropdownMenu) {
    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = dropdownMenu.classList.contains('hidden');
      if (isHidden) {
        dropdownMenu.classList.remove('hidden');
        if (dropdownContainer) dropdownContainer.classList.add('open');
      } else {
        dropdownMenu.classList.add('hidden');
        if (dropdownContainer) dropdownContainer.classList.remove('open');
      }
    });
  }

  if (btnCreateProjectDropdown) {
    btnCreateProjectDropdown.addEventListener('click', () => {
      if (btnCreateProjectModal) btnCreateProjectModal.click();
      if (dropdownMenu) dropdownMenu.classList.add('hidden');
      if (dropdownContainer) dropdownContainer.classList.remove('open');
    });
  }

  document.addEventListener('click', (e) => {
    if (dropdownContainer && !dropdownContainer.contains(e.target)) {
      if (dropdownMenu) dropdownMenu.classList.add('hidden');
      dropdownContainer.classList.remove('open');
    }
  });

  // Setup custom dropdowns for theme and settings forms
  setupCustomSelectDropdown('dropdown-launcher-icon', 'trigger-launcher-icon', 'menu-launcher-icon', 'label-launcher-icon', 'settings-launcher-icon', () => updateLivePreview());
  setupCustomSelectDropdown('dropdown-widget-position', 'trigger-widget-position', 'menu-widget-position', 'label-widget-position', 'settings-widget-position', () => updateLivePreview());
  setupCustomSelectDropdown('dropdown-timezone', 'trigger-timezone', 'menu-timezone', 'label-timezone', 'settings-timezone');
  setupCustomSelectDropdown('dropdown-reg-role', 'trigger-reg-role', 'menu-reg-role', 'label-reg-role', 'reg-role');
});
