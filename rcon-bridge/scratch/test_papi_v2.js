const rcon = require('../src/rcon');

async function test() {
  try {
    await rcon.connect();
    // Test with OblivionKingX which we know exists
    const res = await rcon.sendCommand('papi parse OblivionKingX %vault_eco_balance%');
    console.log('PAPI Response for OblivionKingX:', res);
    
    const res2 = await rcon.sendCommand('papi parse HEROBRINE_HBB %vault_eco_balance%');
    console.log('PAPI Response for HEROBRINE_HBB:', res2);

    await rcon.disconnect();
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
