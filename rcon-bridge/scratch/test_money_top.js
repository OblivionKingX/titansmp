const rcon = require('../src/rcon');

async function test() {
  try {
    await rcon.connect();
    console.log('--- Testing Money Top Command ---');
    
    const res = await rcon.sendCommand('money top');
    console.log('Money Top Output:', res);
    
    await rcon.disconnect();
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
