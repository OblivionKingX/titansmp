import { getDatabase, ref, onValue, get, push, set, serverTimestamp, query, orderByChild } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp as fsTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';
import './firebase-global.js';
import { updateUIForUser, initNavbar } from "./navbar-logic.js";
import { incrementUserMessageCount } from "./user-metadata-logic.js";

const { auth, db, fs } = window.firebaseApp;


// Get URL Params
const urlParams = new URLSearchParams(window.location.search);
const forumId = urlParams.get('forum');

if (!forumId) {
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
  'bug-reports': 'Bug Reports'
};

// Form Schemas
const FORUM_SCHEMAS = {
  'bug-reports': [
    { name: 'real_name', label: 'In-Game Name', type: 'text', required: true },
    { name: 'bug_desc', label: 'Description of how bug works', type: 'textarea', placeholder: 'Explain what happens and why it is a bug...', required: true },
    { name: 'steps', label: 'Steps to reproduce', type: 'textarea', placeholder: '1. Click... 2. Type...', required: true },
    { name: 'severity', label: 'Severity', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'], required: true },
    { name: 'screenshot_imgur', label: 'Screenshot Link (Imgur)', type: 'text', placeholder: 'https://imgur.com/...', required: false }
  ],
  'staff-apps': [
    { name: 'real_name', label: 'FullName', type: 'text', required: true },
    { name: 'age', label: 'Age', type: 'number', required: true },
    { name: 'discord', label: 'Discord tag', type: 'text', required: true },
    { name: 'why_us', label: 'Why do you want to join our team?', type: 'textarea', required: true }
  ]
};

// DOM Elements
const forumNameBreadcrumb = document.getElementById('forum-name-breadcrumb');
const forumTitleDisplay = document.getElementById('forum-title-display');
const threadListContainer = document.getElementById('thread-list-container');
const openThreadModalBtn = document.getElementById('open-thread-modal');
const closeThreadModalBtn = document.getElementById('close-thread-modal');
const threadModal = document.getElementById('thread-modal');
const newThreadForm = document.getElementById('new-thread-form');
const dynamicFieldsContainer = document.getElementById('dynamic-form-fields');

let isAuthResolved = false;
let currentRenderId = 0;

/**
 * Page Initialization
 */
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  const displayName = FORUM_NAMES[forumId] || 'Forum';
  document.title = `TitanNetwork - ${displayName}`;
  if (forumNameBreadcrumb) forumNameBreadcrumb.textContent = displayName;
  if (forumTitleDisplay) forumTitleDisplay.textContent = displayName;

  // Modal toggle logic
  if (openThreadModalBtn) {
    openThreadModalBtn.onclick = () => {
      if (threadModal) threadModal.style.display = 'flex';
    };
  }

  if (closeThreadModalBtn) {
    closeThreadModalBtn.onclick = () => {
      if (threadModal) threadModal.style.display = 'none';
    };
  }

  // Close modal when clicking outside the card
  if (threadModal) {
    threadModal.onclick = (e) => {
      if (e.target === threadModal) threadModal.style.display = 'none';
    };
  }

  // Check for action=new param
  if (urlParams.get('action') === 'new') {
    setTimeout(() => {
      if (threadModal) threadModal.style.display = 'flex';
    }, 100);
  }

  if (newThreadForm) {
    newThreadForm.onsubmit = (e) => {
      e.preventDefault();
      publishThread();
    };
  }

  // Schema setup
  setupDynamicForm();
});

async function initPage() {
  if (isAuthResolved) return;
  isAuthResolved = true;
  loadThreads();
}

function setupDynamicForm() {
  const schema = FORUM_SCHEMAS[forumId];
  if (!schema || !dynamicFieldsContainer) return;

  // If there's a schema, we might hide the standard content field or keep it as "Additional Notes"
  // User said "Suggestions forum... Each suggestion post should include multiple fields"
  // So I'll hide the standard content field if there's a schema, or move it to the end.
  const standardContent = document.getElementById('standard-content-group');
  if (standardContent) standardContent.style.display = 'none';

  schema.forEach(field => {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = field.label;
    group.appendChild(label);

    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
      input.className = 'form-control';
      input.placeholder = field.placeholder || '';
    } else if (field.type === 'select') {
      input = document.createElement('select');
      input.className = 'form-control';
      field.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        input.appendChild(o);
      });
    } else {
      input = document.createElement('input');
      input.type = field.type;
      input.className = 'form-control';
      input.placeholder = field.placeholder || '';
    }

    input.name = `custom_${field.name}`;
    input.required = field.required;
    group.appendChild(input);
    dynamicFieldsContainer.appendChild(group);
  });
}



onAuthStateChanged(auth, async (user) => {
  updateUIForUser(user);
  
  if (openThreadModalBtn) {
    if (user && forumId === 'news') {
      try {
        const meta = await getUserMetadata(user.uid);
        const role = meta?.rank?.toLowerCase() || 'user';
        const isAuthorized = ['owner', 'co-owner', 'admin', 'manager'].includes(role);
        openThreadModalBtn.style.display = isAuthorized ? 'flex' : 'none';
      } catch (e) {
        console.error("Role check failed:", e);
        openThreadModalBtn.style.display = 'none';
      }
    } else {
      openThreadModalBtn.style.display = user ? 'flex' : 'none';
    }
  }
  
  initPage();
});

