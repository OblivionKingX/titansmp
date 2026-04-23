import './firebase-global.js';
import { initNavbar } from './navbar-logic.js';
import { getUserMetadata, renderBadges, fetchUserPosts, incrementUserMessageCount } from './user-metadata-logic.js';

const { 
    auth, db, onAuthStateChanged, 
    ref, onValue, get, push, set, serverTimestamp 
} = window.firebaseApp;

let currentThreadId = null;

// ====================================
// INITIALIZATION
// ====================================

document.addEventListener('DOMContentLoaded', async () => {
    initNavbar();
    
    const urlParams = new URLSearchParams(window.location.search);
    const newsId = urlParams.get('id');

    if (!newsId) {
        renderError('No news article specified.');
        return;
    }

    onAuthStateChanged(auth, (user) => {
        initCommentForm(user);
    });

    await loadFullNews(newsId);
});

async function loadFullNews(id) {
    const contentArea = document.getElementById('news-content-area');
    const sidebar = document.getElementById('news-sidebar');

    try {
        const newsSnap = await get(ref(db, `news/${id}`));
        if (!newsSnap.exists()) {
            renderError('News article not found.');
            return;
        }

        const article = newsSnap.val();
        renderArticle(article);

        // Load Comments if thread linked
        if (article.forumThreadId) {
            currentThreadId = article.forumThreadId;
            loadComments(article.forumThreadId);
        } else {
             document.getElementById('comments-list').innerHTML = `
                <div class="loading-comments">Comments are disabled for this article.</div>
             `;
        }

        if (article.authorUid) {
            const authorMeta = await getUserMetadata(article.authorUid);
            const userPosts = await fetchUserPosts(article.authorUid);
            renderAuthorCard(authorMeta, userPosts.length);
        } else {
            renderGenericAuthor(article.authorName || 'Admin');
        }

    } catch (err) {
        console.error('Error loading news:', err);
        renderError('Failed to load news article.');
    }
}

function loadComments(threadId) {
    const commentsRef = ref(db, `threads/news/${threadId}/replies`);
    onValue(commentsRef, (snapshot) => {
        const replies = snapshot.val() || {};
        renderComments(replies);
    });
}

async function renderComments(replies) {
    const list = document.getElementById('comments-list');
    const repliesArray = Object.entries(replies).map(([id, data]) => ({ id, ...data }));
    repliesArray.sort((a, b) => a.timestamp - b.timestamp);

    if (repliesArray.length === 0) {
        list.innerHTML = `<div class="loading-comments">No comments yet. Be the first to start the discussion!</div>`;
        return;
    }

    list.innerHTML = ''; // Clear loading
    
    for (const reply of repliesArray) {
        const meta = await getUserMetadata(reply.authorUid);
        const date = new Date(reply.timestamp).toLocaleString();
        
        const item = document.createElement('div');
        item.className = 'comment-item';
        item.innerHTML = `
            <img src="${meta.pfpUrl || 'supreme_logo1.webp'}" class="comment-author-pfp" alt="Avatar">
            <div class="comment-content-area">
                <div class="comment-meta">
                    <span class="comment-author-name">${reply.authorName} ${renderBadges(meta)}</span>
                    <span class="comment-date">${getTimeAgo(reply.timestamp)}</span>
                </div>
                <div class="comment-text">${window.formatRichText(reply.content)}</div>
            </div>
        `;
        list.appendChild(item);
    }
}

