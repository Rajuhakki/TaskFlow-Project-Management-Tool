let currentUser = null;
let authToken = localStorage.getItem('flowboard_token') || null;
let projects = [];
let currentProjectId = null;
let currentProject = null;
let currentTasks = [];
let socket = null;

// Initialize app on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  if (authToken) {
    await fetchUserProfile();
  } else {
    showAuthScreen();
  }
});

// Fetch current user profile to validate token
async function fetchUserProfile() {
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      currentUser = data.user;
      showDashboardScreen();
      initSocket();
    } else {
      logout();
    }
  } catch (err) {
    console.error('Profile fetch failed:', err);
    logout();
  }
}

// Navigation & Auth Tabs
function switchAuthTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const tabRegisterBtn = document.getElementById('tabRegisterBtn');

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    tabLoginBtn.classList.add('active');
    tabRegisterBtn.classList.remove('active');
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    tabLoginBtn.classList.remove('active');
    tabRegisterBtn.classList.add('active');
  }
}

function showAuthScreen() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('dashboardScreen').classList.add('hidden');
  document.getElementById('userNav').innerHTML = '';
}

let unreadNotificationsCount = 0;

function showDashboardScreen() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('dashboardScreen').classList.remove('hidden');

  renderHeaderUserNav();
  loadProjects();
  fetchNotifications();
}

function renderHeaderUserNav() {
  const initials = currentUser ? currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase() : '?';
  const badgeStyle = unreadNotificationsCount > 0 ? 'display: inline-block;' : 'display: none;';

  document.getElementById('userNav').innerHTML = `
    <button class="btn btn-secondary btn-sm" onclick="openNotificationsModal()" style="position: relative;" title="Notifications">
      🔔
      <span id="navUnreadBadge" style="position: absolute; top: -5px; right: -5px; background: var(--danger); color: white; border-radius: 10px; padding: 1px 6px; font-size: 0.7rem; font-weight: 700; ${badgeStyle}">${unreadNotificationsCount}</span>
    </button>
    <div class="user-badge">
      <div class="avatar-small">${initials}</div>
      <span>${currentUser ? currentUser.name : ''}</span>
    </div>
    <button class="btn btn-secondary btn-sm" onclick="logout()">Logout</button>
  `;
}

async function fetchNotifications() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/notifications', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      unreadNotificationsCount = data.unreadCount || 0;
      renderHeaderUserNav();
      return data;
    }
  } catch (err) {
    console.error('Fetch notifications error:', err);
  }
}

async function openNotificationsModal() {
  openModal('notificationsModal');
  await renderNotificationsList();
}

async function renderNotificationsList() {
  const data = await fetchNotifications();
  const listEl = document.getElementById('notificationsList');
  const modalBadge = document.getElementById('modalUnreadBadge');

  if (modalBadge) modalBadge.textContent = unreadNotificationsCount;

  if (!data || !data.notifications || data.notifications.length === 0) {
    listEl.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 1.5rem;">No notifications</div>';
    return;
  }

  listEl.innerHTML = data.notifications.map(n => {
    const icon = n.type === 'task_assigned' ? '📌' : '💬';
    const senderName = n.sender ? n.sender.name : 'System';
    const timeStr = new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(n.createdAt).toLocaleDateString();
    const bgStyle = n.isRead ? 'rgba(15,23,42,0.4)' : 'rgba(59,130,246,0.12)';
    const borderStyle = n.isRead ? 'var(--border-color)' : 'rgba(59,130,246,0.4)';

    return `
      <div style="background: ${bgStyle}; border: 1px solid ${borderStyle}; border-radius: 8px; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.4rem;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">${icon} ${senderName}</span>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 0.75rem; color: var(--text-secondary);">${timeStr}</span>
            ${!n.isRead ? `<button class="btn btn-secondary btn-sm" style="font-size: 0.7rem; padding: 2px 6px;" onclick="markNotificationAsRead('${n._id}')">Check</button>` : ''}
            <button class="btn btn-danger btn-sm" style="font-size: 0.7rem; padding: 2px 6px;" onclick="deleteNotificationItem('${n._id}')">🗑</button>
          </div>
        </div>
        <div style="font-size: 0.88rem; color: var(--text-primary);">${n.message}</div>
      </div>
    `;
  }).join('');
}

async function markNotificationAsRead(id) {
  try {
    const res = await fetch(`/api/notifications/${id}/read`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      await renderNotificationsList();
    }
  } catch (err) {
    console.error('Mark as read error:', err);
  }
}

async function markAllNotificationsAsRead() {
  try {
    const res = await fetch('/api/notifications/read-all', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      await renderNotificationsList();
    }
  } catch (err) {
    console.error('Mark all read error:', err);
  }
}

