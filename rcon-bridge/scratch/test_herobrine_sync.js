const rcon = require('../src/rcon');

async function test() {
  try {
    await rcon.connect();
    const res = await rcon.sendCommand('papi parse HEROBRINE_HB %vault_eco_balance_fixed%');
    console.log('PAPI Response for HEROBRINE_HB:', res);
    await rcon.disconnect();
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