function initCommentForm(user) {
    const container = document.getElementById('comment-form-container');
    if (!user) {
        container.innerHTML = `
            <div class="login-to-comment">
                Please <a href="index.html?login=true">Login</a> to join the discussion.
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="comments-header" style="font-size: 1.1rem; margin-bottom: 15px;">
            <i class="fas fa-pen-nib"></i> <span>Leave a Comment</span>
        </div>
        <textarea id="comment-text" class="comment-ta" placeholder="Share your thoughts..."></textarea>
        <button id="submit-comment-btn" class="comment-submit-btn">Post Comment</button>
        <div style="clear: both;"></div>
    `;

    document.getElementById('submit-comment-btn').onclick = publishComment;
}

async function publishComment() {
    const textEl = document.getElementById('comment-text');
    const btn = document.getElementById('submit-comment-btn');
    const content = textEl.value.trim();
    const user = auth.currentUser;

    if (!user || !content || !currentThreadId) return;

    try {
        btn.disabled = true;
        btn.textContent = 'Posting...';

        const replyData = {
            content,
            authorUid: user.uid,
            authorName: user.displayName || user.email.split('@')[0],
            timestamp: serverTimestamp()
        };

        const repliesRef = ref(db, `threads/news/${currentThreadId}/replies`);
        await push(repliesRef, replyData);
        await incrementUserMessageCount(user.uid);

        textEl.value = '';
    } catch (err) {
        console.error('Error posting comment:', err);
        alert('Failed to post comment.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Post Comment';
    }
}

// ====================================
// HELPERS
// ====================================

function renderArticle(article) {
    const contentArea = document.getElementById('news-content-area');
    const date = new Date(article.timestamp).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
    });

    const formattedContent = window.formatRichText(article.description || article.content || '');

    contentArea.innerHTML = `
        <img src="${article.featuredImage || article.image || 'supreme_logo1.webp'}" class="full-article-image" alt="Featured">
        <div class="full-article-body">
            <div class="full-article-meta">
                <span><i class="far fa-calendar-alt"></i> ${date}</span>
            </div>
            <h1 class="full-article-title">${article.title}</h1>
            <div class="full-article-content">
                ${formattedContent}
            </div>
        </div>
    `;
}

function renderAuthorCard(meta, postCount) {
    const sidebar = document.getElementById('news-sidebar');
    const defaultAvatar = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><rect width='64' height='64' rx='32' fill='#0b2a45'/><circle cx='32' cy='24' r='12' fill='#58c8ff'/><path d='M14 54c2-10 10-16 18-16s16 6 18 16' fill='#58c8ff'/></svg>`)}`;

    sidebar.innerHTML = `
        <div class="author-card-label">Article Author</div>
        <div class="mini-profile-card">
            <div class="mini-card-header"></div>
            <div class="mini-card-content">
                <img src="${meta.pfpUrl || defaultAvatar}" class="mini-card-pfp" alt="Author">
                <div class="mini-card-username">${meta.username || 'Admin'}</div>
                <div class="mini-card-ranks">
                    ${renderBadges(meta)}
                </div>
                
                <div class="forum-stats-v">
                    <div class="forum-stat-row">
                        <span class="forum-stat-lbl">Joined</span>
                        <span class="forum-stat-val">${meta.joined || 'Unknown'}</span>
                    </div>
                    <div class="forum-stat-row">
                        <span class="forum-stat-lbl">Total Posts</span>
                        <span class="forum-stat-val">${postCount}</span>
                    </div>
                    <div class="forum-stat-row">
                        <span class="forum-stat-lbl">Messages</span>
                        <span class="forum-stat-val">${meta.messageCount || 0}</span>
                    </div>
                </div>

                <div class="mini-card-bio">${meta.bio || 'TitanNetwork Staff Member'}</div>
                
                <div class="mini-card-actions">
                    <a href="profile.html?user=${meta.uid}" class="btn-full-profile">View Full Profile</a>
                </div>
            </div>
        </div>
    `;
}

function renderGenericAuthor(name) {
    const sidebar = document.getElementById('news-sidebar');
    sidebar.innerHTML = `<div class="author-card-label">Posted By</div><div class="mini-profile-card" style="padding: 20px; text-align: center;"><h3>${name}</h3></div>`;
}

function renderError(msg) {
    document.getElementById('news-content-area').innerHTML = `<div class="loading-state" style="color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i> ${msg}</div>`;
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

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