async function deleteNotificationItem(id) {
  try {
    const res = await fetch(`/api/notifications/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      await renderNotificationsList();
    }
  } catch (err) {
    console.error('Delete notification error:', err);
  }
}

function logout() {
  localStorage.removeItem('flowboard_token');
  authToken = null;
  currentUser = null;
  showAuthScreen();
}

// Auth Actions
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      authToken = data.token;
      localStorage.setItem('flowboard_token', authToken);
      currentUser = data.user;
      showDashboardScreen();
    } else {
      showAlert('authAlert', data.message || 'Login failed', 'error');
    }
  } catch (err) {
    showAlert('authAlert', 'Network error. Please try again.', 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      // Auto login after register
      document.getElementById('loginEmail').value = email;
      document.getElementById('loginPassword').value = password;
      await handleLogin(e);
    } else {
      showAlert('authAlert', data.message || 'Registration failed', 'error');
    }
  } catch (err) {
    showAlert('authAlert', 'Network error during registration', 'error');
  }
}

// Load Projects
async function loadProjects() {
  try {
    const res = await fetch('/api/projects', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.ok && data.projects) {
      projects = data.projects;
      renderProjectSelect();
      if (projects.length > 0) {
        switchProject(projects[0]._id);
      } else {
        currentProjectId = null;
        renderEmptyState();
      }
    }
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

function renderProjectSelect() {
  const select = document.getElementById('projectSelect');
  if (projects.length === 0) {
    select.innerHTML = '<option value="">No Projects Found</option>';
    return;
  }
  select.innerHTML = projects.map(p => 
    `<option value="${p._id}" ${p._id === currentProjectId ? 'selected' : ''}>${p.name}</option>`
  ).join('');
}

function initSocket() {
  if (typeof io === 'undefined') return;
  if (!socket) {
    socket = io();
    window.socket = socket;
    if (window.setAppSocket) {
      window.setAppSocket(socket);
    }

    socket.on('connect', () => {
      if (currentUser) {
        socket.emit('join_user', currentUser._id);
      }
      if (currentProjectId) {
        socket.emit('join_project', currentProjectId);
      }
    });

    socket.on('task_assigned', (data) => {
      showAlert('dashAlert', `📌 ${data.message}`, 'success');
      fetchNotifications();
    });

    socket.on('new_comment', (data) => {
      if (activeCommentsTaskId && activeCommentsTaskId === data.taskId) {
        loadComments(data.taskId);
      }
      fetchNotifications();
    });

    socket.on('task_updated', (data) => {
      if (currentProjectId && data.projectId === currentProjectId) {
        loadTasks(currentProjectId);
      }
      if (typeof isAnalyticsMode !== 'undefined' && isAnalyticsMode) {
        loadAnalyticsData();
      }
    });

    socket.on('new_message', (data) => {
      if (currentProjectId && data.projectId === currentProjectId) {
        appendChatMessage(data.message);
      }
    });

    socket.on('user_typing', (data) => {
      if (currentProjectId && data.projectId === currentProjectId && currentUser && data.userName !== currentUser.name) {
        const typingEl = document.getElementById('chatTypingIndicator');
        if (typingEl) typingEl.textContent = `✍️ ${data.userName} is typing...`;
        const commTypingEl = document.getElementById('commTypingIndicator');
        if (commTypingEl) commTypingEl.textContent = `✍️ ${data.userName} is typing...`;
      }
    });

    socket.on('user_stop_typing', (data) => {
      if (currentProjectId && data.projectId === currentProjectId) {
        const typingEl = document.getElementById('chatTypingIndicator');
        if (typingEl) typingEl.textContent = '';
        const commTypingEl = document.getElementById('commTypingIndicator');
        if (commTypingEl) commTypingEl.textContent = '';
      }
    });

    // Online / Offline Status Events
    socket.on('user_online', (data) => {
      if (data.onlineUsers) {
        onlineUsersSet = new Set(data.onlineUsers.map(id => id.toString()));
        renderCommMembersList();
      }
    });

    socket.on('user_offline', (data) => {
      if (data.onlineUsers) {
        onlineUsersSet = new Set(data.onlineUsers.map(id => id.toString()));
        renderCommMembersList();
      }
    });

    socket.on('online_users_list', (list) => {
      if (list) {
        onlineUsersSet = new Set(list.map(id => id.toString()));
        renderCommMembersList();
      }
    });

    socket.on('receive_message', (data) => {
      if (currentProjectId && data.projectId === currentProjectId) {
        appendCommChatMessage(data.message);
      }
    });

    // WebRTC Video Call Signaling Events
    socket.on('incoming_call', (data) => {
      incomingCallData = data;
      if (data.fromSocketId) {
        activeCallPeerSocketId = data.fromSocketId;
      }
      const modalName = document.getElementById('incomingCallName');
      if (modalName) modalName.textContent = `📹 Incoming Call from ${data.fromName || 'Teammate'}`;
      openModal('incomingCallModal');
    });

    socket.on('call_accepted', async (data) => {
      if (data.fromSocketId) {
        activeCallPeerSocketId = data.fromSocketId;
      }
      if (peerConnection && data.signal) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
        
        // Send any pending ICE candidates now that peer socket ID is confirmed
        if (activeCallPeerSocketId && pendingIceCandidates.length > 0) {
          pendingIceCandidates.forEach(cand => {
            socket.emit('ice_candidate', { candidate: cand, to: activeCallPeerSocketId });
          });
          pendingIceCandidates = [];
        }

        const overlay = document.getElementById('remoteVideoOverlay');
        if (overlay) overlay.style.display = 'none';
        const timer = document.getElementById('callDurationTimer');
        if (timer) timer.textContent = '🟢 Connected';
      }
    });

    socket.on('ice_candidate', async (data) => {
      if (peerConnection && data.candidate) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error('Add ICE candidate error:', err);
        }
      }
    });

    socket.on('call_ended', () => {
      closeCallCleanly();
      showAlert('dashAlert', 'Call ended by peer', 'info');
    });

    socket.on('call_failed', (data) => {
      closeCallCleanly();
      showAlert('dashAlert', data.message || 'Call failed', 'error');
    });
  } else {
    if (currentUser) socket.emit('join_user', currentUser._id);
    if (currentProjectId) socket.emit('join_project', currentProjectId);
  }
}

function switchProject(projectId) {
  if (!projectId) return;
  if (socket && currentProjectId) {
    socket.emit('leave_project', currentProjectId);
  }

  currentProjectId = projectId;
  currentProject = projects.find(p => p._id === projectId);

  if (socket) {
    socket.emit('join_project', currentProjectId);
  }

  renderProjectMeta();
  loadTasks(projectId);
}

function renderProjectMeta() {
  if (!currentProject) return;
  const memberContainer = document.getElementById('memberAvatars');
  const taskAssigneeSelect = document.getElementById('taskAssignee');

  const membersList = currentProject.members.map(m => {
    const u = m.user || m;
    const role = m.role || (currentProject.createdBy && (currentProject.createdBy._id || currentProject.createdBy) === u._id ? 'admin' : 'member');
    return { user: u, role };
  });

  memberContainer.innerHTML = membersList.map(m => {
    const u = m.user;
    const initials = u.name ? u.name.split(' ').map(n => n[0]).join('').toUpperCase() : '?';
    const roleLabel = m.role === 'admin' ? '⭐ Admin' : '👤 Member';
    const borderStyle = m.role === 'admin' ? 'border: 2px solid var(--badge-todo);' : '';
    return `<div class="member-avatar-chip" style="${borderStyle}" title="${u.name} (${u.email}) - ${roleLabel}">${initials}</div>`;
  }).join('');

  // Populate task assignee dropdown
  taskAssigneeSelect.innerHTML = '<option value="">Unassigned</option>' + 
    membersList.map(m => `<option value="${m.user._id}">${m.user.name} (${m.role})</option>`).join('');
}

// Load Tasks
async function loadTasks(projectId) {
  try {
    const res = await fetch(`/api/tasks/${projectId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.ok && data.tasks) {
      currentTasks = data.tasks;
      renderKanbanBoard();
    }
  } catch (err) {
    console.error('Failed to load tasks:', err);
  }
}

function renderKanbanBoard() {
  const colTodo = document.getElementById('colTodo');
  const colInProgress = document.getElementById('colInProgress');
  const colDone = document.getElementById('colDone');

  const todoTasks = currentTasks.filter(t => t.status === 'todo');
  const progressTasks = currentTasks.filter(t => t.status === 'in-progress');
  const doneTasks = currentTasks.filter(t => t.status === 'done');

  document.getElementById('countTodo').textContent = todoTasks.length;
  document.getElementById('countInProgress').textContent = progressTasks.length;
  document.getElementById('countDone').textContent = doneTasks.length;

  colTodo.innerHTML = todoTasks.length > 0
    ? todoTasks.map(t => renderTaskCard(t)).join('')
    : '<div class="empty-column-placeholder">📄<span>No tasks to do</span></div>';

  colInProgress.innerHTML = progressTasks.length > 0
    ? progressTasks.map(t => renderTaskCard(t)).join('')
    : '<div class="empty-column-placeholder">⚡<span>No tasks in progress</span></div>';

  colDone.innerHTML = doneTasks.length > 0
    ? doneTasks.map(t => renderTaskCard(t)).join('')
    : '<div class="empty-column-placeholder">🎉<span>No completed tasks yet</span></div>';
}

let isMyTasksMode = false;

async function toggleMyTasks() {
  const btn = document.getElementById('btnMyTasks');
  isMyTasksMode = !isMyTasksMode;

  if (isMyTasksMode) {
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = '📋 All Project Tasks';
    await loadMyTasks();
  } else {
    btn.className = 'btn btn-secondary btn-sm';
    btn.textContent = '👤 My Tasks Only';
    if (currentProjectId) {
      await loadTasks(currentProjectId);
    }
  }
}

async function loadMyTasks() {
  try {
    const res = await fetch('/api/tasks/my-tasks', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.ok && data.tasks) {
      currentTasks = data.tasks;
      renderKanbanBoard();
    }
  } catch (err) {
    console.error('Failed to load my tasks:', err);
  }
}

let draggedTaskId = null;

function handleDragStart(e, taskId) {
  draggedTaskId = taskId;
  e.dataTransfer.setData('text/plain', taskId);
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (e.currentTarget && e.currentTarget.classList) {
    e.currentTarget.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  if (e.currentTarget && e.currentTarget.classList) {
    e.currentTarget.classList.remove('drag-over');
  }
}

async function handleDrop(e, targetStatus) {
  e.preventDefault();
  if (e.currentTarget && e.currentTarget.classList) {
    e.currentTarget.classList.remove('drag-over');
  }
  if (!draggedTaskId) return;
  await moveTask(draggedTaskId, targetStatus);
  draggedTaskId = null;
}

function renderTaskCard(task) {
  const assignedId = task.assignedTo ? task.assignedTo._id : '';

  // Options for assignment dropdown
  let memberOptions = '<option value="">Unassigned</option>';
  if (currentProject && currentProject.members) {
    memberOptions += currentProject.members.map(m => {
      const u = m.user || m;
      const role = m.role || 'member';
      return `<option value="${u._id}" ${u._id === assignedId ? 'selected' : ''}>${u.name} (${role})</option>`;
    }).join('');
  }

  const statusClass = `status-${task.status}`;

  return `
    <div class="task-card ${statusClass}" draggable="true" ondragstart="handleDragStart(event, '${task._id}')" style="cursor: grab;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.6rem;">
        <div class="task-card-title">${task.title}</div>
        <select style="background: rgba(9,13,22,0.8); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.72rem; padding: 2px 6px; outline: none; font-weight: 600;" onchange="moveTask('${task._id}', this.value)">
          <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>To Do</option>
          <option value="in-progress" ${task.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
          <option value="done" ${task.status === 'done' ? 'selected' : ''}>Done</option>
        </select>
      </div>

      ${task.description ? `<div class="task-card-desc">${task.description}</div>` : ''}

      <div style="font-size: 0.76rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.4rem; margin-top: 2px;">
        <span>📂</span> <strong style="color: var(--text-secondary); font-weight: 600;">${task.project ? task.project.name || 'Project' : 'Project'}</strong>
      </div>

      <div class="task-card-footer">
        <div class="assigned-badge">
          <span>👤</span>
          <select style="background: transparent; color: var(--text-primary); border: none; font-size: 0.78rem; outline: none; cursor: pointer; font-weight: 600;" onchange="reassignTask('${task._id}', this.value)">
            ${memberOptions}
          </select>
        </div>
        <div class="task-actions">
          <button class="btn btn-secondary btn-sm" onclick="openCommentsModal('${task._id}', '${task.title.replace(/'/g, "\\'")}')" title="Comments & AI Summary">💬 Comments & AI</button>
          ${task.status !== 'todo' ? `<button class="btn btn-secondary btn-sm" onclick="moveTask('${task._id}', 'todo')" title="Move to To Do">◀</button>` : ''}
          ${task.status !== 'in-progress' ? `<button class="btn btn-secondary btn-sm" onclick="moveTask('${task._id}', 'in-progress')" title="Move to In Progress">⚡</button>` : ''}
          ${task.status !== 'done' ? `<button class="btn btn-secondary btn-sm" onclick="moveTask('${task._id}', 'done')" title="Move to Done">✔</button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteTask('${task._id}')" title="Delete Task">🗑</button>
        </div>
      </div>
    </div>
  `;
}

let activeCommentsTaskId = null;

async function openCommentsModal(taskId, taskTitle) {
  activeCommentsTaskId = taskId;
  document.getElementById('commentsModalTaskTitle').textContent = `Comments: ${taskTitle}`;

  // Check if AI summary exists in local task state
  const task = currentTasks.find(t => t._id === taskId);
  const summaryContent = document.getElementById('aiSummaryContent');
  const btn = document.getElementById('btnGenerateAiSummary');

  if (task && task.aiSummary && task.aiSummary.trim() !== '') {
    summaryContent.textContent = task.aiSummary;
    btn.textContent = '🔄 Regenerate';
  } else {
    summaryContent.textContent = 'Click "Generate Summary" to analyze task details and discussion comments into key bullet points.';
    btn.textContent = '✨ Generate Summary';
  }

  openModal('taskCommentsModal');
  await loadComments(taskId);
}

async function triggerAiSummary() {
  if (!activeCommentsTaskId) return;

  const btn = document.getElementById('btnGenerateAiSummary');
  const summaryContent = document.getElementById('aiSummaryContent');

  btn.disabled = true;
  btn.textContent = '⏳ Generating...';
  summaryContent.innerHTML = '<span style="color: var(--accent-indigo); font-style: italic;">🤖 Analyzing task details and discussion comments thread...</span>';

  try {
    const res = await fetch(`/api/tasks/${activeCommentsTaskId}/summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });
    const data = await res.json();

    if (res.ok && data.summary) {
      summaryContent.textContent = data.summary;
      btn.textContent = '🔄 Regenerate';
      // Update local task state
      const task = currentTasks.find(t => t._id === activeCommentsTaskId);
      if (task) task.aiSummary = data.summary;
    } else {
      summaryContent.textContent = `❌ ${data.message || 'Failed to generate AI summary'}`;
      btn.textContent = '✨ Try Again';
    }
  } catch (err) {
    console.error('Trigger AI summary error:', err);
    summaryContent.textContent = '❌ Network error generating AI summary';
    btn.textContent = '✨ Try Again';
  } finally {
    btn.disabled = false;
  }
}

