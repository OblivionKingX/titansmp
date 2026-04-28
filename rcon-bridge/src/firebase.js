const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

class FirebaseService {
  constructor() {
    this.db = null;
    this.init();
  }

  init() {
    try {
      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      const databaseURL = process.env.FIREBASE_DATABASE_URL;

      if (!serviceAccountPath || !databaseURL) {
        throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_DATABASE_URL in .env');
      }

      // Handle relative paths for service account
      const absolutePath = path.isAbsolute(serviceAccountPath) 
        ? serviceAccountPath 
        : path.join(process.cwd(), serviceAccountPath);

      const serviceAccount = require(absolutePath);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: databaseURL
      });

      this.db = admin.database();
      console.log('[Firebase] Admin SDK initialized successfully.');
    } catch (error) {
      console.error('[Firebase] Initialization error:', error.message);
      process.exit(1);
    }
  }

  async updateLeaderboard(data) {
    try {
      if (!this.db) throw new Error('Database not initialized');
      
      const ref = this.db.ref('leaderboard');
      await ref.set(data);
      console.log('[Firebase] Leaderboard updated successfully.');
    } catch (error) {
      console.error('[Firebase] Update error:', error.message);
      throw error;
    }
  }

  async updatePlayerStats(playerName, stats) {
    try {
      if (!this.db) throw new Error('Database not initialized');
      
      const ref = this.db.ref(`players/${playerName}`);
      await ref.update(stats);
    } catch (error) {
      console.error(`[Firebase] Error updating stats for ${playerName}:`, error.message);
      throw error;
    }
  }
}

module.exports = new FirebaseService();
