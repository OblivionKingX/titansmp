import './firebase-global.js';
import { updateUIForUser, initNavbar } from "./navbar-logic.js";
import { getUserMetadata, renderBadges, incrementUserMessageCount } from "./user-metadata-logic.js";

// Access globally initialized Firebase services and functions
const { 
    auth, db, onAuthStateChanged, 
    ref, onValue, get, push, query, orderByChild, limitToLast, serverTimestamp, onDisconnect, set 
} = window.firebaseApp;

// DOM Elements
const openForumModalBtn = document.getElementById('open-forum-modal');
const closeForumModalBtn = document.getElementById('close-forum-modal');
const forumModal = document.getElementById('forum-modal');
const newForumThreadForm = document.getElementById('new-forum-thread-form');
const forumCategorySelect = document.getElementById('forum-category-select');

let isAuthResolved = false;

// Forum IDs
const FORUM_IDS = [
  'news',
  'general-chat',
  'off-topic',
  'server-discussion',
  'support',
  'password-reset',
  'suggestions',
  'staff-apps',
  'bug-reports'
];

// Auth State Management
onAuthStateChanged(auth, async (user) => {
  updateUIForUser(user);
  if (openForumModalBtn) openForumModalBtn.style.display = user ? 'flex' : 'none';
  
  if (user) {
    try {
      const { getUserMetadata } = await import('./user-metadata-logic.js');
      const meta = await getUserMetadata(user.uid);
      const { setupPresenceTracking, startPresenceHeartbeat } = await import('./presence-logic.js');
      setupPresenceTracking(meta);
      startPresenceHeartbeat();
    } catch (e) {
      console.error("Failed to start presence tracking:", e);
    }
  } else {
    try {
      const { cleanupPresenceOnLogout } = await import('./presence-logic.js');
      cleanupPresenceOnLogout();
    } catch (e) {
      console.error("Failed to cleanup presence:", e);
    }
  }

  initPage();
});

async function initPage() {
  if (isAuthResolved) return;
  isAuthResolved = true;
  initNavbar();
  loadForumData();
  
  try {
    const { initOnlineUsersWidgets } = await import('./online-users-logic.js');
    initOnlineUsersWidgets();
  } catch (err) {
    console.error("Failed to init online widgets on forums:", err);
  }
}



/**
 * Forum Statistics & Latest Posts
 */
function loadForumData() {
  FORUM_IDS.forEach(forumId => {
    // 1. Get thread and post counts
    const threadsRef = ref(db, `threads/${forumId}`);
    onValue(threadsRef, (snapshot) => {
      const threads = snapshot.val() || {};
      const threadCount = Object.keys(threads).length;
      let postCount = 0;
      
      // Calculate total posts (threads + replies)
      Object.values(threads).forEach(thread => {
        postCount++; // The thread itself
        if (thread.replies) {
          postCount += Object.keys(thread.replies).length;
        }
      });

      // Update individual forum row UI
      const threadCountEl = document.getElementById(`stats-${forumId}-threads`);
      const postCountEl = document.getElementById(`stats-${forumId}-posts`);
      if (threadCountEl) threadCountEl.textContent = threadCount;
      if (postCountEl) postCountEl.textContent = postCount;
    });

    // 2. Get latest post
    const latestQuery = query(ref(db, `threads/${forumId}`), orderByChild('timestamp'), limitToLast(1));
    onValue(latestQuery, async (snapshot) => {
      const latestEl = document.getElementById(`latest-${forumId}`);
      if (!latestEl) return;

      if (snapshot.exists()) {
        const data = snapshot.val();
        const threadId = Object.keys(data)[0];
        const thread = data[threadId];
        
        let latestTimestamp = thread.timestamp;
        let latestAuthor = thread.authorName || "User";
        let latestAuthorUid = thread.authorUid;
        let latestTitle = thread.title;

        if (thread.replies) {
          const replies = Object.entries(thread.replies);
          replies.forEach(([id, reply]) => {
            if (reply.timestamp > latestTimestamp) {
              latestTimestamp = reply.timestamp;
              latestAuthor = reply.authorName || "User";
              latestAuthorUid = reply.authorUid;
            }
          });
        }
        
        // Fallback to lastAuthorUid if stored
        if (thread.lastAuthorUid) {
            latestAuthorUid = thread.lastAuthorUid;
        }

        const meta = await getUserMetadata(latestAuthorUid);
        const badgesHtml = renderBadges(meta);

        latestEl.innerHTML = `
          <a href="post.html?forum=${forumId}&thread=${threadId}" class="latest-title">${latestTitle}</a>
          <span class="latest-meta" style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
            by <span class="latest-author">${latestAuthor}</span> ${badgesHtml}
          </span>
          <span class="latest-meta">${getTimeAgo(latestTimestamp)}</span>
        `;
      } else {
        latestEl.innerHTML = `
          <span class="latest-title">No threads yet</span>
          <span class="latest-meta">Be the first to post!</span>
        `;
      }
    });
  });
}

/**
 * Helper: Time Ago
 */
function getTimeAgo(timestamp) {
  if (!timestamp) return 'Unknown';
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  loadForumData();

  // Modal toggle logic
  if (openForumModalBtn) {
    openForumModalBtn.onclick = () => {
      if (forumModal) forumModal.style.display = 'flex';
    };
  }

  if (closeForumModalBtn) {
    closeForumModalBtn.onclick = () => {
      if (forumModal) forumModal.style.display = 'none';
    };
  }

  // Close modal when clicking outside
  if (forumModal) {
    forumModal.onclick = (e) => {
      if (e.target === forumModal) forumModal.style.display = 'none';
    };
  }

  if (newForumThreadForm) {
    newForumThreadForm.onsubmit = (e) => {
      e.preventDefault();
      publishForumThread();
    };
  }
});

async function publishForumThread() {
  const selectedForumId = forumCategorySelect.value;
  const title = document.getElementById('thread-title').value.trim();
  const content = document.getElementById('thread-content').value.trim();
  const user = auth.currentUser;

  if (!user || !selectedForumId || !title || !content) {
    alert("Please fill in all fields.");
    return;
  }

  const threadData = {
    title: title,
    content: content,
    authorUid: user.uid,
    authorName: user.displayName || user.email.split('@')[0],
    timestamp: serverTimestamp(),
    lastActivity: serverTimestamp(),
    lastAuthorName: user.displayName || user.email.split('@')[0],
    status: (selectedForumId === 'suggestions' || selectedForumId === 'staff-apps') ? 'pending' : null
  };

  try {
    const threadRef = ref(db, `threads/${selectedForumId}`);
    await push(threadRef, threadData);
    await incrementUserMessageCount(user.uid);
    
    // Success handling
    newForumThreadForm.reset();
    if (forumModal) forumModal.style.display = 'none';
    
    // Redirect to the newly created thread context (optional but good UX)
    window.location.href = `threads.html?forum=${selectedForumId}`;
  } catch (err) {
    console.error("Posting error:", err);
    alert(`Error publishing thread: ${err.message}`);
  }
}
