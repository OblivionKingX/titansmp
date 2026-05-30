const firebase = require('./firebase');
const parser = require('./parser');

const MAX_DAILY_FORUM_POINTS = 20;

class ForumSyncManager {
  constructor() {
    this.isSyncing = false;
  }

  /**
   * Helper to fetch username (IGN) for a Firebase UID
   */
  async getUsernameByUid(uid) {
    if (!uid) return null;
    try {
      const userSnap = await firebase.db.ref(`users/${uid}`).once('value');
      if (userSnap.exists()) {
        const val = userSnap.val();
        return val ? val.username : null;
      }
    } catch (err) {
      console.error(`[ForumSync] Failed to fetch username for UID ${uid}:`, err.message);
    }
    return null;
  }

  /**
   * Helper to securely award points while respecting the daily limit
   */
  async awardForumPoints(cleanedIgn, amount, type, description, timestamp) {
    const playerRef = firebase.db.ref(`playerData/${cleanedIgn}`);
    const playerSnap = await playerRef.once('value');
    const pData = playerSnap.val() || {};
    
    let currentPoints = pData.points || 0;
    let earnedToday = pData.forumPointsEarnedToday || 0;
    let lastDate = pData.lastForumPointDate || '';

    // Get current UTC date string (e.g., '2026-05-30')
    const today = new Date().toISOString().split('T')[0];

    // Reset daily counter if it's a new day
    if (lastDate !== today) {
      earnedToday = 0;
      lastDate = today;
    }

    if (earnedToday >= MAX_DAILY_FORUM_POINTS) {
      console.log(`[ForumSync] ${cleanedIgn} has hit the daily forum point cap. Skipping points for ${type}.`);
      return false; // Did not award
    }

    // Calculate how much we can actually award without exceeding the cap
    const pointsToAward = Math.min(amount, MAX_DAILY_FORUM_POINTS - earnedToday);
    
    currentPoints += pointsToAward;
    earnedToday += pointsToAward;

    await playerRef.update({
      points: currentPoints,
      forumPointsEarnedToday: earnedToday,
      lastForumPointDate: lastDate
    });

    // Write point transaction log
    const txRef = firebase.db.ref('point_transactions').push();
    await txRef.set({
      playerName: cleanedIgn,
      amount: pointsToAward,
      type: type,
      description: description + (pointsToAward < amount ? ` (Capped to ${pointsToAward})` : ''),
      timestamp: timestamp
    });

    return true; // Awarded
  }

  /**
   * Scans for new forum activity and awards points
   */
  async sync() {
    if (this.isSyncing) {
      console.warn('[ForumSync] Synchronization already in progress, skipping...');
      return;
    }

    if (!firebase.db) {
      console.warn('[ForumSync] Firebase database not initialized yet, skipping');
      return;
    }

    this.isSyncing = true;
    console.log('[ForumSync] Checking for new forum activity...');

    try {
      // 1. Fetch the checkpoint (last processed time)
      const checkpointRef = firebase.db.ref('forum_sync/lastProcessedTime');
      const checkpointSnap = await checkpointRef.once('value');
      
      // Default to current time if no checkpoint exists to avoid retroactively rewarding past posts
      let lastProcessedTime = checkpointSnap.val();
      if (!lastProcessedTime) {
        lastProcessedTime = Date.now();
        await checkpointRef.set(lastProcessedTime);
        console.log(`[ForumSync] No previous checkpoint found. Initialized checkpoint to: ${new Date(lastProcessedTime).toISOString()}`);
        this.isSyncing = false;
        return;
      }

      console.log(`[ForumSync] Syncing posts created after: ${new Date(lastProcessedTime).toISOString()}`);

      // 2. Fetch all threads
      const threadsSnap = await firebase.db.ref('threads').once('value');
      if (!threadsSnap.exists()) {
        console.log('[ForumSync] No threads found in database.');
        this.isSyncing = false;
        return;
      }

      const threadsData = threadsSnap.val() || {};
      let highestTimestampFound = lastProcessedTime;
      let rewardCount = 0;

      // 3. Process categories, threads, and replies
      for (const [forumId, threads] of Object.entries(threadsData)) {
        if (!threads || typeof threads !== 'object') continue;

        for (const [threadId, thread] of Object.entries(threads)) {
          if (!thread || typeof thread !== 'object') continue;

          // A. Process the thread itself
          const threadTimestamp = thread.timestamp || 0;
          if (threadTimestamp > lastProcessedTime) {
            if (threadTimestamp > highestTimestampFound) {
              highestTimestampFound = threadTimestamp;
            }

            const authorUid = thread.authorUid;
            const ign = await this.getUsernameByUid(authorUid);
            const cleanedIgn = ign ? parser.cleanName(ign) : null;

            if (cleanedIgn) {
              console.log(`[ForumSync] New thread detected! Title: "${thread.title}" by ${cleanedIgn}. Attempting to award 5 points.`);
              
              const awarded = await this.awardForumPoints(
                cleanedIgn, 
                5, 
                'forum_thread', 
                `Earned 5 Points for creating a new thread: ${thread.title}`, 
                threadTimestamp
              );
              
              if (awarded) rewardCount++;
            } else {
              console.warn(`[ForumSync] Skipped thread "${thread.title}" - UID ${authorUid} has no registered username.`);
            }
          }

          // B. Process replies in the thread
          if (thread.replies && typeof thread.replies === 'object') {
            for (const [replyId, reply] of Object.entries(thread.replies)) {
              if (!reply || typeof reply !== 'object') continue;

              const replyTimestamp = reply.timestamp || 0;
              if (replyTimestamp > lastProcessedTime) {
                if (replyTimestamp > highestTimestampFound) {
                  highestTimestampFound = replyTimestamp;
                }

                const authorUid = reply.authorUid;
                const ign = await this.getUsernameByUid(authorUid);
                const cleanedIgn = ign ? parser.cleanName(ign) : null;

                if (cleanedIgn) {
                  console.log(`[ForumSync] New reply detected! By ${cleanedIgn} in "${thread.title}". Attempting to award 2 points.`);

                  const awarded = await this.awardForumPoints(
                    cleanedIgn, 
                    2, 
                    'forum_reply', 
                    `Earned 2 Points for replying to thread: ${thread.title}`, 
                    replyTimestamp
                  );

                  if (awarded) rewardCount++;
                } else {
                  console.warn(`[ForumSync] Skipped reply ${replyId} - UID ${authorUid} has no registered username.`);
                }
              }
            }
          }
        }
      }

      // 4. Update the checkpoint if we found any newer post timestamps
      if (highestTimestampFound > lastProcessedTime) {
        // Add a 1ms offset to prevent matching the exact same post next time
        await checkpointRef.set(highestTimestampFound + 1);
        console.log(`[ForumSync] Updated last processed checkpoint to: ${new Date(highestTimestampFound + 1).toISOString()}`);
      }

      console.log(`[ForumSync] Synchronization finished. Processed ${rewardCount} new rewards.`);
    } catch (error) {
      console.error('[ForumSync] Synchronization failed:', error.message);
    } finally {
      this.isSyncing = false;
    }
  }
}

module.exports = new ForumSyncManager();
