import { getDatabase, ref, onValue, get, push, set, serverTimestamp, update, remove } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp as fsTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';
import './firebase-global.js';
import { updateUIForUser, initNavbar } from "./navbar-logic.js";
import { getUserMetadata, incrementUserMessageCount, renderBadges } from "./user-metadata-logic.js";
import { initProfileCardTriggers } from "./profile-card-logic.js";

const { auth, db, fs } = window.firebaseApp;


// Get URL Params
const urlParams = new URLSearchParams(window.location.search);
const forumId = urlParams.get('forum');
const threadId = urlParams.get('thread');

if (!forumId || !threadId) {
  window.location.href = "forums.html";
}

// Map forum IDs to Display Names
const FORUM_NAMES = {
  'general-chat': 'General Chat',
  'off-topic': 'Off-Topic',
  'server-discussion': 'Server Discussion',
  'support': 'Support',
  'password-reset': 'Password Reset',
  'suggestions': 'Suggestions',
  'staff-apps': 'Staff Applications',
  'password-reset': 'Password Reset',
  'bug-reports': 'Bug Reports'
};

// DOM Elements
const newThreadBtn = document.getElementById('new-thread-btn');
const forumLink = document.getElementById('forum-link');
const threadNameBreadcrumb = document.getElementById('thread-name-breadcrumb');
const threadTitleDisplay = document.getElementById('thread-title-display');
const threadStatus = document.getElementById('thread-status');
const repliesContainer = document.getElementById('replies-container');
const replyForm = document.getElementById('reply-form');
const staffActions = document.getElementById('staff-actions');

// New Thread Modal Elements
const openPostModalBtn = document.getElementById('open-post-modal');
const closePostModalBtn = document.getElementById('close-post-modal');
const postModal = document.getElementById('post-modal');
const newThreadFromPostForm = document.getElementById('new-thread-from-post-form');
const postCategorySelect = document.getElementById('post-category-select');

let currentUserId = null;
let currentUserRank = 'member';
let isAuthResolved = false;
let lastThreadData = null;
let currentRenderId = 0; // Guard against race conditions in async rendering
let activeReplyParentId = null;

/**
 * Page Initialization
 */
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initProfileCardTriggers();
  if (forumLink) {
    forumLink.textContent = FORUM_NAMES[forumId] || 'Forum';
    forumLink.href = `threads.html?forum=${forumId}`;
  }

  if (replyForm) {
    replyForm.onsubmit = (e) => {
      e.preventDefault();
      publishReply(activeReplyParentId);
    };
  }

  // Modal logic
  if (openPostModalBtn) {
    openPostModalBtn.onclick = () => {
      if (postModal) postModal.style.display = 'flex';
    };
  }
  if (closePostModalBtn) {
    closePostModalBtn.onclick = () => {
      if (postModal) postModal.style.display = 'none';
    };
  }
  if (postModal) {
    postModal.onclick = (e) => {
      if (e.target === postModal) postModal.style.display = 'none';
    };
  }
  if (newThreadFromPostForm) {
    newThreadFromPostForm.onsubmit = (e) => {
      e.preventDefault();
      publishThreadFromPost();
    };
  }
});

async function initPage() {
  if (isAuthResolved) return;
  isAuthResolved = true;
  loadThreadData();
}

/**
 * Auth Logic
 */
onAuthStateChanged(auth, async (user) => {
  currentUserId = user ? user.uid : null;
  updateUIForUser(user);
  if (user) {
    checkStaffStatus(user);
  }
  
  if (openPostModalBtn) {
    if (user && forumId === 'news') {
      try {
        const meta = await getUserMetadata(user.uid);
        const role = meta?.rank?.toLowerCase() || 'user';
        const isAuthorized = ['owner', 'co-owner', 'admin', 'manager'].includes(role);
        openPostModalBtn.style.display = isAuthorized ? 'flex' : 'none';
      } catch (e) {
        console.error("Role check failed:", e);
        openPostModalBtn.style.display = 'none';
      }
    } else {
      openPostModalBtn.style.display = user ? 'flex' : 'none';
    }
  }

  if (!isAuthResolved) {
    initPage();
  } else if (lastThreadData) {
    // Refresh current user role for isStaff check
    await checkStaffStatus(auth.currentUser);
    renderThread(lastThreadData);
  }
});

