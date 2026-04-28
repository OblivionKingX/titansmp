const updater = require('./updater');
const rcon = require('./rcon');
require('dotenv').config();

async function run() {
  console.log('[Single Sync] Starting one-time synchronization...');
  try {
    // 1. Connect
    await rcon.connect();
    console.log('[Single Sync] Connected to RCON.');

    // 2. Sync
    await updater.sync();
    
    // 3. Disconnect
    await rcon.disconnect();
    console.log('[Single Sync] Done. Closing.');
    process.exit(0);
  } catch (err) {
    console.error('[Single Sync] Fatal error:', err);
    process.exit(1);
  }
}

run();
