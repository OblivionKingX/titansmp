import './firebase-global.js';
import { updateUIForUser, initNavbar } from './navbar-logic.js';
import { getUserMetadata } from './user-metadata-logic.js';

// Access globally initialized Firebase services and functions
const {
    auth, db, onAuthStateChanged,
    ref, onValue, get, push, set, remove, query, orderByChild, limitToLast, serverTimestamp
} = window.firebaseApp;

let userRanks = [];
let currentPathRole = null;
const PATH_RANKS = ['builder', 'pvper', 'grinder'];

// ====================================
// UTILITY FUNCTIONS
// ====================================

window.showNotification = function (message, type = "success") {
    const container = document.getElementById('notification-container');
    if (!container) return;
    container.innerHTML = '';

    const notification = document.createElement('div');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        background: ${type === 'error' ? 'var(--error-color)' : type === 'warning' ? 'var(--warning-color)' : 'var(--success-color)'};
        color: white; padding: 15px 25px; border-radius: 8px; z-index: 9999;
        animation: slideIn 0.3s ease; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        max-width: 400px; word-wrap: break-word; font-family: 'Barlow', sans-serif;
    `;
    container.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

window.copyToClipboard = function (text) {
    navigator.clipboard.writeText(text).then(() => {
        window.showNotification('Copied to clipboard!');
    }).catch(err => {
        console.error('Copy failed:', err);
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        window.showNotification('Copied to clipboard!');
    });
};

window.copyIP = function () { window.copyToClipboard('titannetwork.eu'); };

window.joinServer = function () {
    const instructions = `To join TitanNetwork:\n1. Open Minecraft\n2. Click "Multiplayer"\n3. Click "Add Server"\n4. Enter: titannetwork.eu\n5. Click "Done" and join!`;
    alert(instructions);
    window.copyIP();
};

window.joinDiscord = function () {
    window.open('https://discord.gg/ExFhgvtFng', '_blank');
};

// ====================================
// INITIALIZATION
// ====================================

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const meta = await getUserMetadata(user.uid);
        userRanks = meta.ranks || [];
        const primaryRank = meta.rank?.toLowerCase() || 'user';
        const isOwner = primaryRank === 'owner' || userRanks.some(r => r.toLowerCase() === 'owner');
        const isAdmin = primaryRank === 'admin' || userRanks.some(r => r.toLowerCase() === 'admin');

        updatePageUI(user, meta);

        if (isOwner || isAdmin) {
            loadOwnerNews();
        } else {
            loadPublicNews();
        }

        updateServerStatus();

        try {
            const { setupPresenceTracking, startPresenceHeartbeat } = await import('./presence-logic.js');
            setupPresenceTracking(meta);
            startPresenceHeartbeat();
        } catch (e) {
            console.error("Presence tracking failed:", e);
        }
    } else {
        userRanks = [];
        currentPathRole = null;

        try {
            const { cleanupPresenceOnLogout } = await import('./presence-logic.js');
            cleanupPresenceOnLogout();
        } catch (e) {
            console.error("Presence cleanup failed:", e);
        }

        updatePageUI(null, null);
        loadPublicNews();
        updateServerStatus();
    }
});

// ====================================
// NEWS LOGIC
// ====================================

async function loadOwnerNews() {
    try {
        const newsRef = ref(db, 'news');
        const newsQuery = query(newsRef, orderByChild('timestamp'));

        onValue(newsQuery, (snapshot) => {
            const news = snapshot.val() || {};
            displayNews(news, true);
        });
    } catch (error) {
        console.error('Error loading news:', error);
        displayNews({}, true);
    }
}

async function loadPublicNews() {
    try {
        const newsRef = ref(db, 'news');
        const newsQuery = query(newsRef, orderByChild('timestamp'));

        onValue(newsQuery, (snapshot) => {
            const news = snapshot.val() || {};
            displayNews(news, false);
        });
    } catch (error) {
        console.error('Error loading news:', error);
        displayNews({}, false);
    }
}

let newsExpanded = false;
let latestNewsDataCache = {};
let latestNewsOwnerViewCache = false;
let newsCountUnsubscribers = [];

function clearNewsCountListeners() {
    newsCountUnsubscribers.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
    });
    newsCountUnsubscribers = [];
}

window.toggleNewsView = function () {
    newsExpanded = !newsExpanded;
    displayNews(latestNewsDataCache, latestNewsOwnerViewCache);
    const newsSection = document.querySelector('.news-section');
    if (newsExpanded && newsSection) {
        newsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

async function getCommentCount(threadId) {
    if (!threadId) return 0;
    try {
        const repliesRef = ref(db, `threads/news/${threadId}/replies`);
        const snapshot = await get(repliesRef);
        if (snapshot.exists()) {
            return Object.keys(snapshot.val()).length;
        }
    } catch (e) {
        console.error("Error fetching comment count:", e);
    }
    return 0;
}

async function displayNews(newsData, isOwnerView = false) {
    latestNewsDataCache = newsData || {};
    latestNewsOwnerViewCache = isOwnerView;

    const newsGrid = document.getElementById('news-grid');
    const actionsRow = document.getElementById('news-actions-row');
    const viewMoreBtn = document.getElementById('view-more-news-btn');
    const defaultPlaceholder = 'photos/1000+quality.jpg';

    if (!newsGrid) return;

    // Clear existing listeners to prevent leaks
    clearNewsCountListeners();

    let newsHTML = '';
    const newsArray = Object.entries(newsData);
    newsArray.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

    const publishedNews = newsArray.filter(([, article]) => article.published !== false);
    const totalCount = publishedNews.length;

    if (totalCount === 0) {
        if (actionsRow) actionsRow.style.display = 'none';
        newsGrid.innerHTML = `
            <div style="text-align: center; grid-column: 1 / -1; padding: 40px;">
              <h3 style="color: var(--accent-color); margin-bottom: 15px;">Welcome to TitanNetwork</h3>
              <p style="color: var(--text-secondary);">Latest updates will appear here.</p>
              ${latestNewsOwnerViewCache ? `<button onclick="createNews()" class="btn btn-primary" style="margin: 20px auto 0; max-width: 200px;"><i class="fas fa-plus"></i> Create News</button>` : ''}
            </div>
        `;
        return;
    }

    // Standard newest-first behavior
    const featured = publishedNews[0];
    const archives = publishedNews.slice(1, newsExpanded ? 999 : 5);

    // 1. RENDER FEATURED (NEWEST) FIRST
    const [fid, farticle] = featured;
    const fdate = new Date(farticle.timestamp).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
    });
    const fcategory = farticle.category || 'Announcement';
    const fbadgeClass = 'badge-tag badge-' + fcategory.toLowerCase();
    const showBadge = true;
    const fformattedDesc = window.formatRichText(farticle.description || farticle.content || '');
    const fauthorName = farticle.authorName || (farticle.author ? farticle.author.split('@')[0] : 'Admin');
    const fauthorUid = farticle.authorUid || '';
    const defaultAvatarSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><rect width='64' height='64' rx='32' fill='#0b2a45'/><circle cx='32' cy='24' r='12' fill='#58c8ff'/><path d='M14 54c2-10 10-16 18-16s16 6 18 16' fill='#58c8ff'/></svg>`)}`;

    const hasImage = farticle.featuredImage !== 'none';
    if (hasImage) {
        newsHTML += `
            <div class="news-featured-section">
                <div class="news-archive-title-label"><i class="fas fa-star"></i> Featured Post</div>
                <div class="news-post-item" data-id="${fid}">
                  <div class="news-card big-news-card">
                    <div class="featured-image-container">
                      ${showBadge ? `<span class="${fbadgeClass}">${fcategory}</span>` : ''}
                      <img src="${farticle.featuredImage || farticle.image || defaultPlaceholder}" 
                           class="featured-image" 
                           alt="${farticle.title}"
                           onerror="this.src='${defaultPlaceholder}'">
                      ${isOwnerView ? `<button class="news-delete-btn" onclick="const e = arguments[0] || window.event; e.stopPropagation(); deleteNews('${fid}')" title="Delete News"><i class="fas fa-trash"></i></button>` : ''}
                      
                      <div class="news-card-body">
                        <h3 class="news-title">${farticle.title}</h3>
                        <div class="news-meta-inline">
                            <div class="news-date"><i class="far fa-calendar-alt"></i> ${fdate}</div>
                            <div class="news-comment-count" data-thread-id="${farticle.forumThreadId || ''}"><i class="far fa-comments"></i> <span class="count">0</span> Comments</div>
                        </div>
                        <div class="news-short-preview">${farticle.preview || (farticle.content ? farticle.content.substring(0, 100) + '...' : '')}</div>
                      </div>
                    </div>
                    <div class="news-description-section">
                      <div class="news-description-tag"><i class="fas fa-info-circle"></i> QUICK SUMMARY</div>
                      <div class="news-description-content ${fformattedDesc.length > 750 ? 'collapsed' : ''}">${fformattedDesc}</div>
                      ${fformattedDesc.length > 750 ? `
                      <button class="read-more-btn" onclick="toggleReadMore(this)">
                        Read More <i class="fas fa-chevron-down"></i>
                      </button>` : ''}
                      <div class="news-author-footer">
                        <img src="${defaultAvatarSvg}" class="news-author-avatar" data-author-uid="${fauthorUid}" alt="${fauthorName}">
                        <div class="author-details">
                          <span class="posted-by-label">POSTED BY</span>
                          <span class="author-name-text">${fauthorName}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
            </div>
        `;
    } else {
        newsHTML += `
            <div class="news-featured-section">
                <div class="news-archive-title-label"><i class="fas fa-star"></i> Featured Post</div>
                <div class="news-post-item" data-id="${fid}">
                  <div class="news-card big-news-card text-only-mode" style="padding: 40px; background: var(--secondary-bg); border-radius: var(--radius-xl); border-left: 5px solid var(--accent-color);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 20px;">
                        ${showBadge ? `<span class="${fbadgeClass}" style="position: static;">${fcategory}</span>` : ''}
                        <div class="news-date" style="color: var(--text-secondary); font-size: 0.9rem; font-weight: 700; text-transform: uppercase;"><i class="far fa-calendar-alt"></i> ${fdate}</div>
                    </div>
                    
                    ${isOwnerView ? `<button class="news-delete-btn" style="top: 25px; right: 25px; position: absolute;" onclick="const e = arguments[0] || window.event; e.stopPropagation(); deleteNews('${fid}')" title="Delete News"><i class="fas fa-trash"></i></button>` : ''}
                    
                    <h3 class="news-title" style="font-size: 2.2rem; color: #fff; margin-bottom: 20px; font-weight: 900; line-height: 1.2; text-shadow: none;">${farticle.title}</h3>
                    
                    <div class="news-description-content ${fformattedDesc.length > 750 ? 'collapsed' : ''}" style="font-size: 1.15rem; line-height: 1.8; color: #cbd5e1; margin-bottom: 20px;">${fformattedDesc}</div>
                    
                    ${fformattedDesc.length > 750 ? `
                    <button class="read-more-btn" onclick="toggleReadMore(this)" style="margin-bottom: 20px;">
                      Read More <i class="fas fa-chevron-down"></i>
                    </button>` : ''}
                    
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.05);">
                        <div class="news-author-footer" style="padding: 0; background: transparent; border: none; box-shadow: none;">
                          <img src="${defaultAvatarSvg}" class="news-author-avatar" data-author-uid="${fauthorUid}" alt="${fauthorName}" style="width: 40px; height: 40px;">
                          <div class="author-details">
                            <span class="posted-by-label" style="font-size: 0.65rem;">POSTED BY</span>
                            <span class="author-name-text" style="font-size: 0.9rem; color: var(--accent-color);">${fauthorName}</span>
                          </div>
                        </div>
                        <div class="news-meta-inline" style="background: rgba(0,0,0,0.3); padding: 8px 16px; border-radius: 8px; font-size: 0.85rem;">
                            <div class="news-comment-count" data-thread-id="${farticle.forumThreadId || ''}"><i class="far fa-comments"></i> <span class="count">0</span> Comments</div>
                        </div>
                    </div>
                  </div>
                </div>
            </div>
        `;
    }

    // 2. RENDER ARCHIVES (OLD NEWS) SECOND
    if (archives.length > 0) {
        newsHTML += `<div class="news-archive-container">`;
        newsHTML += `<div class="news-archive-title-label" style="grid-column: 1/-1;"><i class="fas fa-history"></i> News Archive</div>`;
        for (const [id, article] of archives) {
            const date = new Date(article.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const snippet = (article.preview || (article.content ? article.content.substring(0, 80) + '...' : ''))
                .replace(/\*\*(.*?)\*\*/g, '$1')
                .replace(/\n/g, ' ');
            const archiveHasImage = article.featuredImage !== 'none';
            const imgWrapper = archiveHasImage ? `
                    <div class="archive-image-wrapper">
                        <img src="${article.featuredImage || article.image || defaultPlaceholder}" class="archive-thumbnail">
                    </div>
            ` : '';
            
            newsHTML += `
                <div class="news-archive-item" onclick="window.location.href='news.html?id=${id}'">
                    ${imgWrapper}
                    <div class="archive-info" ${archiveHasImage ? '' : 'style="width: 100%"'}>
                        <span class="archive-title"><span class="badge-tag badge-${(article.category || 'announcement').toLowerCase()}" style="font-size:0.65rem;">${article.category || 'Announcement'}</span>${article.title}</span>
                        <div class="archive-meta">
                            <span class="archive-date">${date}</span>
                            <span class="archive-comments" data-thread-id="${article.forumThreadId || ''}"><i class="far fa-comments"></i> <span class="count">0</span></span>
                        </div>
                        <p class="archive-description">${snippet}</p>
                    </div>
                </div>
            `;
        }
        newsHTML += `</div>`;
    }

    newsGrid.innerHTML = newsHTML;

    // 3. ATTACH REAL-TIME COMMENT LISTENERS
    document.querySelectorAll('[data-thread-id]').forEach(el => {
        const threadId = el.dataset.threadId;
        if (!threadId) return;

        const countSpan = el.querySelector('.count');
        const repliesRef = ref(db, `threads/news/${threadId}/replies`);
        
        const unsub = onValue(repliesRef, (snapshot) => {
            const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
            if (countSpan) countSpan.textContent = count;
            
            // Adjust "Comment" vs "Comments" for featured especially
            if (el.classList.contains('news-comment-count')) {
                const suffix = count === 1 ? ' Comment' : ' Comments';
                el.innerHTML = `<i class="far fa-comments"></i> <span class="count">${count}</span>${suffix}`;
            }
        });

        newsCountUnsubscribers.push(unsub);
    });

    if (actionsRow && viewMoreBtn) {
        if (totalCount > 5) {
            actionsRow.style.display = 'flex';
            viewMoreBtn.textContent = newsExpanded ? 'Show Less' : 'View More News';
        } else {
            actionsRow.style.display = 'none';
        }
    }

    if (isOwnerView) {
        const fab = document.getElementById('create-news-fab');
        if (fab) fab.style.display = 'flex';
    }

    hydrateNewsAuthorPfps(defaultAvatarSvg);
}

// Modal viewer logic removed - transitioned to dedicated news.html page

window.toggleReadMore = function (btn) {
    const content = btn.parentElement.querySelector('.news-description-content');
    if (!content) return;

    const isCollapsed = content.classList.toggle('collapsed');
    btn.classList.toggle('expanded', !isCollapsed);

    if (isCollapsed) {
        btn.innerHTML = `Read More <i class="fas fa-chevron-down"></i>`;
        // Scroll back to the top of the card if needed
        btn.closest('.news-post-item').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        btn.innerHTML = `Show Less <i class="fas fa-chevron-up"></i>`;
    }
};

async function hydrateNewsAuthorPfps(defaultAvatar) {
    const avatarEls = Array.from(document.querySelectorAll('.news-author-avatar[data-author-uid]'));
    const uidSet = new Set(avatarEls.map(el => el.dataset.authorUid).filter(uid => uid));

    for (const uid of uidSet) {
        try {
            const snap = await get(ref(db, `pfp/${uid}`));
            const pfpUrl = snap.exists() ? snap.val() : defaultAvatar;
            document.querySelectorAll(`.news-author-avatar[data-author-uid="${uid}"]`).forEach(el => {
                el.src = pfpUrl;
                el.onerror = () => el.src = defaultAvatar;
            });
        } catch (err) {
            console.warn(`Failed to load PFP for uid ${uid}:`, err);
        }
    }
}

window.toggleNewsContent = function (btn) {
    const card = btn.closest('.news-card');
    const desc = card ? card.querySelector('.news-description') : null;
    if (!desc) return;

    const isExpanded = desc.classList.toggle('expanded');
    desc.classList.toggle('truncated', !isExpanded);
    btn.innerHTML = isExpanded
        ? `Show Less <i class="fas fa-chevron-up"></i>`
        : `Read More <i class="fas fa-chevron-right"></i>`;
};

window.createNews = function () {
    const modal = document.getElementById('news-creation-modal');
    if (modal) {
        document.getElementById('news-creation-form')?.reset();
        
        // Reset preview area
        const previewArea = document.getElementById('news-preview-area');
        if (previewArea) {
            previewArea.innerHTML = '<span style="color: var(--text-secondary); font-style: italic;">Preview will appear here as you type...</span>';
        }
        const counter = document.getElementById('content-counter');
        if (counter) counter.textContent = '0';

        document.getElementById('preview-container').style.display = 'none';
        modal.style.display = 'flex';
    }
};

// Initialize listeners for News Creation
document.addEventListener('DOMContentLoaded', () => {
    const newsContent = document.getElementById('news-content');
    const newsPreview = document.getElementById('news-preview-area');
    const contentCounter = document.getElementById('content-counter');

    if (newsContent && newsPreview) {
        newsContent.addEventListener('input', () => {
            const val = newsContent.value;
            if (contentCounter) contentCounter.textContent = val.length;
            
            if (val.trim()) {
                newsPreview.innerHTML = window.formatRichText(val);
            } else {
                newsPreview.innerHTML = '<span style="color: var(--text-secondary); font-style: italic;">Preview will appear here as you type...</span>';
            }
        });
    }
});

window.closeNewsCreationModal = function () {
    const modal = document.getElementById('news-creation-modal');
    if (modal) modal.style.display = 'none';
};

window.deleteNews = async function (id) {
    if (!confirm('Are you sure you want to delete this news article?')) return;
    try {
        await remove(ref(db, `news/${id}`));
        loadOwnerNews();
    } catch (error) {
        console.error('Error deleting news:', error);
    }
};

// ====================================
// SERVER STATUS LOGIC
// ====================================

async function updateServerStatus() {
    const playerCount = document.getElementById('player-count');
    const onlineCountElement = document.getElementById('online-count');
    if (!playerCount) return;

    try {
        const response = await fetch('https://api.mcsrvstat.us/2/titannetwork.eu');
        if (!response.ok) throw new Error('Network response fallback');
        const data = await response.json();

        if (data.online) {
            const count = data.players?.online || 0;
            playerCount.textContent = `${count} Player${count !== 1 ? 's' : ''} Online`;
            playerCount.style.background = 'var(--accent-color)';
            if (onlineCountElement) onlineCountElement.textContent = count;
        } else {
            playerCount.textContent = 'Server Offline';
            playerCount.style.background = 'var(--error-color)';
            if (onlineCountElement) onlineCountElement.textContent = '0';
        }
    } catch (error) {
        console.error('Error fetching server status:', error);
        playerCount.textContent = 'Status Unavailable';
        if (onlineCountElement) onlineCountElement.textContent = '-';
    }
}

// ====================================
// PATH SELECTION LOGIC
// ====================================

window.choosePath = async function (pathRank) {
    if (!PATH_RANKS.includes(pathRank)) return;
    const user = auth.currentUser;
    if (!user) {
        alert('Please login first to choose your path.');
        return;
    }

    try {
        await set(ref(db, `users/${user.uid}/pathRole`), pathRank);
        currentPathRole = pathRank;

        // Refresh UI
        const meta = await getUserMetadata(user.uid);
        const { updateUIForUser } = await import('./navbar-logic.js');
        updateUIForUser(user);
        updatePageUI(user, meta);

        alert(`Path updated: ${pathRank}`);
    } catch (error) {
        console.error('Error updating path rank:', error);
    }
};

function updatePageUI(user, meta) {
    const userPathRole = document.getElementById('user-path-role');
    const ownerSetupBtn = document.getElementById('owner-setup-btn');

    if (user && meta) {
        const ranks = meta.ranks || [];
        const pathRank = currentPathRole || ranks.find(r => PATH_RANKS.includes(r.toLowerCase()));
        if (userPathRole) {
            userPathRole.textContent = pathRank ? `Path: ${pathRank.toUpperCase()}` : 'Path: Not selected';
        }

        const primaryRank = meta.rank?.toLowerCase() || 'user';
        const isOwner = primaryRank === 'owner' || ranks.some(r => r.toLowerCase() === 'owner');
        const isAdmin = primaryRank === 'admin' || ranks.some(r => r.toLowerCase() === 'admin');

        if (ownerSetupBtn) ownerSetupBtn.style.display = (isOwner || isAdmin) ? 'none' : 'block';
    } else {
        if (userPathRole) userPathRole.textContent = 'Path: Not selected';
        if (ownerSetupBtn) ownerSetupBtn.style.display = 'block';
    }
}

// ====================================
// NEWS PUBLISHING
// ====================================

window.switchPostType = function (type) {
    const textTab = document.getElementById('post-type-text');
    const imageTab = document.getElementById('post-type-image');
    const masterSection = document.getElementById('master-image-section');
    
    if (textTab) textTab.classList.toggle('active', type === 'text');
    if (imageTab) imageTab.classList.toggle('active', type === 'image');
    if (masterSection) masterSection.style.display = type === 'image' ? 'block' : 'none';
};

window.switchImageOption = function (option) {
    document.getElementById('tab-upload').classList.toggle('active', option === 'upload');
    document.getElementById('tab-url').classList.toggle('active', option === 'url');
    document.getElementById('image-upload-option').style.display = option === 'upload' ? 'block' : 'none';
    document.getElementById('image-url-option').style.display = option === 'url' ? 'block' : 'none';
};

window.previewImage = function (input) {
    const preview = document.getElementById('image-preview');
    const container = document.getElementById('preview-container');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            container.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.previewImageUrl = function (url) {
    const preview = document.getElementById('image-preview');
    const container = document.getElementById('preview-container');
    if (url) {
        preview.src = url;
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
};

async function compressImage(file, maxWidth = 800, maxHeight = 600, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                if (width > height) {
                    if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
                } else {
                    if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
                }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function publishNews() {
    const user = auth.currentUser;
    const publishBtn = document.getElementById('publish-news-btn');
    if (!user) return;

    const title = document.getElementById('news-title').value.trim();
    const preview = document.getElementById('news-preview').value.trim();
    const description = document.getElementById('news-content').value.trim();
    const pinned = !!document.getElementById('news-pinned')?.checked;
    const category = document.getElementById('news-category')?.value || 'Announcement';

    if (!title || !preview || !description) {
        alert('Please fill in required fields');
        return;
    }

    try {
        if (publishBtn) publishBtn.disabled = true;
        let imageUrl = '';
        
        // Determine if they chose 'With Image' instead of 'Text Only'
        const imageTab = document.getElementById('post-type-image');
        const wantsImage = imageTab ? imageTab.classList.contains('active') : true;

        if (wantsImage) {
            const uploadTabActive = document.getElementById('tab-upload').classList.contains('active');
            if (uploadTabActive) {
                const fileInput = document.getElementById('news-image-file');
                if (fileInput && fileInput.files[0]) imageUrl = await compressImage(fileInput.files[0]);
            } else {
                imageUrl = document.getElementById('news-image-url').value.trim();
            }
        }

        const finalImage = wantsImage ? (imageUrl || 'photos/1000+quality.jpg') : 'none';

        // 1. First, create a corresponding forum thread in the 'news' channel
        const threadData = {
            title: title,
            content: description,
            featuredImage: finalImage, // Include news image or none
            authorUid: user.uid,
            authorName: user.displayName || user.email.split('@')[0],
            timestamp: serverTimestamp(),
            lastActivity: serverTimestamp(),
            lastAuthorName: user.displayName || user.email.split('@')[0],
            type: 'news_sync',
            category: category
        };

        const threadRef = push(ref(db, 'threads/news'));
        const forumThreadId = threadRef.key;
        await set(threadRef, threadData);

        const newsData = {
            title,
            preview,
            description,
            pinned,
            featuredImage: finalImage,
            author: user.email,
            authorName: user.displayName || user.email.split('@')[0],
            authorUid: user.uid,
            timestamp: Date.now(),
            published: true,
            category: category,
            forumThreadId: forumThreadId // Link to the forum thread
        };

        await push(ref(db, 'news'), newsData);
        closeNewsCreationModal();
        window.showNotification('News published successfully!', 'success');
    } catch (error) {
        console.error('Error publishing news:', error);
        window.showNotification('Error: ' + error.message, 'error');
    } finally {
        if (publishBtn) publishBtn.disabled = false;
    }
}

// Statistics
window.viewStats = async function () {
    try {
        const [usersSnap, newsSnap] = await Promise.all([
            get(ref(db, 'users')),
            get(ref(db, 'news'))
        ]);
        const userCount = Object.keys(usersSnap.val() || {}).length;
        const newsCount = Object.keys(newsSnap.val() || {}).length;

        const statsHTML = `
            <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 10px; margin-top: 20px;">
                <h4 style="color: var(--accent-color); margin-bottom: 15px;">📊 Server Statistics</h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; text-align: center;">
                    <div><div style="font-size: 1.5rem; font-weight: 800;">${userCount}</div><div style="font-size: 0.8rem; color: var(--text-secondary);">Total Users</div></div>
                    <div><div style="font-size: 1.5rem; font-weight: 800;">${newsCount}</div><div style="font-size: 0.8rem; color: var(--text-secondary);">News Articles</div></div>
                    <div><div style="font-size: 1.5rem; font-weight: 800;" id="online-count">0</div><div style="font-size: 0.8rem; color: var(--text-secondary);">Online Players</div></div>
                </div>
            </div>
        `;
        const statsEl = document.getElementById('owner-stats');
        if (statsEl) { statsEl.innerHTML = statsHTML; statsEl.style.display = 'block'; }
        updateServerStatus();
    } catch (e) {
        console.error(e);
    }
};

// ====================================
// PAGE EVENT LISTENERS
// ====================================

document.addEventListener('DOMContentLoaded', async () => {
    initNavbar();

    try {
        const { initOnlineUsersWidgets } = await import('./online-users-logic.js');
        initOnlineUsersWidgets();
    } catch (e) {
        console.error("Online widgets initialization failed:", e);
    }

    setInterval(updateServerStatus, 30000);

    const newsForm = document.getElementById('news-creation-form');
    if (newsForm) {
        newsForm.onsubmit = (e) => { e.preventDefault(); publishNews(); };
    }

    const previewInput = document.getElementById('news-preview');
    const contentTextarea = document.getElementById('news-content');
    const counterElement = document.getElementById('content-counter');

    if (contentTextarea && counterElement) {
        contentTextarea.addEventListener('input', function () {
            counterElement.textContent = this.value.length;
        });
    }

    // Optional: add counter for preview if needed, or just let maxlength handle it
});