// Fallback: Ensure page loads even if auth state is delayed or blocked by domain issues
setTimeout(() => {
  if (!isAuthResolved) {
    console.warn("Auth resolution taking too long, initializing page as guest...");
    initPage();
  }
}, 2000);


let isCurrentUserStaff = false;
async function checkStaffStatus(user) {
  isCurrentUserStaff = false;
  try {
    const meta = await getUserMetadata(user.uid);
    const role = meta?.rank?.toLowerCase() || 'user';
    if (['owner', 'admin', 'staff', 'moderator', 'mod'].includes(role)) {
      isCurrentUserStaff = true;
      if (staffActions && ['suggestions', 'staff-apps'].includes(forumId)) {
        staffActions.style.display = 'flex';
      }
    }
  } catch (err) {
    console.error("Role check failed:", err);
  }
}

/**
 * Thread & Reply Logic
 */
function loadThreadData() {
  const threadRef = ref(db, `threads/${forumId}/${threadId}`);
  onValue(threadRef, async (snapshot) => {
    if (!snapshot.exists()) {
      repliesContainer.innerHTML = `<div style="padding: 40px; text-align: center;"><p>Thread not found.</p></div>`;
      return;
    }
    const thread = snapshot.val();
    if (threadTitleDisplay) threadTitleDisplay.textContent = thread.title;
    if (threadNameBreadcrumb) threadNameBreadcrumb.textContent = thread.title;
    updateStatusBadge(thread.status);
    renderThread(thread);
  });
}

function updateStatusBadge(status) {
  if (!threadStatus) return;
  if (status) {
    threadStatus.textContent = status.replace('-', ' ');
    threadStatus.className = `status-badge status-${status}`;
    threadStatus.style.display = 'block';
  } else if (['suggestions', 'staff-apps'].includes(forumId)) {
    threadStatus.textContent = 'pending';
    threadStatus.className = 'status-badge status-pending';
    threadStatus.style.display = 'block';
  }
}

let threadAuthorUid = null;

async function renderThread(thread) {
  const renderId = ++currentRenderId;
  lastThreadData = thread;

  // Create fragment or temp container to avoid partial clears/flicker
  const fragment = document.createDocumentFragment();
  // Render OP
  const allPosts = { [threadId]: thread };
  if (thread.replies) {
    Object.assign(allPosts, thread.replies);
  }

  // Create post tasks (promises)
  const postTasks = [];
  postTasks.push(createPostElement(thread, threadId, true, allPosts));

  if (thread.replies) {
    const repliesArray = Object.entries(thread.replies).map(([id, data]) => ({ id, ...data }));
    repliesArray.sort((a, b) => a.timestamp - b.timestamp);
    repliesArray.forEach(reply => {
      postTasks.push(createPostElement(reply, reply.id, false, allPosts));
    });
  }

  // Wait for all posts to be created in parallel
  const postElements = await Promise.all(postTasks);
  if (renderId !== currentRenderId) return;

  // Clear and append
  repliesContainer.innerHTML = '';
  postElements.forEach(el => fragment.appendChild(el));
  repliesContainer.appendChild(fragment);
}