async function loadComments(taskId) {
  const container = document.getElementById('commentsList');
  container.innerHTML = '<div style="color: var(--text-secondary); text-align: center;">Loading comments...</div>';

  try {
    const res = await fetch(`/api/comments/${taskId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.ok && data.comments) {
      if (data.comments.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary); text-align: center; font-size: 0.88rem;">No comments yet. Be the first to comment!</div>';
        return;
      }
      container.innerHTML = data.comments.map(c => {
        const authorName = c.user ? c.user.name : 'Unknown User';
        const isOwner = currentUser && c.user && (c.user._id === currentUser._id || c.user === currentUser._id);
        const timeStr = new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(c.createdAt).toLocaleDateString();

        return `
          <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.3rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.85rem; font-weight: 600; color: var(--accent-blue);">👤 ${authorName}</span>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 0.75rem; color: var(--text-secondary);">${timeStr}</span>
                ${isOwner ? `<button class="btn btn-danger btn-sm" style="padding: 1px 4px; font-size: 0.7rem;" onclick="deleteComment('${c._id}')">🗑</button>` : ''}
              </div>
            </div>
            <div style="font-size: 0.9rem; color: var(--text-primary); white-space: pre-wrap;">${c.text}</div>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = `<div style="color: var(--danger); text-align: center;">${data.message || 'Error loading comments'}</div>`;
    }
  } catch (err) {
    console.error('Error loading comments:', err);
    container.innerHTML = '<div style="color: var(--danger); text-align: center;">Network error loading comments</div>';
  }
}

