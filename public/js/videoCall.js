/**
 * FlowBoard Multi-User Zoom-Like Group Video Call Engine (WebRTC Mesh + Socket.io)
 */
(function (window) {
  let groupCallState = {
    localStream: null,
    screenStream: null,
    peerConnections: new Map(), // peerSocketId -> RTCPeerConnection
    peerUsers: new Map(),       // peerSocketId -> user object
    pendingCandidates: new Map(), // peerSocketId -> candidate[]
    isAudioMuted: false,
    isVideoMuted: false,
    isScreenSharing: false,
    activeProjectId: null,
    callSeconds: 0,
    timerInterval: null
  };

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  function getSocket() {
    return window.getAppSocket ? window.getAppSocket() : (window.socket || null);
  }

  /* --- Flush Queued ICE Candidates --- */
  function flushPendingCandidates(peerSocketId, pc) {
    const candidates = groupCallState.pendingCandidates.get(peerSocketId);
    if (candidates && candidates.length > 0) {
      candidates.forEach(async (cand) => {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.error('Error flushing group ICE candidate:', err);
        }
      });
      groupCallState.pendingCandidates.delete(peerSocketId);
    }
  }

  /* --- Start or Join Group Video Meeting --- */
  async function joinGroupMeeting(projectId, projectTitle) {
    const socket = getSocket();
    if (!socket) {
      alert('Socket connection not initialized');
      return;
    }

    groupCallState.activeProjectId = projectId;
    document.getElementById('groupCallProjectTitle').textContent = `📹 ${projectTitle} Meeting`;
    document.getElementById('groupCallTimer').textContent = 'Connecting...';

    // Clear previous video grid & chat
    const grid = document.getElementById('groupVideoGrid');
    if (grid) grid.innerHTML = '';
    const chatStream = document.getElementById('groupInCallChatStream');
    if (chatStream) chatStream.innerHTML = '';

    openModal('groupCallModal');

    try {
      // 1. Obtain Local Media Stream with Fallback for Audio-Only devices
      try {
        groupCallState.localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      } catch (camErr) {
        console.warn('Camera access failed/unavailable, falling back to audio only:', camErr);
        groupCallState.localStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true
        });
      }

      // Add local participant video card to grid
      addParticipantVideoCard('local_user', groupCallState.localStream, true, window.currentUser ? window.currentUser.name : 'You');

      // Start call duration timer
      startCallTimer();

      // Register socket event listeners for group video call signaling
      registerGroupCallSocketListeners(socket);

      // Join call room on server
      socket.emit('join_group_call', {
        projectId,
        user: window.currentUser || { name: 'User' }
      });

    } catch (err) {
      console.error('Group call media permission error:', err);
      alert('Failed to access microphone or camera. Please check browser permissions.');
      leaveGroupCall();
    }
  }

  /* --- Socket Event Listeners for Group Call --- */
  function registerGroupCallSocketListeners(socket) {
    // Remove existing handlers to avoid duplicates
    socket.off('existing_call_peers');
    socket.off('user_joined_group_call');
    socket.off('group_offer');
    socket.off('group_answer');
    socket.off('group_ice_candidate');
    socket.off('user_left_group_call');
    socket.off('group_in_call_chat');
    socket.off('group_raise_hand');

    // Existing peers in call when caller joins -> Create offer for each peer
    socket.on('existing_call_peers', ({ peers }) => {
      if (peers && peers.length > 0) {
        peers.forEach(peerSocketId => {
          if (peerSocketId !== socket.id) {
            createPeerConnection(peerSocketId, true);
          }
        });
      }
    });

    // New participant joins call
    socket.on('user_joined_group_call', ({ socketId, user }) => {
      if (socketId === socket.id) return;
      if (user) groupCallState.peerUsers.set(socketId, user);
      createPeerConnection(socketId, false);
      showInCallToast(`👋 ${user ? user.name : 'Teammate'} joined the meeting`);
    });

    // Handle incoming WebRTC offer
    socket.on('group_offer', async ({ from, signal, user }) => {
      if (user) groupCallState.peerUsers.set(from, user);
      let pc = groupCallState.peerConnections.get(from);
      if (!pc) {
        pc = createPeerConnection(from, false);
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        flushPendingCandidates(from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('group_answer', { to: from, signal: answer });
      } catch (err) {
        console.error('Error handling group offer:', err);
      }
    });

    // Handle incoming WebRTC answer
    socket.on('group_answer', async ({ from, signal }) => {
      const pc = groupCallState.peerConnections.get(from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          flushPendingCandidates(from, pc);
        } catch (err) {
          console.error('Error handling group answer:', err);
        }
      }
    });

    // Handle ICE Candidate with queueing fallback
    socket.on('group_ice_candidate', async ({ from, candidate }) => {
      if (!candidate) return;
      const pc = groupCallState.peerConnections.get(from);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding group ICE candidate:', err);
        }
      } else {
        if (!groupCallState.pendingCandidates.has(from)) {
          groupCallState.pendingCandidates.set(from, []);
        }
        groupCallState.pendingCandidates.get(from).push(candidate);
      }
    });

    // Participant leaves call
    socket.on('user_left_group_call', ({ socketId, user }) => {
      const peerUser = user || groupCallState.peerUsers.get(socketId);
      showInCallToast(`🚪 ${peerUser ? peerUser.name : 'Participant'} left the meeting`);
      removeParticipantVideoCard(socketId);

      const pc = groupCallState.peerConnections.get(socketId);
      if (pc) {
        pc.close();
        groupCallState.peerConnections.delete(socketId);
      }
      groupCallState.peerUsers.delete(socketId);
      groupCallState.pendingCandidates.delete(socketId);
      updateParticipantCountDisplay();
    });

    // In-Call Chat message
    socket.on('group_in_call_chat', ({ text, user, time }) => {
      appendInCallChatMessage(user ? user.name : 'User', text, time);
    });

    // Raise hand event
    socket.on('group_raise_hand', ({ user }) => {
      showInCallToast(`🖐️ ${user ? user.name : 'Someone'} raised hand!`);
    });
  }

  /* --- Create WebRTC Peer Connection for Mesh --- */
  function createPeerConnection(peerSocketId, isInitiator) {
    const socket = getSocket();
    const pc = new RTCPeerConnection(rtcConfig);
    groupCallState.peerConnections.set(peerSocketId, pc);

    // Add local stream tracks to peer connection
    const activeStream = groupCallState.isScreenSharing && groupCallState.screenStream
      ? groupCallState.screenStream
      : groupCallState.localStream;

    if (activeStream) {
      activeStream.getTracks().forEach(track => pc.addTrack(track, activeStream));
    }

    // Handle remote media track arrival
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const peerUser = groupCallState.peerUsers.get(peerSocketId);
        const name = peerUser ? peerUser.name : 'Teammate';
        addParticipantVideoCard(peerSocketId, event.streams[0], false, name);
      }
    };

    // Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('group_ice_candidate', {
          to: peerSocketId,
          candidate: event.candidate
        });
      }
    };

    // If initiator, create and send WebRTC offer
    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('group_offer', {
            to: peerSocketId,
            signal: pc.localDescription
          });
        })
        .catch(err => console.error('Create group offer error:', err));
    }

    updateParticipantCountDisplay();
    return pc;
  }

  /* --- Video Grid Layout Rendering --- */
  function addParticipantVideoCard(id, stream, isLocal, name) {
    const grid = document.getElementById('groupVideoGrid');
    if (!grid) return;

    let card = document.getElementById(`card_${id}`);
    if (!card) {
      card = document.createElement('div');
      card.id = `card_${id}`;
      card.className = 'group-video-card';
      card.style.cssText = `
        position: relative;
        background: #000;
        border-radius: 10px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--border-color);
        min-height: 180px;
      `;

      const video = document.createElement('video');
      video.id = `video_${id}`;
      video.autoplay = true;
      video.playsInline = true;
      if (isLocal) video.muted = true;
      video.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
        ${isLocal ? 'transform: scaleX(-1);' : ''}
      `;

      const label = document.createElement('div');
      label.style.cssText = `
        position: absolute;
        bottom: 8px;
        left: 8px;
        background: rgba(9, 13, 22, 0.75);
        color: #fff;
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        gap: 0.3rem;
      `;
      label.innerHTML = `<span>${isLocal ? '👤 You' : '👤 ' + name}</span>`;

      card.appendChild(video);
      card.appendChild(label);
      grid.appendChild(card);
    }

    const videoEl = document.getElementById(`video_${id}`);
    if (videoEl && stream) {
      videoEl.srcObject = stream;
      videoEl.play().catch(e => console.warn('Video playback trigger:', e));
    }

    autoAdjustVideoGridColumns();
  }

  function removeParticipantVideoCard(id) {
    const card = document.getElementById(`card_${id}`);
    if (card) {
      card.remove();
      autoAdjustVideoGridColumns();
    }
  }

  function autoAdjustVideoGridColumns() {
    const grid = document.getElementById('groupVideoGrid');
    if (!grid) return;
    const count = grid.children.length;

    if (count <= 1) {
      grid.style.gridTemplateColumns = '1fr';
    } else if (count === 2) {
      grid.style.gridTemplateColumns = '1fr 1fr';
    } else if (count <= 4) {
      grid.style.gridTemplateColumns = '1fr 1fr';
    } else {
      grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(240px, 1fr))';
    }
  }

  function updateParticipantCountDisplay() {
    const totalCount = groupCallState.peerConnections.size + 1;
    const countBadge = document.getElementById('groupParticipantCount');
    if (countBadge) countBadge.textContent = `${totalCount} Participant${totalCount === 1 ? '' : 's'}`;
  }

  /* --- Call Duration Timer --- */
  function startCallTimer() {
    groupCallState.callSeconds = 0;
    if (groupCallState.timerInterval) clearInterval(groupCallState.timerInterval);

    groupCallState.timerInterval = setInterval(() => {
      groupCallState.callSeconds++;
      const mins = String(Math.floor(groupCallState.callSeconds / 60)).padStart(2, '0');
      const secs = String(groupCallState.callSeconds % 60).padStart(2, '0');
      const timerEl = document.getElementById('groupCallTimer');
      if (timerEl) timerEl.textContent = `🟢 ${mins}:${secs}`;
    }, 1000);
  }

  /* --- Controls: Audio, Camera, Screen Share, Raise Hand --- */
  function toggleGroupMic() {
    if (!groupCallState.localStream) return;
    const audioTrack = groupCallState.localStream.getAudioTracks()[0];
    if (audioTrack) {
      groupCallState.isAudioMuted = !groupCallState.isAudioMuted;
      audioTrack.enabled = !groupCallState.isAudioMuted;

      const btn = document.getElementById('btnGroupMic');
      if (btn) {
        btn.textContent = groupCallState.isAudioMuted ? '🎤 Unmute Mic' : '🎤 Mute Mic';
        btn.style.background = groupCallState.isAudioMuted ? 'var(--danger)' : '';
      }
    }
  }

  function toggleGroupCam() {
    if (!groupCallState.localStream) return;
    const videoTrack = groupCallState.localStream.getVideoTracks()[0];
    if (videoTrack) {
      groupCallState.isVideoMuted = !groupCallState.isVideoMuted;
      videoTrack.enabled = !groupCallState.isVideoMuted;

      const btn = document.getElementById('btnGroupCam');
      if (btn) {
        btn.textContent = groupCallState.isVideoMuted ? '📷 Camera Off' : '📷 Camera On';
        btn.style.background = groupCallState.isVideoMuted ? 'var(--danger)' : '';
      }
    }
  }

  async function toggleScreenShare() {
    const btn = document.getElementById('btnGroupScreenShare');

    if (!groupCallState.isScreenSharing) {
      try {
        groupCallState.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = groupCallState.screenStream.getVideoTracks()[0];

        // Replace video track on all active peer connections
        groupCallState.peerConnections.forEach((pc) => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        });

        // Replace local video display
        const localVideo = document.getElementById('video_local_user');
        if (localVideo) {
          localVideo.srcObject = groupCallState.screenStream;
          localVideo.style.transform = 'none';
          localVideo.play().catch(e => console.warn(e));
        }

        groupCallState.isScreenSharing = true;
        if (btn) {
          btn.textContent = '💻 Stop Sharing';
          btn.style.background = 'var(--accent-teal)';
        }

        screenTrack.onended = () => {
          stopScreenSharing();
        };

      } catch (err) {
        console.error('Screen sharing error:', err);
      }
    } else {
      stopScreenSharing();
    }
  }

  function stopScreenSharing() {
    const btn = document.getElementById('btnGroupScreenShare');
    if (groupCallState.screenStream) {
      groupCallState.screenStream.getTracks().forEach(track => track.stop());
      groupCallState.screenStream = null;
    }

    if (groupCallState.localStream) {
      const cameraTrack = groupCallState.localStream.getVideoTracks()[0];
      groupCallState.peerConnections.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
      });

      const localVideo = document.getElementById('video_local_user');
      if (localVideo) {
        localVideo.srcObject = groupCallState.localStream;
        localVideo.style.transform = 'scaleX(-1)';
        localVideo.play().catch(e => console.warn(e));
      }
    }

    groupCallState.isScreenSharing = false;
    if (btn) {
      btn.textContent = '💻 Share Screen';
      btn.style.background = '';
    }
  }

  function raiseGroupHand() {
    const socket = getSocket();
    if (socket && groupCallState.activeProjectId) {
      socket.emit('group_raise_hand', {
        projectId: groupCallState.activeProjectId,
        user: window.currentUser || { name: 'You' }
      });
      showInCallToast('🖐️ You raised your hand');
    }
  }

  function handleSendInCallChat(e) {
    e.preventDefault();
    const input = document.getElementById('groupInCallInput');
    const text = input.value.trim();
    if (!text || !groupCallState.activeProjectId) return;

    const socket = getSocket();
    if (socket) {
      socket.emit('group_in_call_chat', {
        projectId: groupCallState.activeProjectId,
        text,
        user: window.currentUser || { name: 'You' }
      });
      input.value = '';
    }
  }

  function appendInCallChatMessage(senderName, text, time) {
    const chatStream = document.getElementById('groupInCallChatStream');
    if (!chatStream) return;

    const timeStr = time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const isMe = window.currentUser && window.currentUser.name === senderName;

    const msgHTML = `
      <div style="font-size: 0.78rem; padding: 0.35rem 0.6rem; border-radius: 6px; background: rgba(30,41,59,0.6); margin-bottom: 0.4rem;">
        <div style="display: flex; justify-content: space-between; gap: 0.5rem; margin-bottom: 2px;">
          <strong style="color: ${isMe ? 'var(--accent-indigo)' : 'var(--text-primary)'};">${isMe ? 'You' : senderName}</strong>
          <span style="color: var(--text-muted); font-size: 0.68rem;">${timeStr}</span>
        </div>
        <div style="color: var(--text-secondary); word-break: break-word;">${text}</div>
      </div>
    `;

    chatStream.insertAdjacentHTML('beforeend', msgHTML);
    chatStream.scrollTop = chatStream.scrollHeight;
  }

  function showInCallToast(msg) {
    const container = document.getElementById('groupCallToastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.style.cssText = `
      background: rgba(15, 23, 42, 0.9);
      color: #fff;
      border: 1px solid var(--accent-indigo);
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.78rem;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      animation: fadeIn 0.3s ease;
    `;
    toast.textContent = msg;

    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function toggleInCallDrawer() {
    const drawer = document.getElementById('groupInCallDrawer');
    if (drawer) {
      drawer.style.display = drawer.style.display === 'none' ? 'flex' : 'none';
    }
  }

  /* --- Leave Group Meeting --- */
  function leaveGroupCall() {
    const socket = getSocket();
    if (socket && groupCallState.activeProjectId) {
      socket.emit('leave_group_call', { projectId: groupCallState.activeProjectId });
    }

    if (groupCallState.timerInterval) clearInterval(groupCallState.timerInterval);

    if (groupCallState.localStream) {
      groupCallState.localStream.getTracks().forEach(track => track.stop());
      groupCallState.localStream = null;
    }

    if (groupCallState.screenStream) {
      groupCallState.screenStream.getTracks().forEach(track => track.stop());
      groupCallState.screenStream = null;
    }

    groupCallState.peerConnections.forEach((pc) => pc.close());
    groupCallState.peerConnections.clear();
    groupCallState.peerUsers.clear();
    groupCallState.pendingCandidates.clear();

    groupCallState.isAudioMuted = false;
    groupCallState.isVideoMuted = false;
    groupCallState.isScreenSharing = false;
    groupCallState.activeProjectId = null;

    closeModal('groupCallModal');
  }

  // Export functions to window scope
  window.joinGroupMeeting = joinGroupMeeting;
  window.leaveGroupCall = leaveGroupCall;
  window.toggleGroupMic = toggleGroupMic;
  window.toggleGroupCam = toggleGroupCam;
  window.toggleScreenShare = toggleScreenShare;
  window.raiseGroupHand = raiseGroupHand;
  window.handleSendInCallChat = handleSendInCallChat;
  window.toggleInCallDrawer = toggleInCallDrawer;

})(window);
