import { getUserMetadata, renderBadges } from './user-metadata-logic.js';

let isOverlayCreated = false;

/**
 * Initializes listeners for profile card triggers.
 */
export function initProfileCardTriggers() {
    document.addEventListener('click', async (e) => {
        // Find if we clicked a PFP or a username that should trigger the card
        const trigger = e.target.closest('.post-author-pfp, .post-author-name, [data-user-uid]');
        
        if (trigger) {
            e.preventDefault();
            const parent = trigger.closest('.post-sidebar, [data-post-author-uid]');
            // Some triggers might have UID directly in data attribute
            let uid = trigger.dataset.userUid;
            
            // If not in data attribute, try to find it in the post-logic context or similar
            if (!uid && trigger.closest('.post-card')) {
                // This is a bit tricky, we might need to store the UID on the element
                // For now, let's assume we update post-logic.js to add data-author-uid
                uid = trigger.closest('.post-sidebar').dataset.authorUid;
            }

            if (uid) {
                showProfileCard(uid);
            }
        }
    });
}

async function showProfileCard(uid) {
    if (!isOverlayCreated) {
        createOverlay();
    }

    const overlay = document.getElementById('profile-card-overlay');
    const cardContent = document.getElementById('mini-profile-card');
    
    // Show loading state or clear previous
    cardContent.innerHTML = '<div style="padding: 40px; text-align: center; color: white;">Loading Profile...</div>';
    overlay.classList.add('active');

    const meta = await getUserMetadata(uid);
    if (!meta) {
        cardContent.innerHTML = '<div style="padding: 40px; text-align: center; color: white;">Failed to load profile.</div>';
        return;
    }

    const badgesHtml = renderBadges(meta);

    cardContent.innerHTML = `
        <div class="mini-card-header">
            <span class="close-mini-card" onclick="window.closeProfileCard()">&times;</span>
        </div>
        <img src="${meta.pfpUrl}" class="mini-card-pfp" alt="Avatar">
        <div class="mini-card-content">
            <div class="mini-card-username">${meta.username || meta.email?.split('@')[0] || 'Anonymous'}</div>
            <div class="mini-card-ranks" style="display: flex; flex-wrap: wrap; gap: 4px; border-top: 1px solid var(--border); padding-top: 10px; margin-top: 5px;">
                ${badgesHtml}
            </div>
            <div class="mini-card-bio">${meta.bio}</div>
            <div class="mini-card-stats">
                <div class="mini-card-stat">
                    <span class="mini-stat-val">${meta.joined}</span>
                    <span class="mini-stat-lbl">Joined</span>
                </div>
            </div>
            <div class="mini-card-actions">
                <a href="profile.html?user=${uid}" class="btn-full-profile" style="flex: 1; text-align: center;">View Full Profile</a>
            </div>
        </div>
    `;
}

function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'profile-card-overlay';
    overlay.className = 'profile-card-overlay';
    overlay.innerHTML = '<div id="mini-profile-card" class="mini-profile-card"></div>';
    
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeProfileCard();
        }
    });

    window.closeProfileCard = closeProfileCard;
    isOverlayCreated = true;
}

function closeProfileCard() {
    const overlay = document.getElementById('profile-card-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}