async function handlePostComment(e) {
  e.preventDefault();
  if (!activeCommentsTaskId) return;

  const textInput = document.getElementById('commentTextInput');
  const text = textInput.value;

  try {
    const res = await fetch(`/api/comments/${activeCommentsTaskId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      textInput.value = '';
      await loadComments(activeCommentsTaskId);
    } else {
      alert(data.message || 'Error posting comment');
    }
  } catch (err) {
    console.error('Error posting comment:', err);
  }
}

async function deleteComment(commentId) {
  if (!confirm('Are you sure you want to delete this comment?')) return;
  try {
    const res = await fetch(`/api/comments/${commentId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (activeCommentsTaskId) {
        await loadComments(activeCommentsTaskId);
      }
    } else {
      alert(data.message || 'Error deleting comment');
    }
  } catch (err) {
    console.error('Error deleting comment:', err);
  }
}

async function reassignTask(taskId, targetUserId) {
  try {
    const payload = targetUserId ? { userId: targetUserId } : { unassign: true };
    const res = await fetch(`/api/tasks/${taskId}/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (isMyTasksMode) {
        await loadMyTasks();
      } else {
        await loadTasks(currentProjectId);
      }
      showAlert('dashAlert', data.message || 'Task assignment updated', 'success');
    } else {
      alert(data.message || 'Failed to reassign task');
    }
  } catch (err) {
    console.error('Error reassigning task:', err);
  }
}

function renderEmptyState() {
  document.getElementById('colTodo').innerHTML = '<div style="color: var(--text-secondary); text-align: center; margin-top: 2rem;">No project selected</div>';
  document.getElementById('colInProgress').innerHTML = '';
  document.getElementById('colDone').innerHTML = '';
}

// Project & Member & Task Actions
async function handleCreateProject(e) {
  e.preventDefault();
  const name = document.getElementById('projName').value;
  const description = document.getElementById('projDesc').value;

  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      closeModal('createProjectModal');
      document.getElementById('projName').value = '';
      document.getElementById('projDesc').value = '';
      await loadProjects();
      switchProject(data.project._id);
    } else {
      alert(data.message || 'Error creating project');
    }
  } catch (err) {
    alert('Error creating project');
  }
}

async function handleAddMember(e) {
  e.preventDefault();
  const email = document.getElementById('memberEmail').value;

  try {
    const res = await fetch(`/api/projects/${currentProjectId}/add-member`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      closeModal('addMemberModal');
      document.getElementById('memberEmail').value = '';
      currentProject = data.project;
      renderProjectMeta();
      showAlert('dashAlert', 'Member added successfully!', 'success');
    } else {
      alert(data.message || 'Error adding member');
    }
  } catch (err) {
    alert('Error adding member');
  }
}

async function handleCreateTask(e) {
  e.preventDefault();
  const title = document.getElementById('taskTitle').value;
  const description = document.getElementById('taskDesc').value;
  const assignedTo = document.getElementById('taskAssignee').value;

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        title,
        description,
        projectId: currentProjectId,
        assignedTo: assignedTo || null
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      closeModal('createTaskModal');
      document.getElementById('taskTitle').value = '';
      document.getElementById('taskDesc').value = '';
      loadTasks(currentProjectId);
    } else {
      alert(data.message || 'Error creating task');
    }
  } catch (err) {
    alert('Error creating task');
  }
}

async function moveTask(taskId, newStatus) {
  try {
    const res = await fetch(`/api/tasks/${taskId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (isMyTasksMode) {
        await loadMyTasks();
      } else if (currentProjectId) {
        await loadTasks(currentProjectId);
      }
    } else {
      alert(data.message || 'Failed to update task status');
    }
  } catch (err) {
    console.error('Error updating task status:', err);
  }
}

async function deleteTask(taskId) {
  if (!confirm('Are you sure you want to delete this task?')) return;
  try {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      loadTasks(currentProjectId);
    } else {
      alert(data.message || 'Failed to delete task');
    }
  } catch (err) {
    console.error('Error deleting task:', err);
  }
}

// Modal Helpers
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
  if (id === 'groupCallModal' && typeof leaveGroupCall === 'function') {
    leaveGroupCall();
  }
}

