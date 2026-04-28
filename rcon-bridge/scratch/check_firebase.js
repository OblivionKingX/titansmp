const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

const serviceAccount = require('../service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://titannetwork-27026-default-rtdb.firebaseio.com'
});

const db = admin.database();

async function check() {
  const snap = await db.ref('leaderboard/money').get();
  console.log('Leaderboard Money Data:', snap.val());
  process.exit(0);
}

check();
