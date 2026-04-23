// frontend/online-users-logic.js

export async function initOnlineUsersWidgets() {
  const { onValue, ref, db, auth, set } = window.firebaseApp;
  const { renderBadges } = await import('./user-metadata-logic.js');

  const staffListContainer = document.getElementById('staff-online-list');
  const membersListContainer = document.getElementById('members-online-list');
  const guestsListContainer = document.getElementById('guests-online-list');

  const defaultAvatar = `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'>
      <rect width='64' height='64' rx='32' fill='#0b2a45'/>
      <circle cx='32' cy='24' r='12' fill='#58c8ff'/>
      <path d='M14 54c2-10 10-16 18-16s16 6 18 16' fill='#58c8ff'/>
    </svg>
  `)}`;

  function createHtmlForItem(user) {
    if (!user) return '';
    const ranks = Array.isArray(user.ranks) ? user.ranks : (typeof user.ranks === 'string' ? [user.ranks] : []);

    let badgesHtml = '';
    if (ranks.length > 0) {
      badgesHtml = renderBadges({ rank: ranks[0], ranks: ranks.slice(1) });
    }

    return `
      <a href="profile.html?user=${user.uid}" class="staff-online-item" data-user-uid="${user.uid}">
        <img src="${user.photoURL || defaultAvatar}" class="staff-avatar" alt="${user.username || 'User'}">
        <div class="staff-info">
          <div class="staff-name">${user.username || 'Unknown User'}</div>
          <div class="staff-badges">${badgesHtml}</div>
        </div>
      </a>
    `;
  }

  // Monitor staff online
  if (staffListContainer) {
    onValue(ref(db, 'online-staff'), (snapshot) => {
      const staffData = snapshot.val() || {};
      let html = '';
      let count = 0;
      const now = Date.now();

      Object.values(staffData).forEach(staff => {
        if (!staff.lastSeen || (now - staff.lastSeen) > 60000) return;
        html += createHtmlForItem(staff);
        count++;
      });

      if (count === 0) {
        staffListContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem; text-align: center; padding: 10px;">No staff online</p>';
      } else {
        staffListContainer.innerHTML = html;
      }
    });
  }

  // Monitor members online
  if (membersListContainer) {
    // We only want to show members who are NOT in the online-staff list
    let staffKeys = new Set();

    onValue(ref(db, 'online-staff'), (snapshot) => {
      const staffData = snapshot.val();
      staffKeys = new Set(staffData ? Object.keys(staffData) : []);
      renderMembers(); // Re-render members if staff list changes
    });

    let currentUsersData = {};

    onValue(ref(db, 'online-users'), (snapshot) => {
      currentUsersData = snapshot.val() || {};
      renderMembers();
    });

    function renderMembers() {
      if (!membersListContainer) return;

      let html = '';
      let memberCount = 0;
      const now = Date.now();

      Object.keys(currentUsersData).forEach(emailKey => {
        const userData = currentUsersData[emailKey];

        // Skip stale users
        if (!userData.lastSeen || (now - userData.lastSeen) > 60000) return;

        const userRanks = Array.isArray(userData.ranks) ? userData.ranks.map(r => r.toLowerCase()) : [];
        const STAFF_ROLES = ['owner', 'co-owner', 'admin', 'manager', 'mod', 'moderator', 'staff', 'helper', 'developer', 'lead developer', 'builder'];
        const isStaffRank = userRanks.some(r => STAFF_ROLES.includes(r));

        // Skip if they are in staff table OR have a staff rank
        if (!staffKeys.has(emailKey) && !isStaffRank) {
          html += createHtmlForItem(userData);
          memberCount++;
        }
      });

      if (memberCount === 0) {
        membersListContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem; text-align: center; padding: 10px;">No members online</p>';
      } else {
        membersListContainer.innerHTML = html;
      }
    }
  }

  // Initialize Guest Tracking
  trackGuestPresence();

  // Monitor guests online
  if (guestsListContainer) {
    onValue(ref(db, 'online-guests'), (snapshot) => {
      const guestsData = snapshot.val() || {};

      let html = '';
      let count = 0;
      const now = Date.now();

      Object.keys(guestsData).forEach((guestId) => {
        const guestData = guestsData[guestId];
        if (!guestData.lastSeen || (now - guestData.lastSeen) > 60000) return;

        html += `
          <div class="staff-online-item guest-item">
            <div class="guest-avatar-placeholder">
              <i class="fas fa-question"></i>
            </div>
            <div class="staff-info">
              <div class="staff-name">Guest</div>
              <div class="staff-badges">
                <span class="user-role role-member guest-badge">Unauthenticated</span>
              </div>
            </div>
          </div>
        `;
        count++;
      });

      if (count === 0) {
        guestsListContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem; text-align: center; padding: 10px;">No guests online</p>';
      } else {
        guestsListContainer.innerHTML = html;
      }
    });
  }
}

function trackGuestPresence() {
  const { auth, db, ref, set, onDisconnect, onValue } = window.firebaseApp;

  const { update } = window.firebaseApp;
  let guestListenerAttached = false;
  let guestStatusRef = null;
  let connectedRefListener = null;
  let guestHeartbeatInterval = null;

  function cleanupGuest() {
    if (guestHeartbeatInterval) {
      clearInterval(guestHeartbeatInterval);
      guestHeartbeatInterval = null;
    }
    if (guestStatusRef) set(guestStatusRef, null);
    if (connectedRefListener) {
      connectedRefListener();
      connectedRefListener = null;
    }
    guestListenerAttached = false;
  }

  function setupGuest() {
    if (guestListenerAttached) return;

    let guestId = localStorage.getItem('guestId');
    if (!guestId) {
      guestId = 'guest_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      localStorage.setItem('guestId', guestId);
    }

    guestStatusRef = ref(db, `online-guests/${guestId}`);
    const connectedRef = ref(db, '.info/connected');

    connectedRefListener = onValue(connectedRef, async (snap) => {
      if (snap.val() !== true) return;

      guestListenerAttached = true;

      if (guestHeartbeatInterval) {
        clearInterval(guestHeartbeatInterval);
        guestHeartbeatInterval = null;
      }

      try {
        await onDisconnect(guestStatusRef).remove();
        await set(guestStatusRef, {
          online: true,
          lastSeen: Date.now()
        });

        guestHeartbeatInterval = setInterval(async () => {
          try {
            await update(guestStatusRef, { lastSeen: Date.now(), online: true });
          } catch (err) { }
        }, 25000);
      } catch (err) {
        console.error("Guest tracking error:", err);
      }
    });

    window.addEventListener('beforeunload', () => {
      cleanupGuest();
    });
  }

  // Initial check
  if (!auth.currentUser) {
    setupGuest();
  }

  // Subscribe to auth state changes:
  auth.onAuthStateChanged(user => {
    if (user) {
      cleanupGuest();
    } else {
      setupGuest();
    }
  });

  // Initialize Global Forum Stats
  initForumStatsWidget();
}

const FORUM_IDS = [
  'general-chat', 'off-topic', 'server-discussion', 'support', 
  'password-reset', 'suggestions', 'staff-apps', 'bug-reports'
];

async function initForumStatsWidget() {
  const { ref, db, onValue } = window.firebaseApp;
  const globalStats = {};
  
  FORUM_IDS.forEach(forumId => {
    const forumRef = ref(db, `threads/${forumId}`);
    onValue(forumRef, (snapshot) => {
      const threads = snapshot.val() || {};
      const threadCount = Object.keys(threads).length;
      let messageCount = 0;
      
      Object.values(threads).forEach(t => {
        messageCount++; // Thread itself
        if (t.replies) {
          messageCount += Object.keys(t.replies).length;
        }
      });
      
      globalStats[forumId] = { threads: threadCount, messages: messageCount };
      
      // Update Display
      let totalThreads = 0;
      let totalMessages = 0;
      Object.values(globalStats).forEach(s => {
        totalThreads += s.threads;
        totalMessages += s.messages;
      });
      
      const threadEl = document.getElementById('global-thread-count');
      const messageEl = document.getElementById('global-message-count');
      
      if (threadEl) threadEl.textContent = totalThreads.toLocaleString();
      if (messageEl) messageEl.textContent = totalMessages.toLocaleString();
    });
  });
}
