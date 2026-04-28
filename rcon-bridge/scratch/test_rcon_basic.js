const rcon = require('../src/rcon');

async function test() {
  try {
    await rcon.connect();
    console.log('--- Testing RCON Commands ---');
    
    const listPlayers = await rcon.sendCommand('list');
    console.log('List Output:', listPlayers);
    
    const help = await rcon.sendCommand('help');
    console.log('Help Output:', help ? 'Received help text' : 'No help text');
    
    await rcon.disconnect();
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