async function createPostElement(post, postId, isOP, allPosts = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'post-wrapper';
  wrapper.id = `wrapper-${postId}`;

  const meta = await getUserMetadata(post.authorUid);
  const pfpUrl = meta.pfpUrl;
  const rank = meta.rank;
  const joined = meta.joined;
  const msgs = meta.messageCount;

  const isAuthor = currentUserId === post.authorUid;
  let isStaff = isCurrentUserStaff;

  // Multi-Rank Badge System
  const badgesHtml = renderBadges(meta);

  // Render Quote Block if it's a reply to another message
  let quoteHtml = '';
  if (post.parentId && allPosts[post.parentId]) {
    const parent = allPosts[post.parentId];
    quoteHtml = `
      <div class="quote-block" onclick="jumpToPost('${post.parentId}')">
        <span class="quote-author">@${escapeHtml(parent.authorName)}</span>
        <div class="quote-content">${escapeHtml(parent.content)}</div>
      </div>
    `;
  }

  // Render Custom Fields
  let customFieldsHtml = '';
  if (post.customFields) {
    customFieldsHtml = '<div class="custom-fields" style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--border-color);">';
    Object.entries(post.customFields).forEach(([key, val]) => {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      customFieldsHtml += `<div style="margin-bottom: 8px;"><strong style="color: var(--accent-color);">${label}:</strong> <span style="color: white; margin-left:10px;">${escapeHtml(val)}</span></div>`;
    });
    customFieldsHtml += '</div>';
  }

      let bodyContent = window.formatRichText(post.content);
      
      // If it's a news thread OP, prepend featured image
      if (isOP && post.type === 'news_sync' && post.featuredImage) {
          bodyContent = `
            <div class="news-forum-header" style="margin-bottom: 20px;">
                <img src="${post.featuredImage}" style="width: 100%; max-height: 400px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border-color);">
            </div>
            ${bodyContent}
          `;
      }

      const postCard = document.createElement('div');
      postCard.className = 'post-card';

      postCard.id = `post-${postId}`;
      postCard.innerHTML = `
        <div class="post-sidebar" data-author-uid="${post.authorUid}">
          <img src="${pfpUrl}" class="post-author-pfp" alt="Avatar" style="cursor: pointer;">
          <div class="post-author-info">
            <span class="post-author-name" style="cursor: pointer;">${escapeHtml(post.authorName)}</span>
            <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
              ${badgesHtml}
            </div>
            <div class="author-stats">
              <div class="author-stat">
                <span class="stat-lbl">Joined</span>
                <span class="stat-ctx">${joined}</span>
              </div>
              <div class="author-stat">
                <span class="stat-lbl">Messages</span>
                <span class="stat-ctx">${msgs}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="post-content-area">
          <div class="post-header-meta">
            <span>${getTimeAgo(post.timestamp)}</span>
            ${post.edited ? `<span class="edited-notice">(edited ${getTimeAgo(post.edited)})</span>` : ''}
          </div>
          ${quoteHtml}
          ${customFieldsHtml}
          <div class="post-body" id="body-${postId}">${bodyContent}</div>
      <div class="post-footer-actions">
        ${!isOP ? `<button class="action-btn" onclick="setReplyParent('${postId}')"><i class="fas fa-reply"></i> Reply</button>` : `<button class="action-btn" onclick="setReplyParent(null)"><i class="fas fa-reply"></i> Reply to Thread</button>`}
        ${isAuthor ? `<button class="action-btn" onclick="editPost('${postId}', '${isOP ? 'thread' : 'reply'}')"><i class="fas fa-edit"></i> Edit</button>` : ''}
        ${isAuthor || isStaff ? `<button class="action-btn delete" onclick="deletePost('${postId}', '${isOP ? 'thread' : 'reply'}')"><i class="fas fa-trash"></i> Delete</button>` : ''}
      </div>
    </div>
  `;
  wrapper.appendChild(postCard);
  return wrapper;
}

/**
 * Interaction Functions
 */
window.setReplyParent = (postId) => {
  activeReplyParentId = postId;
  const target = document.getElementById(`post-${postId}`);
  const formSection = document.getElementById('reply-section');

  // Highlight the post we are replying to
  document.querySelectorAll('.post-card').forEach(p => p.style.borderColor = '');
  if (target) {
    target.style.borderColor = 'var(--accent-color)';
    const authorName = target.querySelector('.post-author-name').textContent;
    document.getElementById('reply-content').placeholder = `Replying to ${authorName}...`;
  } else {
    document.getElementById('reply-content').placeholder = "Write your reply here...";
  }

  formSection.scrollIntoView({ behavior: 'smooth' });
  document.getElementById('reply-content').focus();
};

window.jumpToPost = (postId) => {
  const target = document.getElementById(`post-${postId}`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Quick highlight effect
    const originalBorder = target.style.borderColor;
    target.style.borderColor = 'var(--accent-color)';
    target.style.boxShadow = '0 0 20px rgba(0, 191, 255, 0.3)';

    setTimeout(() => {
      target.style.borderColor = originalBorder;
      target.style.boxShadow = '';
    }, 2000);
  }
};

