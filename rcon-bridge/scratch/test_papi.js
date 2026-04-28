const rcon = require('../src/rcon');

async function test() {
  try {
    await rcon.connect();
    const res = await rcon.sendCommand('papi parse HEROBRINE_HBB %vault_eco_balance%');
    console.log('PAPI Response:', res);
    await rcon.disconnect();
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
