import './firebase-global.js';
import { getUserMetadata, renderBadges, ADMIN_CONFIG } from './user-metadata-logic.js';

// Access globally initialized Firebase services and functions
const {
  auth, db, fs, functions, httpsCallable,
  onAuthStateChanged, getAuth,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut,
  getDatabase, ref, get, set,
  doc, setDoc, serverTimestamp: rtdbTimestamp, fsTimestamp
} = window.firebaseApp;

let navbarInitialized = false;

// ===== AUTH MODAL FUNCTIONS =====

window.showAuthModal = function (tab = 'login') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  switchAuthTab(tab);
  closeUserMenu();
  // clear messages
  const lm = document.getElementById('login-message');
  const rm = document.getElementById('register-message');
  if (lm) lm.style.display = 'none';
  if (rm) rm.style.display = 'none';
};

window.closeAuthModal = function () {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
};

window.switchAuthTab = function (tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  const tabs = document.querySelectorAll('.auth-tab');
  if (tab === 'login') {
    if (tabs[0]) tabs[0].classList.add('active');
  } else {
    if (tabs[1]) tabs[1].classList.add('active');
  }
  const form = document.getElementById(`${tab}-form`);
  if (form) form.classList.add('active');
};

// Expose switchAuthTab outside of window too (needed for onclick in template)
function switchAuthTab(tab) { window.switchAuthTab(tab); }

window.login = async function (event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const msg = document.getElementById('login-message');

  if (msg) { msg.style.display = 'none'; msg.className = 'form-message'; }

  try {
    if (btn) { btn.textContent = 'Logging in...'; btn.disabled = true; }
    await signInWithEmailAndPassword(auth, email, password);
    if (msg) { msg.textContent = 'Success! Welcome back.'; msg.className = 'form-message success'; msg.style.display = 'block'; }
    setTimeout(() => { window.closeAuthModal(); }, 1200);
  } catch (err) {
    let errorMessage = 'Login failed. ';
    switch (err.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        errorMessage += 'Invalid email or password.'; break;
      case 'auth/too-many-requests':
        errorMessage += 'Too many attempts. Try again later.'; break;
      default: errorMessage += err.message;
    }
    if (msg) { msg.textContent = errorMessage; msg.className = 'form-message error'; msg.style.display = 'block'; }
  } finally {
    if (btn) { btn.textContent = 'Login'; btn.disabled = false; }
  }
};

window.register = async function (event) {
  event.preventDefault();
  const username = document.getElementById('register-username').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const confirm = document.getElementById('register-confirm-password').value;
  const btn = document.getElementById('register-btn');
  const msg = document.getElementById('register-message');

  if (msg) { msg.style.display = 'none'; msg.className = 'form-message'; }

  if (password !== confirm) {
    if (msg) { msg.textContent = 'Passwords do not match.'; msg.className = 'form-message error'; msg.style.display = 'block'; }
    return;
  }

  try {
    if (btn) { btn.textContent = 'Creating account...'; btn.disabled = true; }
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: username });
    const emailKey = email.replace(/\./g, '_');
    await set(ref(db, `users/${cred.user.uid}`), { username, email, registeredAt: Date.now() });

    // Sync to Firestore for Admin search and Rank Unification
    await setDoc(doc(fs, "users", cred.user.uid), {
      username,
      email: email.toLowerCase(),
      role: 'member',
      ranks: [], // Initial empty additional ranks
      updatedAt: serverTimestamp()
    }, { merge: true });
    if (msg) { msg.textContent = 'Account created! Welcome!'; msg.className = 'form-message success'; msg.style.display = 'block'; }
    setTimeout(() => { window.closeAuthModal(); }, 1500);
  } catch (err) {
    let errorMessage = 'Registration failed. ';
    switch (err.code) {
      case 'auth/email-already-in-use': errorMessage += 'Email already registered.'; break;
      case 'auth/invalid-email': errorMessage += 'Invalid email address.'; break;
      case 'auth/weak-password': errorMessage += 'Password is too weak.'; break;
      default: errorMessage += err.message;
    }
    if (msg) { msg.textContent = errorMessage; msg.className = 'form-message error'; msg.style.display = 'block'; }
  } finally {
    if (btn) { btn.textContent = 'Create Account'; btn.disabled = false; }
  }
};

