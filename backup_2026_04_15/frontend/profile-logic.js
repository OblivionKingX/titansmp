import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import './firebase-global.js';
import { initNavbar, updateUIForUser } from "./navbar-logic.js";
import { getUserMetadata, fetchUserPosts, renderBadges } from "./user-metadata-logic.js";

const { auth } = window.firebaseApp;

// Get UID from URL
const urlParams = new URLSearchParams(window.location.search);
const profileUid = urlParams.get('user');

document.addEventListener('DOMContentLoaded', () => {
    // Inject Navbar
    fetch('navbar-template.html')
        .then(res => res.text())
        .then(html => {
            const placeholder = document.getElementById('navbar-placeholder');
            if (placeholder) {
                placeholder.innerHTML = html;
                initNavbar();
                // If auth is already resolved, we might need a manual UI update
                if (auth.currentUser) {
                    updateUIForUser(auth.currentUser);
                }
            }
        });

    if (!profileUid) {
        document.getElementById('profile-loading').innerHTML = '<h2>No user specified.</h2><a href="forums.html" class="btn-full-profile" style="max-width: 200px; margin: 20px auto;">Back to Forums</a>';
        return;
    }

    loadProfile();
});

onAuthStateChanged(auth, (user) => {
    updateUIForUser(user);
});

// Polyfill for logout and toggle functions if used in template
window.logout = () => signOut(auth).then(() => window.location.href = 'index.html');
window.toggleMobileMenu = () => {
    const navLinks = document.getElementById('nav-links');
    if (navLinks) navLinks.classList.toggle('active');
};
window.toggleUserMenu = () => {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.classList.toggle('active');
};

async function loadProfile() {
    const meta = await getUserMetadata(profileUid);
    if (!meta) {
        document.getElementById('profile-loading').innerHTML = '<h2>User not found.</h2>';
        return;
    }

    // Update Header
    document.getElementById('pfp-display').src = meta.pfpUrl;
    document.getElementById('nickname-display').textContent = meta.username || meta.email?.split('@')[0] || 'Anonymous';
    document.getElementById('bio-display').textContent = meta.bio;
    document.getElementById('joined-display').textContent = meta.joined;
    document.getElementById('posts-display').textContent = meta.messageCount;

    // Ranks Display logic
    const badgesHtml = renderBadges(meta);

    const ranksDisplay = document.getElementById('ranks-display');
    ranksDisplay.innerHTML = badgesHtml;
    ranksDisplay.style.display = 'flex';
    ranksDisplay.style.flexWrap = 'wrap';
    ranksDisplay.style.gap = '8px';
    ranksDisplay.style.justifyContent = 'center';

    // Fetch and show posts
    const activities = await fetchUserPosts(profileUid);
    const activityList = document.getElementById('activity-list');
    activityList.innerHTML = '';

    if (activities.length === 0) {
        activityList.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-secondary);">No recent activity found.</div>';
    } else {
        activities.forEach(act => {
            const item = document.createElement('a');
            item.className = 'activity-item';

            const href = act.type === 'thread'
                ? `post.html?forum=${act.forumId}&thread=${act.id}`
                : `post.html?forum=${act.forumId}&thread=${act.threadId}#post-${act.id}`;

            item.href = href;

            const typeTag = act.type === 'thread' ? 'tag-thread' : 'tag-reply';
            const typeLabel = act.type === 'thread' ? 'Started Thread' : 'Replied to';
            const title = act.type === 'thread' ? act.title : act.threadTitle;

            item.innerHTML = `
                <div class="activity-meta">
                    <span><span class="post-type-tag ${typeTag}">${act.type}</span> ${typeLabel} in <strong>${act.forumId.replace(/-/g, ' ')}</strong></span>
                    <span>${getTimeAgo(act.timestamp)}</span>
                </div>
                <div class="activity-title">${title}</div>
                <div class="activity-preview">${act.content}</div>
            `;
            activityList.appendChild(item);
        });
    }

    document.getElementById('profile-loading').style.display = 'none';
    document.getElementById('profile-content').style.display = 'block';
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