// Fallback: Ensure page loads even if auth state is delayed or blocked by domain issues
setTimeout(() => {
  if (!isAuthResolved) {
    console.warn("Auth resolution taking too long, initializing page as guest...");
    initPage();
  }
}, 2000);


/**
 * Thread Management
 */
function loadThreads() {
  const threadsRef = ref(db, `threads/${forumId}`);
  const threadsQuery = query(threadsRef, orderByChild('timestamp'));

  onValue(threadsQuery, (snapshot) => {
    if (snapshot.exists()) {
      const threads = [];
      snapshot.forEach((child) => {
        threads.push({ id: child.key, ...child.val() });
      });
      threads.reverse();
      renderThreads(threads);
    } else {
      threadListContainer.innerHTML = `<div style="padding: 40px; text-align: center;"><p>No threads found. Be the first to start a discussion!</p></div>`;
    }
  });
}

import { getUserMetadata, renderBadges } from "./user-metadata-logic.js";

async function renderThreads(threads) {
  const renderId = ++currentRenderId;
  const fragment = document.createDocumentFragment();

  const threadPromises = threads.map(async (thread) => {
    const replyCount = thread.replies ? Object.keys(thread.replies).length : 0;
    const meta = await getUserMetadata(thread.authorUid);
    const pfpUrl = meta?.pfpUrl || "https://cdn.pfps.gg/pfps/2331-minecraft-cat.png";
    const badgesHtml = renderBadges(meta);

    const threadRow = document.createElement('a');
    threadRow.href = `post.html?forum=${forumId}&thread=${thread.id}`;
    threadRow.className = 'thread-row';

    let statusHtml = '';
    if (thread.status) {
      statusHtml = `<span style="padding: 2px 8px; border-radius: 4px; font-size:0.7rem; font-weight:800; background: var(--border-color); color: white; margin-left:10px;">${thread.status.toUpperCase()}</span>`;
    }

    threadRow.innerHTML = `
      <div class="thread-avatar">
        <img src="${pfpUrl}" alt="Avatar">
      </div>
      <div class="thread-info">
        <h3>${escapeHtml(thread.title)} ${statusHtml}</h3>
        <div class="thread-meta" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          Started by <span style="display: flex; align-items: center; gap: 6px;">${escapeHtml(thread.authorName)} ${badgesHtml}</span>, ${getTimeAgo(thread.timestamp)}
        </div>
      </div>
      <div class="thread-stats">
        <span class="stat-val">${replyCount}</span>
        <span class="stat-lbl">Replies</span>
      </div>
      <div class="thread-last-post">
        <div class="last-post-time">${getTimeAgo(thread.lastActivity || thread.timestamp)}</div>
        <div class="last-post-author">by ${escapeHtml(thread.lastAuthorName || thread.authorName)}</div>
      </div>
    `;
    return threadRow;
  });

  const threadElements = await Promise.all(threadPromises);

  if (renderId !== currentRenderId) return;

  threadListContainer.innerHTML = '';
  threadElements.forEach(el => fragment.appendChild(el));
  threadListContainer.appendChild(fragment);
}

async function publishThread() {
  const title = document.getElementById('thread-title').value.trim();
  const user = auth.currentUser;
  if (!user || !title) return;

  // We will determine if user is staff by checking metadata
  let isStaff = false;
  if (user) {
    try {
      const meta = await getUserMetadata(user.uid);
      const role = meta?.rank?.toLowerCase() || 'user';
      if (role === 'owner' || role === 'admin' || role === 'staff' || role === 'moderator' || role === 'mod') {
        isStaff = true;
      }
    } catch (err) {
      console.error("Role check failed:", err);
    }
  }

  const threadData = {
    title: title,
    authorUid: user.uid,
    authorName: user.displayName || user.email.split('@')[0],
    timestamp: serverTimestamp(),
    lastActivity: serverTimestamp(),
    lastAuthorName: user.displayName || user.email.split('@')[0],
    status: (forumId === 'suggestions' || forumId === 'staff-apps') ? 'pending' : null
  };

  // Collect dynamic fields
  const schema = FORUM_SCHEMAS[forumId];
  if (schema) {
    threadData.customFields = {};
    schema.forEach(field => {
      const input = dynamicFieldsContainer.querySelector(`[name="custom_${field.name}"]`);
      if (input) {
        threadData.customFields[field.name] = input.value.trim();
      }
    });
    // For schema forums, we might not have a main content, so we just use the first field or a summary
    threadData.content = "Submitted via form.";
  } else {
    const content = document.getElementById('thread-content').value.trim();
    if (!content) return;
    threadData.content = content;
  }

  try {
    const threadsRef = ref(db, `threads/${forumId}`);
    await push(threadsRef, threadData);
    await incrementUserMessageCount(user.uid);

    // Success handling
    newThreadForm.reset();
    if (threadModal) threadModal.style.display = 'none';

    const standardContent = document.getElementById('standard-content-group');
    if (standardContent && FORUM_SCHEMAS[forumId]) standardContent.style.display = 'none';

    // Show success notification if available (optional)
    console.log("Thread published successfully!");
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

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
