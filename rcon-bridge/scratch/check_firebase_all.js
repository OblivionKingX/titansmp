const admin = require('firebase-admin');
require('dotenv').config();
const serviceAccount = require('../service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://titannetwork-27026-default-rtdb.firebaseio.com'
});

const db = admin.database();

async function check() {
  const snap = await db.ref('leaderboard').get();
  console.log('All Leaderboard Data:', JSON.stringify(snap.val(), null, 2));
  process.exit(0);
}

check();
