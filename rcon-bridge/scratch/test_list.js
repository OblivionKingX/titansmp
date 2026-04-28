const rcon = require('../src/rcon');

async function test() {
  try {
    await rcon.connect();
    const res = await rcon.sendCommand('list');
    console.log('List Output:', res);
    await rcon.disconnect();
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