async function publishReply(parentId = null) {
  const contentEl = document.getElementById('reply-content');
  const submitBtn = document.getElementById('submit-reply-btn');
  const content = contentEl.value.trim();
  const user = auth.currentUser;

  if (!user) {
    alert("You must be logged in to reply!");
    return;
  }
  if (!content) {
    alert("Please enter a message.");
    return;
  }

  // Prevent double submission
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting...';
  }

  const replyData = {
    content,
    parentId,
    authorUid: user.uid,
    authorName: user.displayName || user.email.split('@')[0],
    timestamp: serverTimestamp()
  };

  try {
    const repliesRef = ref(db, `threads/${forumId}/${threadId}/replies`);
    await push(repliesRef, replyData);
    await incrementUserMessageCount(user.uid);
    await update(ref(db, `threads/${forumId}/${threadId}`), {
      lastActivity: serverTimestamp(),
      lastAuthorName: user.displayName || user.email.split('@')[0],
      lastAuthorUid: user.uid
    });

    contentEl.value = '';
    contentEl.placeholder = "Write your reply here...";
    activeReplyParentId = null;
    document.querySelectorAll('.post-card').forEach(p => p.style.borderColor = '');
  } catch (err) {
    alert("Error posting reply: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post Reply';
    }
  }
}

window.editPost = async (postId, type) => {
  const targetId = type === 'thread' ? `body-${postId}` : `body-${postId}`;
  const oldContent = document.getElementById(targetId).textContent;
  const newContent = prompt("Edit your post:", oldContent);

  if (newContent === null || newContent.trim() === oldContent) return;

  const path = type === 'thread'
    ? `threads/${forumId}/${threadId}`
    : `threads/${forumId}/${threadId}/replies/${postId}`;

  try {
    await update(ref(db, path), {
      content: newContent.trim(),
      edited: serverTimestamp()
    });
  } catch (err) {
    alert("Error editing: " + err.message);
  }
};

window.deletePost = async (postId, type) => {
  if (!confirm("Are you sure you want to delete this? Sub-replies will remain.")) return;

  const path = type === 'thread'
    ? `threads/${forumId}/${threadId}`
    : `threads/${forumId}/${threadId}/replies/${postId}`;

  try {
    if (type === 'thread') {
      await remove(ref(db, path));
      window.location.href = `threads.html?forum=${forumId}`;
    } else {
      // For replies, we mark as deleted but keep the node if it has children?
      // Actually, simple remove for now.
      await remove(ref(db, path));
    }
  } catch (err) {
    alert("Error deleting: " + err.message);
  }
};

async function publishThreadFromPost() {
  const selectedForumId = postCategorySelect.value;
  const title = document.getElementById('post-thread-title').value.trim();
  const content = document.getElementById('post-thread-content').value.trim();
  const user = auth.currentUser;

  if (!user || !selectedForumId || !title || !content) {
    alert("Please fill in all fields.");
    return;
  }

  const threadData = {
    title,
    content,
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

    newThreadFromPostForm.reset();
    if (postModal) postModal.style.display = 'none';

    window.location.href = `threads.html?forum=${selectedForumId}`;
  } catch (err) {
    console.error("Posting error:", err);
    alert(`Error: ${err.message}`);
  }
}

async function updateThreadStatus(status) {
  const user = auth.currentUser;
  let isStaff = false;
  if (user) {
    try {
      const meta = await getUserMetadata(user.uid);
      const role = meta?.rank?.toLowerCase() || 'user';
      if (['owner', 'admin', 'staff', 'moderator', 'mod'].includes(role)) {
        isStaff = true;
      }
    } catch (err) {
      console.error("Role check failed:", err);
    }
  }
  if (!isStaff) return;

  try {
    await update(ref(db, `threads/${forumId}/${threadId}`), { status });
  } catch (err) {
    alert("Error: " + err.message);
  }
};

/**
 * Helpers
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getTimeAgo(timestamp) {
  if (!timestamp) return 'Just now';
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
