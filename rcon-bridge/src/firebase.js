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
      const serviceAccountJSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      const databaseURL = process.env.FIREBASE_DATABASE_URL;

      if (!databaseURL) {
        throw new Error('Missing FIREBASE_DATABASE_URL in .env');
      }

      let serviceAccount;
      if (serviceAccountJSON) {
        try {
          // Check if it's Base64 and decode if necessary
          let decodedJSON = serviceAccountJSON;
          if (!serviceAccountJSON.trim().startsWith('{')) {
            console.log('[Firebase] Detected Base64 JSON, decoding...');
            decodedJSON = Buffer.from(serviceAccountJSON, 'base64').toString('utf-8');
          }
          serviceAccount = JSON.parse(decodedJSON);
          // Fix for PEM formatting in environment variables
          if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
          }
          console.log('[Firebase] Initialized using JSON string.');
        } catch (e) {
          throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. Ensure it is valid JSON or Base64.');
        }
      } else if (serviceAccountPath) {
        // Option 2: Load from file path (Best for local dev)
        const absolutePath = path.isAbsolute(serviceAccountPath) 
          ? serviceAccountPath 
          : path.join(process.cwd(), serviceAccountPath);
        serviceAccount = require(absolutePath);
        console.log('[Firebase] Initializing using file path.');
      } else {
        throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH');
      }

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
