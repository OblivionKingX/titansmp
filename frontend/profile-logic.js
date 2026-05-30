import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import './firebase-global.js';
import { initNavbar, updateUIForUser } from "./navbar-logic.js";
import { getUserMetadata, fetchUserPosts, renderBadges } from "./user-metadata-logic.js";

const { auth, db, ref, onValue, query, orderByChild, equalTo, get } = window.firebaseApp;

let profileMeta = null;

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
    profileMeta = await getUserMetadata(profileUid);
    if (!profileMeta) {
        document.getElementById('profile-loading').innerHTML = '<h2>User not found.</h2>';
        return;
    }

    // Update Header
    document.getElementById('pfp-display').src = profileMeta.pfpUrl;
    document.getElementById('nickname-display').textContent = profileMeta.username || profileMeta.email?.split('@')[0] || 'Anonymous';
    document.getElementById('bio-display').textContent = profileMeta.bio;
    document.getElementById('joined-display').textContent = profileMeta.joined;
    document.getElementById('posts-display').textContent = profileMeta.messageCount;

    // Fetch and show Gold and Points
    if (profileMeta.username) {
        const goldRef = ref(db, `playerData/${profileMeta.username}/gold`);
        const pointsRef = ref(db, `playerData/${profileMeta.username}/points`);
        
        onValue(goldRef, (snap) => {
            const gold = snap.val() || 0;
            const goldDisplay = document.getElementById('gold-display');
            const goldBox = document.getElementById('gold-stat-box');
            if (goldDisplay) goldDisplay.textContent = gold.toLocaleString();
            if (goldBox) goldBox.style.display = 'block';
        });
        
        onValue(pointsRef, (snap) => {
            const points = snap.val() || 0;
            const pointsDisplay = document.getElementById('points-display');
            const pointsBox = document.getElementById('points-stat-box');
            if (pointsDisplay) pointsDisplay.textContent = points.toLocaleString();
            if (pointsBox) pointsBox.style.display = 'block';
        });
    }

    // Show Points History tab if viewing own profile
    if (auth.currentUser && auth.currentUser.uid === profileUid) {
        const ptsBtn = document.getElementById('points-tab-btn');
        if (ptsBtn) ptsBtn.style.display = 'inline-block';
    }

    // Ranks Display logic
    const badgesHtml = renderBadges(profileMeta);

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

window.switchProfileTab = function(tab) {
    const actBtn = document.getElementById('activity-tab-btn');
    const ptsBtn = document.getElementById('points-tab-btn');
    const actList = document.getElementById('activity-list');
    const ptsList = document.getElementById('points-history-list');
    
    if (!actBtn || !ptsBtn || !actList || !ptsList) return;

    if (tab === 'activity') {
        actBtn.classList.add('active');
        ptsBtn.classList.remove('active');
        actList.style.display = 'flex';
        ptsList.style.display = 'none';
    } else {
        ptsBtn.classList.add('active');
        actBtn.classList.remove('active');
        actList.style.display = 'none';
        ptsList.style.display = 'flex';
        loadPointsHistory();
    }
};

async function loadPointsHistory() {
    const ptsList = document.getElementById('points-history-list');
    if (!ptsList || !profileMeta || !profileMeta.username) return;

    ptsList.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fas fa-circle-notch fa-spin" style="font-size: 2rem; color: var(--accent-color);"></i><p style="margin-top: 10px;">Loading points history...</p></div>';
    
    try {
        const txQuery = query(ref(db, 'point_transactions'), orderByChild('playerName'), equalTo(profileMeta.username));
        const snap = await get(txQuery);
        ptsList.innerHTML = '';
        
        if (!snap.exists()) {
            ptsList.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-secondary);">No point transaction history found.</div>';
            return;
        }
        
        const txs = [];
        snap.forEach(child => {
            txs.push(child.val());
        });
        
        // Sort descending by timestamp
        txs.sort((a, b) => b.timestamp - a.timestamp);
        
        txs.forEach(tx => {
            const item = document.createElement('div');
            item.className = 'activity-item';
            item.style.pointerEvents = 'none'; // non-clickable card
            
            const isGain = tx.amount >= 0;
            const amountColor = isGain ? '#00e676' : '#ff1744';
            const amountPrefix = isGain ? '+' : '';
            const icon = tx.type === 'playtime' ? 'fa-gamepad' : (tx.type.startsWith('forum') ? 'fa-comments' : 'fa-star');
            
            item.innerHTML = `
                <div class="activity-meta">
                    <span style="display:flex; align-items:center; gap: 8px;">
                        <i class="fas ${icon}" style="color: var(--accent-light); width: 16px;"></i>
                        <span class="post-type-tag" style="background: rgba(0, 191, 255, 0.1); color: var(--accent-color); margin-right: 0; text-transform: uppercase;">${tx.type.replace('_', ' ')}</span>
                    </span>
                    <span>${getTimeAgo(tx.timestamp)}</span>
                </div>
                <div class="activity-title" style="display:flex; justify-content:space-between; align-items:center; gap: 20px; font-size: 1.1rem; margin-bottom: 0;">
                    <span style="color: white; font-weight: 600;">${tx.description}</span>
                    <span style="color: ${amountColor}; font-weight: 800; font-size: 1.2rem; white-space: nowrap;">${amountPrefix}${tx.amount} Pts</span>
                </div>
            `;
            ptsList.appendChild(item);
        });
        
    } catch (err) {
        console.error("Error loading point history:", err);
        ptsList.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--error-color);">Failed to load points history.</div>';
    }
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
