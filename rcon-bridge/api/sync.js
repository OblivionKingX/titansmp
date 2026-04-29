const updater = require('../src/updater');
const rcon = require('../src/rcon');

module.exports = async (req, res) => {
  // Optional: Add a simple secret key to prevent others from triggering your sync
  // if (req.query.key !== process.env.SYNC_KEY) {
  //   return res.status(401).send('Unauthorized');
  // }

  console.log('[Vercel Sync] Starting synchronization...');
  try {
    // 1. Connect
    await rcon.connect();
    console.log('[Vercel Sync] Connected to RCON.');

    // 2. Sync
    await updater.sync();
    
    // 3. Disconnect
    await rcon.disconnect();
    console.log('[Vercel Sync] Done.');

    res.status(200).json({
      success: true,
      message: 'Synchronization completed successfully.',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Vercel Sync] Fatal error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