function showAlert(elementId, msg, type) {
  const alertEl = document.getElementById(elementId);
  alertEl.textContent = msg;
  alertEl.className = `alert alert-${type}`;
  setTimeout(() => {
    alertEl.className = 'alert';
  }, 4000);
}

let isAnalyticsMode = false;

async function toggleAnalyticsView() {
  const analyticsSection = document.getElementById('analyticsSection');
  const kanbanBoard = document.getElementById('kanbanBoard');
  const btn = document.getElementById('btnViewAnalytics');

  isAnalyticsMode = !isAnalyticsMode;

  if (isAnalyticsMode) {
    analyticsSection.classList.remove('hidden');
    kanbanBoard.classList.add('hidden');
    btn.textContent = '📋 Kanban Board';
    btn.className = 'btn btn-secondary btn-sm';
    await loadAnalyticsData();
  } else {
    analyticsSection.classList.add('hidden');
    kanbanBoard.classList.remove('hidden');
    btn.textContent = '📊 Analytics';
    btn.className = 'btn btn-primary btn-sm';
  }
}

async function loadAnalyticsData() {
  try {
    const res = await fetch('/api/dashboard', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();

    if (res.ok && data.success && data.data) {
      const stats = data.data;
      document.getElementById('statProjects').textContent = stats.totalProjects;
      document.getElementById('statTotalTasks').textContent = stats.totalTasks;
      document.getElementById('statCompleted').textContent = stats.completedTasks;
      document.getElementById('statPending').textContent = stats.pendingTasks;
      document.getElementById('statMyTasks').textContent = stats.myTasksCount;
      document.getElementById('statCompletionPct').textContent = `${stats.completionPercentage}%`;
      document.getElementById('statProgressBar').style.width = `${stats.completionPercentage}%`;

      if (stats.statusBreakdown) {
        document.getElementById('statCountTodo').textContent = stats.statusBreakdown.todo;
        document.getElementById('statCountProgress').textContent = stats.statusBreakdown.inProgress;
        document.getElementById('statCountDone').textContent = stats.statusBreakdown.done;
      }
    }
  } catch (err) {
    console.error('Failed to load analytics data:', err);
  }
}

/* ==========================================================================
   Project Discussion (Group Chat) Functions
   ========================================================================== */

let typingTimeout = null;

function handleChatTyping() {
  if (!socket || !currentProjectId || !currentUser) return;
  socket.emit('typing', { projectId: currentProjectId, userName: currentUser.name });

  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stop_typing', { projectId: currentProjectId, userName: currentUser.name });
  }, 2000);
}

async function openDiscussionModal() {
  if (!currentProjectId || !currentProject) {
    showAlert('dashAlert', 'Please select a project first', 'error');
    return;
  }
  document.getElementById('discussionProjectTitle').textContent = `💬 ${currentProject.name} Discussion`;
  openModal('discussionModal');
  await loadDiscussionMessages(currentProjectId);
}

