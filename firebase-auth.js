import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// Share current user state
let currentUser = null;
let userRanks = [];

// Auth state listener
auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
        // Check user roles from database
        const emailKey = user.email.replace(/\./g, '_');
        try {
            const snapshot = await db.ref(`ranks/${emailKey}`).once('value');
            const ranks = snapshot.val();
            userRanks = ranks || ['member'];
        } catch (error) {
            console.error("Error checking roles:", error);
            userRanks = ['member'];
        }
    } else {
        userRanks = [];
    }
});

// Export for use in other pages
window.firebaseAuth = { auth, db, currentUser, userRanks, firebaseConfig };