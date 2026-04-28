const updater = require('./updater');
const rcon = require('./rcon');
require('dotenv').config();

async function main() {
  console.log('-------------------------------------------');
  console.log('   Minecraft RCON to Firebase Bridge      ');
  console.log('-------------------------------------------');

  // Verify RCON connection before starting
  try {
    await rcon.connect();
    console.log('[Init] RCON connection verified.');
  } catch (error) {
    console.error('[Init] Could not verify RCON connection. Will retry during sync.');
  }

  // Start the sync loop
  updater.start();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[Shutdown] Closing connections...');
    await rcon.disconnect();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[Fatal] Application crash:', err);
  process.exit(1);
});