async function loadDiscussionMessages(projectId) {
  const chatStream = document.getElementById('discussionChatStream');
  chatStream.innerHTML = '<div style="color: var(--text-secondary); text-align: center;">Loading chat history...</div>';

  try {
    const res = await fetch(`/api/discussions/${projectId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.ok && data.messages) {
      if (data.messages.length === 0) {
        chatStream.innerHTML = '<div style="color: var(--text-secondary); text-align: center; font-style: italic;">No messages yet. Start the conversation!</div>';
      } else {
        chatStream.innerHTML = data.messages.map(m => renderChatMessageHTML(m)).join('');
        scrollChatToBottom();
      }
    } else {
      chatStream.innerHTML = `<div style="color: var(--danger); text-align: center;">${data.message || 'Failed to load chat'}</div>`;
    }
  } catch (err) {
    console.error('Fetch discussion error:', err);
    chatStream.innerHTML = '<div style="color: var(--danger); text-align: center;">Error loading discussion chat</div>';
  }
}

function renderChatMessageHTML(msg) {
  const isMe = currentUser && msg.user && (msg.user._id === currentUser._id || msg.user === currentUser._id);
  const userName = msg.user ? msg.user.name || 'User' : 'User';
  const timeStr = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase();

  const bubbleBg = isMe
    ? 'background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(79, 70, 229, 0.35)); border: 1px solid rgba(99, 102, 241, 0.4); align-self: flex-end;'
    : 'background: rgba(30, 41, 59, 0.8); border: 1px solid var(--border-color); align-self: flex-start;';

  const flexDir = isMe ? 'flex-direction: row-reverse;' : '';

  return `
    <div style="display: flex; gap: 0.6rem; max-width: 85%; ${flexDir} ${isMe ? 'align-self: flex-end;' : 'align-self: flex-start;'}">
      <div class="member-avatar-chip" style="width: 32px; height: 32px; font-size: 0.72rem; flex-shrink: 0;" title="${userName}">${initials}</div>
      <div style="padding: 0.65rem 0.9rem; border-radius: 12px; ${bubbleBg} display: flex; flex-direction: column; gap: 0.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.8rem; font-size: 0.72rem;">
          <strong style="color: ${isMe ? 'var(--accent-indigo)' : 'var(--text-primary)'}; font-weight: 700;">${isMe ? 'You' : userName}</strong>
          <span style="color: var(--text-muted); font-size: 0.68rem;">${timeStr}</span>
        </div>
        <div style="font-size: 0.88rem; color: var(--text-primary); word-break: break-word; line-height: 1.4;">${msg.message}</div>
      </div>
    </div>
  `;
}

function appendChatMessage(msg) {
  const chatStream = document.getElementById('discussionChatStream');
  if (!chatStream) return;
  // Remove placeholder if present
  if (chatStream.children.length === 1 && chatStream.children[0].textContent.includes('No messages yet')) {
    chatStream.innerHTML = '';
  }
  chatStream.insertAdjacentHTML('beforeend', renderChatMessageHTML(msg));
  scrollChatToBottom();
}

function scrollChatToBottom() {
  const chatStream = document.getElementById('discussionChatStream');
  if (chatStream) {
    chatStream.scrollTop = chatStream.scrollHeight;
  }
}

async function handleSendDiscussionMessage(e) {
  e.preventDefault();
  const inputEl = document.getElementById('chatInputMessage');
  const message = inputEl.value.trim();
  if (!message || !currentProjectId) return;

  if (socket) {
    socket.emit('stop_typing', { projectId: currentProjectId, userName: currentUser ? currentUser.name : '' });
  }

  try {
    const res = await fetch(`/api/discussions/${currentProjectId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    if (res.ok && data.discussionMessage) {
      inputEl.value = '';
    } else {
      showAlert('dashAlert', data.message || 'Failed to send message', 'error');
    }
  } catch (err) {
    console.error('Send message error:', err);
    showAlert('dashAlert', 'Network error sending message', 'error');
  }
}

/* ==========================================================================
   Multi-User Zoom-Like Group Video Call Trigger
   ========================================================================== */

function triggerGroupMeeting() {
  if (!currentProjectId || !currentProject) {
    showAlert('dashAlert', 'Please select a project first', 'error');
    return;
  }
  if (typeof joinGroupMeeting === 'function') {
    joinGroupMeeting(currentProjectId, currentProject.name);
  } else {
    showAlert('dashAlert', 'Group video call engine module loading...', 'info');
  }
}

/* ==========================================================================
   Advanced Team Communication Hub & WebRTC Video Calling Engine
   ========================================================================== */

let onlineUsersSet = new Set();
let selectedCommFile = null;
let mediaRecorder = null;
let recordedAudioChunks = [];
let recordedAudioBlob = null;
let isRecordingVoice = false;
let voiceRecordTimerInterval = null;
let voiceRecordSeconds = 0;

// WebRTC Signaling State
let localStream = null;
let peerConnection = null;
let incomingCallData = null;
let activeCallPeerSocketId = null;
let pendingIceCandidates = [];
let isAudioMuted = false;
let isVideoMuted = false;
let commAppendedMsgIdsSet = new Set();

const rtcConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

async function openTeamCommModal() {
  if (!currentProjectId || !currentProject) {
    showAlert('dashAlert', 'Please select a project first', 'error');
    return;
  }

  document.getElementById('commProjectTitle').textContent = `💬 ${currentProject.name} Communication Hub`;
  openModal('teamCommModal');

  if (socket) {
    socket.emit('join_project', currentProjectId);
    socket.emit('get_online_users');
  }

  renderCommMembersList();
  await loadCommChatMessages(currentProjectId);
}

function renderCommMembersList() {
  const container = document.getElementById('commMemberList');
  if (!container || !currentProject || !currentProject.members) return;

  const currentUserIdStr = currentUser ? (currentUser._id ? currentUser._id.toString() : currentUser.toString()) : '';

  container.innerHTML = currentProject.members.map(m => {
    const u = m.user || m;
    const userIdStr = (u._id ? u._id.toString() : u.toString());
    const isMe = currentUserIdStr && userIdStr === currentUserIdStr;
    const isOnline = onlineUsersSet.has(userIdStr);
    const initials = u.name ? u.name.split(' ').map(n => n[0]).join('').toUpperCase() : '?';
    const role = m.role || 'member';

    const statusBadge = isOnline
      ? '<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;" title="Online"></span>'
      : '<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #64748b;" title="Offline"></span>';

    const callBtn = (!isMe && isOnline)
      ? `<button class="btn btn-secondary btn-sm" style="font-size: 0.68rem; padding: 2px 6px;" onclick="initiateVideoCall('${userIdStr}', '${(u.name || 'Teammate').replace(/'/g, "\\'")}')" title="Start Video Call">📹</button>`
      : '';

    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; padding: 0.4rem; border-radius: 6px; background: rgba(30, 41, 59, 0.4); border: 1px solid var(--border-color);">
        <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
          <div style="position: relative;">
            <div class="member-avatar-chip" style="width: 28px; height: 28px; font-size: 0.7rem;">${initials}</div>
            <div style="position: absolute; bottom: -2px; right: -2px;">${statusBadge}</div>
          </div>
          <div style="display: flex; flex-direction: column; overflow: hidden;">
            <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${isMe ? 'You' : (u.name || 'User')}</span>
            <span style="font-size: 0.68rem; color: var(--text-muted);">${role}</span>
          </div>
        </div>
        ${callBtn}
      </div>
    `;
  }).join('');
}

async function loadCommChatMessages(projectId) {
  const chatStream = document.getElementById('commChatStream');
  if (!chatStream) return;
  chatStream.innerHTML = '<div style="color: var(--text-secondary); text-align: center;">Loading chat stream...</div>';
  commAppendedMsgIdsSet.clear();

  try {
    const res = await fetch(`/api/chat/${projectId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.ok && data.messages) {
      if (data.messages.length === 0) {
        chatStream.innerHTML = '<div style="color: var(--text-secondary); text-align: center; font-style: italic;">No messages yet. Send a message, file, or voice note!</div>';
      } else {
        chatStream.innerHTML = data.messages.map(m => {
          if (m._id) commAppendedMsgIdsSet.add(m._id.toString());
          return renderCommMessageHTML(m);
        }).join('');
        scrollCommChatToBottom();
      }
    } else {
      chatStream.innerHTML = `<div style="color: var(--danger); text-align: center;">${data.message || 'Failed to load chat'}</div>`;
    }
  } catch (err) {
    console.error('Fetch chat stream error:', err);
    chatStream.innerHTML = '<div style="color: var(--danger); text-align: center;">Error loading communication chat</div>';
  }
}

function renderCommMessageHTML(msg) {
  const currentUserIdStr = currentUser ? (currentUser._id ? currentUser._id.toString() : currentUser.toString()) : '';
  const msgUserIdStr = msg.user ? (msg.user._id ? msg.user._id.toString() : msg.user.toString()) : '';
  const isMe = currentUserIdStr && msgUserIdStr === currentUserIdStr;
  const userName = msg.user ? msg.user.name || 'User' : 'User';
  const timeStr = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase();

  const bubbleBg = isMe
    ? 'background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(79, 70, 229, 0.35)); border: 1px solid rgba(99, 102, 241, 0.4); align-self: flex-end;'
    : 'background: rgba(30, 41, 59, 0.8); border: 1px solid var(--border-color); align-self: flex-start;';

  const flexDir = isMe ? 'flex-direction: row-reverse;' : '';

  let attachmentHTML = '';
  if (msg.file) {
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.file);
    if (isImage) {
      attachmentHTML = `<div style="margin-top: 0.4rem;"><a href="${msg.file}" target="_blank"><img src="${msg.file}" style="max-width: 220px; max-height: 180px; border-radius: 8px; border: 1px solid var(--border-color);" /></a></div>`;
    } else {
      attachmentHTML = `<div style="margin-top: 0.4rem;"><a href="${msg.file}" target="_blank" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.3rem;">📄 Download Attachment</a></div>`;
    }
  }

  let audioHTML = '';
  if (msg.audio) {
    audioHTML = `<div style="margin-top: 0.4rem;"><audio controls src="${msg.audio}" style="max-width: 240px; height: 36px; outline: none; border-radius: 18px;"></audio></div>`;
  }

  return `
    <div style="display: flex; gap: 0.6rem; max-width: 85%; ${flexDir} ${isMe ? 'align-self: flex-end;' : 'align-self: flex-start;'}">
      <div class="member-avatar-chip" style="width: 32px; height: 32px; font-size: 0.72rem; flex-shrink: 0;" title="${userName}">${initials}</div>
      <div style="padding: 0.65rem 0.9rem; border-radius: 12px; ${bubbleBg} display: flex; flex-direction: column; gap: 0.2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.8rem; font-size: 0.72rem;">
          <strong style="color: ${isMe ? 'var(--accent-indigo)' : 'var(--text-primary)'}; font-weight: 700;">${isMe ? 'You' : userName}</strong>
          <span style="color: var(--text-muted); font-size: 0.68rem;">${timeStr}</span>
        </div>
        ${msg.text ? `<div style="font-size: 0.88rem; color: var(--text-primary); word-break: break-word; line-height: 1.4;">${msg.text}</div>` : ''}
        ${attachmentHTML}
        ${audioHTML}
      </div>
    </div>
  `;
}

function appendCommChatMessage(msg) {
  if (!msg) return;
  if (msg._id && commAppendedMsgIdsSet.has(msg._id.toString())) {
    return; // Prevent duplicates
  }
  if (msg._id) commAppendedMsgIdsSet.add(msg._id.toString());

  const chatStream = document.getElementById('commChatStream');
  if (!chatStream) return;
  if (chatStream.children.length === 1 && chatStream.children[0].textContent.includes('No messages yet')) {
    chatStream.innerHTML = '';
  }
  chatStream.insertAdjacentHTML('beforeend', renderCommMessageHTML(msg));
  scrollCommChatToBottom();
}

function scrollCommChatToBottom() {
  const chatStream = document.getElementById('commChatStream');
  if (chatStream) {
    chatStream.scrollTop = chatStream.scrollHeight;
  }
}

function handleCommTyping() {
  if (!socket || !currentProjectId || !currentUser) return;
  socket.emit('typing', { projectId: currentProjectId, userName: currentUser.name });

  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stop_typing', { projectId: currentProjectId, userName: currentUser.name });
  }, 2000);
}

function handleCommFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  selectedCommFile = file;
  const preview = document.getElementById('commAttachmentPreview');
  const text = document.getElementById('commAttachmentText');
  text.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  preview.style.display = 'flex';
}

function clearCommAttachment() {
  selectedCommFile = null;
  recordedAudioBlob = null;
  const input = document.getElementById('commFileInput');
  if (input) input.value = '';
  const preview = document.getElementById('commAttachmentPreview');
  if (preview) preview.style.display = 'none';
}

/* --- Voice Message Recording --- */
async function toggleVoiceRecording() {
  const btn = document.getElementById('btnRecordVoice');
  const preview = document.getElementById('commAttachmentPreview');
  const text = document.getElementById('commAttachmentText');

  if (!isRecordingVoice) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedAudioChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedAudioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        recordedAudioBlob = new Blob(recordedAudioChunks, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        preview.style.display = 'flex';
        text.textContent = `🎙️ Voice Note (${voiceRecordSeconds}s)`;
      };

      mediaRecorder.start();
      isRecordingVoice = true;
      voiceRecordSeconds = 0;
      btn.style.background = 'var(--danger)';
      btn.textContent = '⏹️ Recording 0s';

      voiceRecordTimerInterval = setInterval(() => {
        voiceRecordSeconds++;
        btn.textContent = `⏹️ Recording ${voiceRecordSeconds}s`;
      }, 1000);

    } catch (err) {
      console.error('Microphone access error:', err);
      showAlert('dashAlert', 'Microphone access denied or unavailable', 'error');
    }
  } else {
    // Stop recording
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecordingVoice = false;
    clearInterval(voiceRecordTimerInterval);
    btn.style.background = '';
    btn.textContent = '🎙️';
  }
}

