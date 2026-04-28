const rcon = require('../src/rcon');

async function test() {
  try {
    await rcon.connect();
    const balance = '10010090000';
    const res = await rcon.sendCommand(`scoreboard players set HEROBRINE_HB money ${balance}`);
    console.log('Scoreboard Set Response:', res);
    await rcon.disconnect();
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
