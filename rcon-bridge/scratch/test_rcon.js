const rcon = require('../src/rcon');

async function test() {
  try {
    await rcon.connect();
    console.log('--- Testing RCON Commands ---');
    
    const list = await rcon.sendCommand('scoreboard players list');
    console.log('Scoreboard Players List Output:', list);
    
    const objectives = await rcon.sendCommand('scoreboard objectives list');
    console.log('Objectives List Output:', objectives);
    
    await rcon.disconnect();
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