async function handleSendCommMessage(e) {
  e.preventDefault();
  const textInput = document.getElementById('commTextInput');
  const textVal = textInput.value.trim();

  if (!textVal && !selectedCommFile && !recordedAudioBlob) {
    return;
  }

  if (!currentProjectId) return;

  if (socket) {
    socket.emit('stop_typing', { projectId: currentProjectId, userName: currentUser ? currentUser.name : '' });
  }

  const formData = new FormData();
  if (textVal) formData.append('text', textVal);
  if (selectedCommFile) formData.append('file', selectedCommFile);
  if (recordedAudioBlob) formData.append('audio', recordedAudioBlob, 'voicenote.webm');

  try {
    const res = await fetch(`/api/chat/${currentProjectId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.chatMessage) {
      textInput.value = '';
      clearCommAttachment();
    } else {
      showAlert('dashAlert', data.message || 'Failed to send message', 'error');
    }
  } catch (err) {
    console.error('Send comm message error:', err);
    showAlert('dashAlert', 'Error sending communication message', 'error');
  }
}

/* --- WebRTC Video Calling Engine --- */
async function initiateVideoCall(userToCallId, targetName) {
  if (!socket || !currentProjectId) return;

  try {
    pendingIceCandidates = [];
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const localVideo = document.getElementById('localVideo');
    if (localVideo) localVideo.srcObject = localStream;

    document.getElementById('videoCallTitle').textContent = `📹 Call with ${targetName}`;
    document.getElementById('callDurationTimer').textContent = 'Connecting...';
    openModal('videoCallModal');

    peerConnection = new RTCPeerConnection(rtcConfiguration);

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
      const remoteVideo = document.getElementById('remoteVideo');
      if (remoteVideo && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
        const overlay = document.getElementById('remoteVideoOverlay');
        if (overlay) overlay.style.display = 'none';
        document.getElementById('callDurationTimer').textContent = '🟢 Connected';
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        if (activeCallPeerSocketId) {
          socket.emit('ice_candidate', { candidate: event.candidate, to: activeCallPeerSocketId });
        } else {
          pendingIceCandidates.push(event.candidate);
        }
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit('call_user', {
      userToCall: userToCallId,
      signalData: offer,
      from: currentUser._id,
      fromName: currentUser.name,
      projectId: currentProjectId
    });

  } catch (err) {
    console.error('Camera/Mic permission error:', err);
    showAlert('dashAlert', 'Could not access camera or microphone for video call', 'error');
    closeCallCleanly();
  }
}

async function acceptIncomingCall() {
  closeModal('incomingCallModal');
  if (!incomingCallData) return;

  try {
    activeCallPeerSocketId = incomingCallData.fromSocketId;

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const localVideo = document.getElementById('localVideo');
    if (localVideo) localVideo.srcObject = localStream;

    document.getElementById('videoCallTitle').textContent = `📹 Call with ${incomingCallData.fromName || 'Teammate'}`;
    document.getElementById('callDurationTimer').textContent = '🟢 Connecting...';
    openModal('videoCallModal');

    peerConnection = new RTCPeerConnection(rtcConfiguration);

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
      const remoteVideo = document.getElementById('remoteVideo');
      if (remoteVideo && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
        const overlay = document.getElementById('remoteVideoOverlay');
        if (overlay) overlay.style.display = 'none';
        document.getElementById('callDurationTimer').textContent = '🟢 Connected';
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && activeCallPeerSocketId) {
        socket.emit('ice_candidate', { candidate: event.candidate, to: activeCallPeerSocketId });
      }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCallData.signal));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('answer_call', { signal: answer, to: activeCallPeerSocketId });

  } catch (err) {
    console.error('Accept call error:', err);
    showAlert('dashAlert', 'Failed to connect video call', 'error');
    closeCallCleanly();
  }
}

function declineIncomingCall() {
  if (incomingCallData && socket) {
    socket.emit('end_call', { to: incomingCallData.fromSocketId });
  }
  incomingCallData = null;
  closeModal('incomingCallModal');
}

function toggleAudioMute() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    isAudioMuted = !isAudioMuted;
    audioTrack.enabled = !isAudioMuted;
    const btn = document.getElementById('btnToggleMic');
    btn.textContent = isAudioMuted ? '🎤 Unmute Mic' : '🎤 Mute Mic';
    btn.style.background = isAudioMuted ? 'var(--danger)' : '';
  }
}

function toggleVideoMute() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    isVideoMuted = !isVideoMuted;
    videoTrack.enabled = !isVideoMuted;
    const btn = document.getElementById('btnToggleCam');
    btn.textContent = isVideoMuted ? '📷 Camera Off' : '📷 Camera On';
    btn.style.background = isVideoMuted ? 'var(--danger)' : '';
  }
}

function endCurrentCall() {
  if (socket && activeCallPeerSocketId) {
    socket.emit('end_call', { to: activeCallPeerSocketId });
  }
  closeCallCleanly();
}

function closeCallCleanly() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  activeCallPeerSocketId = null;
  incomingCallData = null;
  pendingIceCandidates = [];
  isAudioMuted = false;
  isVideoMuted = false;

  const localVideo = document.getElementById('localVideo');
  if (localVideo) localVideo.srcObject = null;
  const remoteVideo = document.getElementById('remoteVideo');
  if (remoteVideo) remoteVideo.srcObject = null;

  closeModal('videoCallModal');
  closeModal('incomingCallModal');
}
