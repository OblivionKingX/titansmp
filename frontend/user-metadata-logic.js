import { db, fs, ref, get, update, increment, doc, getDoc } from './firebase-global.js';

const metadataCache = new Map();

export const ADMIN_CONFIG = {
  OWNER_EMAILS: ["oblivionkingx228@gmail.com", "lowiekstaessen@gmail.com"],
  CO_OWNER_EMAILS: ["tadejmuhic8@gmail.com"],
  ADMIN_EMAILS: ["lowiekstaessen@gmail.com"],
  STAFF_EMAILS: []
};

/**
 * Fetches comprehensive metadata for a user.
 */
export async function getUserMetadata(uid, forceRefresh = false) {
  if (!uid) return null;
  if (!forceRefresh && metadataCache.has(uid)) return metadataCache.get(uid);

  // Fetch role and additional ranks from Firestore
  async function fetchUserRoles(targetUid) {
    try {
      const userDoc = await getDoc(doc(fs, "users", targetUid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        return {
          role: data.role || 'user',
          ranks: data.ranks || [],
          pfp: data.pfp || null,
          photoURL: data.photoURL || data.avatar || null
        };
      }
      return { role: 'user', ranks: [], pfp: null, photoURL: null };
    } catch (err) {
      console.error('Error fetching roles from Firestore:', err);
      return { role: 'user', ranks: [] };
    }
  }
  
  const metadata = {
    rank: 'Member',
    ranks: [],
    joined: 'Unknown',
    messageCount: 0,
    bio: 'No bio yet.',
    pfpUrl: null // Initialize as null to allow fallback
  };

  try {
    // 1. Fetch Basic Info & Join Date (May be denied if locked)
    try {
      const userSnap = await get(ref(db, `users/${uid}`));
      if (userSnap.exists()) {
        const data = userSnap.val();
        // Join date — check multiple field names
        const ts = data.registeredAt || data.createdAt || data.joinedAt;
        if (ts) metadata.joined = formatDate(ts);
        metadata.messageCount = data.messageCount || 0;
        metadata.bio = data.bio || 'No bio yet.';
        metadata.email = data.email || null;
        // Username stored directly in the users node
        metadata.username = data.username || data.displayName || null;
      }
    } catch (usersErr) {
      console.warn(`Users node access restricted for ${uid}:`, usersErr.message);
    }

    // 2. Fetch PFP (Exhaustive search)
    try {
      // Check RTDB top-level pfp node first
      const pfpSnap = await get(ref(db, `pfp/${uid}`));
      if (pfpSnap.exists()) {
        metadata.pfpUrl = pfpSnap.val();
      } else {
        // Check RTDB users node for pfp or photoURL
        const rtdbUserSnap = await get(ref(db, `users/${uid}`));
        if (rtdbUserSnap.exists()) {
           const rData = rtdbUserSnap.val();
           metadata.pfpUrl = rData.pfp || rData.photoURL || rData.avatar || null;
        }
      }
    } catch (pfpErr) {
      console.warn(`RTDB PFP check failed for ${uid}:`, pfpErr.message);
    }

    // 3. Determine Ranks & Firestore fallback PFP
    try {
      const roles = await fetchUserRoles(uid);
      let role = roles.role;
      let extraRanks = roles.ranks || [];
      
      // Override with email-based roles if available
      if (metadata.email) {
        const e = metadata.email.toLowerCase();
        
        // A. Hardcoded overrides
        if (ADMIN_CONFIG.OWNER_EMAILS.includes(e)) role = 'owner';
        else if (ADMIN_CONFIG.CO_OWNER_EMAILS && ADMIN_CONFIG.CO_OWNER_EMAILS.includes(e)) role = 'co-owner';
        else if (ADMIN_CONFIG.ADMIN_EMAILS.includes(e)) role = 'admin';
        else if (ADMIN_CONFIG.STAFF_EMAILS.includes(e)) role = 'staff';

        // B. Database-driven pre-assigned roles
        try {
          const emailRoleDoc = await getDoc(doc(fs, "email_roles", e));
          if (emailRoleDoc.exists()) {
            const erData = emailRoleDoc.data();
            if (erData.role) role = erData.role;
            if (erData.ranks && Array.isArray(erData.ranks)) {
                extraRanks = [...new Set([...extraRanks, ...erData.ranks])];
            }
          }
        } catch (err) {}
      }

      metadata.rank = role.charAt(0).toUpperCase() + role.slice(1);
      metadata.ranks = extraRanks;

      // Prioritize PFP: RTDB > Firestore (pfp or photoURL) > Default
      if (!metadata.pfpUrl) {
         metadata.pfpUrl = roles.pfp || roles.photoURL || roles.avatar || roles.photo || null;
      }

      // Final Fallback - Leave as null so caller can decide (e.g. Minotar skin)
      if (!metadata.pfpUrl) {
        metadata.pfpUrl = null;
      }
    } catch (roleErr) {
        console.warn(`Secure role access failed for ${uid}:`, roleErr.message);
    }

    metadataCache.set(uid, metadata);
    return metadata;
  } catch (err) {
    console.error(`Error in getUserMetadata for ${uid}:`, err);
    return metadata;
  }
}

/**
 * Explicitly clears the metadata cache for a given user.
 */
export function clearUserCache(uid) {
  if (uid) metadataCache.delete(uid);
}

/**
 * Increments the user's message count in the database.
 */
export async function incrementUserMessageCount(uid) {
  if (!uid) return;
  try {
    await update(ref(db, `users/${uid}`), {
      messageCount: increment(1)
    });
    // Invalidate cache if exists
    if (metadataCache.has(uid)) {
      const cached = metadataCache.get(uid);
      cached.messageCount++;
    }
  } catch (err) {
    console.error(`Error incrementing message count for ${uid}:`, err);
  }
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function getHighestRank(ranks) {
  if (!ranks) return 'Member';
  const ranksArray = Array.isArray(ranks) ? ranks : [ranks];
  const rankPriority = ['owner', 'co-owner', 'manager', 'admin', 'lead developer', 'developer', 'moderator', 'mod', 'helper', 'staff', 'builder', 'pvper', 'grinder', 'member'];
  
  for (const pRank of rankPriority) {
    if (ranksArray.some(r => r.toLowerCase() === pRank)) {
      if (pRank === 'mod') return 'Moderator';
      return pRank.charAt(0).toUpperCase() + pRank.slice(1);
    }
  }
  return 'Member';
}

/**
 * Fetches all threads and replies authored by a user.
 */
export async function fetchUserPosts(uid) {
  const posts = [];

  try {
    const forums = ['general-chat', 'off-topic', 'server-discussion', 'support', 'password-reset', 'suggestions', 'staff-apps', 'bug-reports'];
    
    for (const forumId of forums) {
      const threadsRef = ref(db, `threads/${forumId}`);
      const threadsSnap = await get(threadsRef);
      
      if (threadsSnap.exists()) {
        threadsSnap.forEach(threadChild => {
          const thread = threadChild.val();
          const threadId = threadChild.key;
          
          // Check if thread author
          if (thread.authorUid === uid) {
            posts.push({
              type: 'thread',
              id: threadId,
              forumId,
              title: thread.title,
              content: thread.content,
              timestamp: thread.timestamp
            });
          }
          
          // Check if reply author
          if (thread.replies) {
            Object.entries(thread.replies).forEach(([replyId, reply]) => {
              if (reply.authorUid === uid) {
                posts.push({
                  type: 'reply',
                  id: replyId,
                  threadId,
                  forumId,
                  threadTitle: thread.title,
                  content: reply.content,
                  timestamp: reply.timestamp
                });
              }
            });
          }
        });
      }
    }
  } catch (err) {
    console.error("Error fetching user posts:", err);
  }

  return posts.sort((a, b) => b.timestamp - a.timestamp);
}
/**
 * Utility to generate badges HTML for a user metadata object.
 */
export function renderBadges(meta) {
  if (!meta) return '';
  let badgesHtml = '';
  
  // 1. Primary Role Badge
  let primaryRoleClass = 'role-member';
  const rank = (meta.rank || 'Member').toLowerCase();
  if (rank === 'owner') primaryRoleClass = 'role-owner';
  else if (rank === 'co-owner') primaryRoleClass = 'role-co-owner';
  else if (rank === 'admin') primaryRoleClass = 'role-admin';
  else if (rank === 'manager') primaryRoleClass = 'role-manager';
  else if (['moderator', 'mod'].includes(rank)) primaryRoleClass = 'role-moderator';
  else if (rank === 'helper') primaryRoleClass = 'role-helper';
  else if (rank === 'developer' || rank === 'lead developer') primaryRoleClass = 'role-developer';
  else if (rank === 'staff') primaryRoleClass = 'role-staff';
  
  badgesHtml += `<span class="user-role ${primaryRoleClass}">${meta.rank || 'Member'}</span>`;

  // 2. Additional Rank Badges
  if (meta.ranks && meta.ranks.length > 0) {
    meta.ranks.forEach(r => {
      // Skip if this rank is already shown as the primary rank
      if (r.toLowerCase() === rank.toLowerCase()) return;
      
      const rLower = r.toLowerCase();
      let rClass = 'role-member';
      if (rLower === 'donator') rClass = 'role-donator';
      else if (rLower === 'known') rClass = 'role-known';
      else if (rLower === 'vip') rClass = 'role-vip';
      else if (rLower === 'royal') rClass = 'role-royal';
      else if (rLower === 'manager') rClass = 'role-manager';
      
      badgesHtml += `<span class="user-role ${rClass}">${r}</span>`;
    });
  }
  return badgesHtml;
}
