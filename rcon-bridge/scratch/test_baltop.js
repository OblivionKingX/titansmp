const rcon = require('../src/rcon');

async function test() {
  try {
    await rcon.connect();
    console.log('--- Testing Baltop Command ---');
    
    const res = await rcon.sendCommand('baltop');
    console.log('Baltop Output:', res);
    
    await rcon.disconnect();
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