window.logout = async function () {
  try {
    await signOut(auth);
    closeUserMenu();
  } catch (err) {
    console.error('Logout error:', err);
  }
};

window.showOwnerPanel = function () {
  window.location.href = 'admin.html';
};

let currentPathRole = null;
const PATH_RANKS = ['builder', 'pvper', 'grinder'];


/**
 * Updates the UI based on the user's authentication state
 */
export async function updateUIForUser(user) {
  const userBtnText = document.getElementById('user-btn-text');
  const userName = document.getElementById('user-name');
  const userRole = document.getElementById('user-role');
  const userPathRole = document.getElementById('user-path-role');
  const navbarPfp = document.getElementById('navbar-pfp');
  const navbarUserIcon = document.getElementById('navbar-user-icon');
  const loginLink = document.getElementById('login-link');
  const logoutLink = document.getElementById('logout-link');
  const profileLink = document.getElementById('profile-link');
  const ownerLink = document.getElementById('owner-link');
  const adminLink = document.getElementById('admin-link');
  const settingsLink = document.getElementById('settings-link');

  if (user) {
    const displayName = user.displayName || user.email.split('@')[0];
    if (userBtnText) userBtnText.textContent = displayName.substring(0, 15) + (displayName.length > 15 ? '...' : '');
    if (userName) userName.textContent = displayName;

    // Fetch and show PFP
    get(ref(db, `pfp/${user.uid}`)).then(snapshot => {
      if (snapshot.exists()) {
        if (navbarPfp) {
          navbarPfp.src = snapshot.val();
          navbarPfp.style.display = 'block';
        }
        if (navbarUserIcon) navbarUserIcon.style.display = 'none';
        const btn = document.querySelector('.user-btn');
        if (btn) btn.style.padding = '4px 12px';
      } else {
        if (navbarPfp) navbarPfp.style.display = 'none';
        if (navbarUserIcon) navbarUserIcon.style.display = 'inline-block';
        const btn = document.querySelector('.user-btn');
        if (btn) btn.style.padding = '';
      }
    }).catch(err => {
      console.error("Error fetching PFP:", err);
    });

    // Unified Rank & Metadata Fetching
    const meta = await getUserMetadata(user.uid);
    const badgesHtml = renderBadges(meta);

    if (userRole) {
      userRole.innerHTML = badgesHtml;
      userRole.className = 'user-role-container'; // Changed to a container for multiple badges
    }

    const primaryRank = meta.rank?.toLowerCase() || 'user';
    const otherRanks = meta.ranks || [];

    // Determine if owner for admin panel access
    const isOwner = primaryRank === 'owner' || otherRanks.some(r => r.toLowerCase() === 'owner');
    const isAdmin = primaryRank === 'admin' || otherRanks.some(r => r.toLowerCase() === 'admin');

    // Path role
    await loadUserPathRole(user, meta.ranks || []);
    if (userPathRole) {
      userPathRole.textContent = currentPathRole ? `Path: ${formatPathRank(currentPathRole)}` : `Path: Not selected`;
    }

    // Show/hide links
    if (loginLink) loginLink.style.display = 'none';
    if (logoutLink) logoutLink.style.display = 'block';
    if (adminLink) adminLink.style.display = isAdmin ? 'block' : 'none';
    if (ownerLink) ownerLink.style.display = isOwner ? 'block' : 'none';

    if (profileLink) {
      profileLink.style.display = 'block';
      profileLink.href = `profile.html?user=${user.uid}`;
    }
    if (settingsLink) settingsLink.style.display = 'block';

  } else {
    // Guest user
    if (userBtnText) userBtnText.textContent = 'Account';
    if (userName) userName.textContent = 'Guest';
    if (userRole) {
      userRole.textContent = 'Guest';
      userRole.className = 'user-role role-member';
    }
    if (userPathRole) userPathRole.textContent = 'Path: Not selected';

    if (loginLink) loginLink.style.display = 'block';
    if (logoutLink) logoutLink.style.display = 'none';
    if (adminLink) adminLink.style.display = 'none';
    if (ownerLink) ownerLink.style.display = 'none';
    if (profileLink) profileLink.style.display = 'none';
    if (settingsLink) settingsLink.style.display = 'none';

    if (navbarPfp) navbarPfp.style.display = 'none';
    if (navbarUserIcon) navbarUserIcon.style.display = 'inline-block';
    const btn = document.querySelector('.user-btn');
    if (btn) btn.style.padding = '';
  }
}

