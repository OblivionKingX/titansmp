// presence-logic.js

let presenceListenerAttachedFor = null;
let presenceConnectedUnsubscribe = null;
let presenceHeartbeatInterval = null;

const PRESENCE_HEARTBEAT_MS = 25000; // 25 seconds

export function stopPresenceHeartbeat() {
  if (presenceHeartbeatInterval) {
    clearInterval(presenceHeartbeatInterval);
    presenceHeartbeatInterval = null;
  }
}

export function startPresenceHeartbeat() {
  const { auth, db, ref, update } = window.firebaseApp;
  const user = auth.currentUser;
  if (!user) return;

  const emailKey = user.email.toLowerCase().replace(/\./g, '_');
  const userStatusRef = ref(db, `online-users/${emailKey}`);
  const staffStatusRef = ref(db, `online-staff/${emailKey}`);

  // ensure only one heartbeat loop
  stopPresenceHeartbeat();

  const beat = async () => {
    try {
      const { getUserMetadata } = await import('./user-metadata-logic.js');
      const meta = await getUserMetadata(user.uid, true);

      const STAFF_ROLES = ['owner', 'co-owner', 'admin', 'manager', 'mod', 'moderator', 'staff', 'helper', 'developer', 'lead developer', 'builder'];
      
      const primaryRank = (meta.rank || 'Member').toLowerCase();
      const otherRanks = (meta.ranks || []).map(r => r.toLowerCase());
      const isStaff = STAFF_ROLES.includes(primaryRank) ||
        otherRanks.some(r => STAFF_ROLES.includes(r));

      console.log(`[Presence] Heartbeat for ${user.emailRaw || user.email}: Rank=${meta.rank}, isStaff=${isStaff}`);

      const ranksForPresence = meta.ranks?.includes(meta.rank) ? meta.ranks : [meta.rank, ...(meta.ranks || [])].filter(Boolean);

      const presenceData = {
        online: true,
        lastSeen: Date.now(),
        username: meta.username || user.displayName || user.email.split('@')[0],
        email: user.email,
        uid: user.uid,
        ranks: ranksForPresence,
        photoURL: meta.pfpUrl || null
      };

      await update(userStatusRef, presenceData);

      if (isStaff) {
        await update(staffStatusRef, presenceData);
      }
    } catch (err) {
      console.error('Presence heartbeat failed:', err);
    }
  };

  beat();
  presenceHeartbeatInterval = setInterval(beat, PRESENCE_HEARTBEAT_MS);
}

// Track user online presence
export async function setupPresenceTracking(existingMeta = null) {
  const { auth, db, ref, set, onDisconnect, onValue } = window.firebaseApp;
  const user = auth.currentUser;

  if (!user) return;

  const emailKey = user.email.toLowerCase().replace(/\./g, '_');
  const userStatusRef = ref(db, `online-users/${emailKey}`);
  const staffStatusRef = ref(db, `online-staff/${emailKey}`);

  if (presenceListenerAttachedFor === emailKey) return;

  if (typeof presenceConnectedUnsubscribe === 'function') {
    presenceConnectedUnsubscribe();
    presenceConnectedUnsubscribe = null;
  }
  presenceListenerAttachedFor = emailKey;

  try {
    // Use existing metadata or fetch if missing
    const { getUserMetadata } = await import('./user-metadata-logic.js');
    const meta = existingMeta || await getUserMetadata(user.uid);

    const STAFF_ROLES = ['owner', 'co-owner', 'admin', 'manager', 'mod', 'moderator', 'staff', 'helper', 'developer', 'lead developer', 'builder'];
    
    const primaryRank = (meta.rank || 'Member').toLowerCase();
    const otherRanks = (meta.ranks || []).map(r => r.toLowerCase());
    const isStaff = STAFF_ROLES.includes(primaryRank) ||
      otherRanks.some(r => STAFF_ROLES.includes(r));

    const ranksForPresence = meta.ranks?.includes(meta.rank) ? meta.ranks : [meta.rank, ...(meta.ranks || [])].filter(Boolean);
    const username = meta.username || user.displayName || user.email.split('@')[0];

    const connectedRef = ref(db, '.info/connected');
    presenceConnectedUnsubscribe = onValue(connectedRef, async (snap) => {
      if (snap.val() !== true) return;

      const presenceData = {
        online: true,
        lastSeen: Date.now(),
        email: user.email,
        uid: user.uid,
        username: username,
        ranks: ranksForPresence,
        photoURL: meta.pfpUrl || null
      };

      try {
        await onDisconnect(userStatusRef).remove();
        await set(userStatusRef, presenceData);

        if (isStaff) {
          await onDisconnect(staffStatusRef).remove();
          await set(staffStatusRef, presenceData);
          console.log('--- STAFF PRESENCE ACTIVE ---', user.email);
        }
      } catch (err) {
        console.error('Error setting onDisconnect presence:', err);
      }
    });

    window.addEventListener('beforeunload', () => {
      if (presenceListenerAttachedFor) {
        set(ref(db, `online-users/${presenceListenerAttachedFor}`), null);
        set(ref(db, `online-staff/${presenceListenerAttachedFor}`), null);
      }
    });
  } catch (err) {
    console.error('Setup presence tracking failed:', err);
  }
}

export function cleanupPresenceOnLogout() {
  const { auth, db, ref, set } = window.firebaseApp;

  if (presenceListenerAttachedFor) {
    const userStatusRef = ref(db, `online-users/${presenceListenerAttachedFor}`);
    const staffStatusRef = ref(db, `online-staff/${presenceListenerAttachedFor}`);

    set(userStatusRef, null);
    set(staffStatusRef, null);

    if (typeof presenceConnectedUnsubscribe === 'function') {
      presenceConnectedUnsubscribe();
      presenceConnectedUnsubscribe = null;
    }
    presenceListenerAttachedFor = null;
  }

  stopPresenceHeartbeat();
}