async function loadUserPathRole(user, ranks) {
  if (!user) {
    currentPathRole = null;
    return;
  }
  try {
    const pathSnapshot = await get(ref(db, `users/${user.uid}/pathRole`));
    if (pathSnapshot.exists()) {
      currentPathRole = pathSnapshot.val();
    } else {
      currentPathRole = PATH_RANKS.find(r => ranks.includes(r)) || null;
    }
  } catch (err) {
    currentPathRole = PATH_RANKS.find(r => ranks.includes(r)) || null;
  }
}

function formatPathRank(rank) {
  if (!rank) return 'Not selected';
  if (rank === 'pvper') return 'PvPer';
  return rank.charAt(0).toUpperCase() + rank.slice(1);
}

/**
 * Toggles the user dropdown menu
 */
export function toggleUserMenu() {
  const dropdown = document.getElementById('user-dropdown');
  if (dropdown) dropdown.classList.toggle('active');
}

/**
 * Closes the user dropdown menu
 */
export function closeUserMenu() {
  const dropdown = document.getElementById('user-dropdown');
  if (dropdown) dropdown.classList.remove('active');
}

/**
 * Toggles the mobile navigation menu
 */
export function toggleMobileMenu() {
  const navLinks = document.getElementById('nav-links');
  if (navLinks) navLinks.classList.toggle('active');
}

/**
 * Initializes navbar event listeners
 */
export function initNavbar() {
  if (navbarInitialized) return;
  navbarInitialized = true;
  const userBtns = document.querySelectorAll('.user-btn');
  userBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      toggleUserMenu();
    };
  });

  const mobileBtns = document.querySelectorAll('.mobile-menu-btn');
  mobileBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      toggleMobileMenu();
    };
  });

  // More button logic
  const moreBtn = document.getElementById('moreBtn');
  const moreMenu = document.getElementById('moreMenu');
  if (moreBtn && moreMenu) {
    moreBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      moreMenu.classList.toggle('active');
      closeUserMenu();
    };
  }

  // Global click handler to close menus
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) closeUserMenu();
    if (moreMenu && !e.target.closest('.more-btn')) moreMenu.classList.remove('active');

    const navLinks = document.getElementById('nav-links');
    if (navLinks && !e.target.closest('.nav-container')) {
      navLinks.classList.remove('active');
    }
  });

  // Escape key handler
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeUserMenu();
      window.closeAuthModal();
      if (moreMenu) moreMenu.classList.remove('active');
      const navLinks = document.getElementById('nav-links');
      if (navLinks) navLinks.classList.remove('active');
    }
  });

  // Auth modal form submissions
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  if (loginForm) loginForm.onsubmit = window.login;
  if (registerForm) registerForm.onsubmit = window.register;

  // Close auth modal on backdrop click
  const authModal = document.getElementById('auth-modal');
  if (authModal) {
    authModal.addEventListener('click', (e) => {
      if (e.target === authModal) window.closeAuthModal();
    });
  }
}

// Global Auth Listener to keep UI in sync
onAuthStateChanged(auth, (user) => {
  updateUIForUser(user);

  // Optional: Start presence tracking if user is logged in
  if (user) {
    import('./presence-logic.js').then(({ setupPresenceTracking, startPresenceHeartbeat }) => {
      setupPresenceTracking();
      startPresenceHeartbeat();
    }).catch(err => console.error("Presence sync failed:", err));
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', initNavbar);
