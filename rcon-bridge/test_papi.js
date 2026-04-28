const rcon = require('./src/rcon');
require('dotenv').config();

async function testPAPI() {
    await rcon.connect();
    const tests = [
        '%statistic_time_played%',
        '%statistic_seconds_played%',
        '%player_playtime%',
        '%player_minutes_played%',
        '%statistic_player_kills%',
        '%statistic_deaths%'
    ];
    
    console.log('Testing PAPI placeholders for HEROBRINE_HB...');
    for (const placeholder of tests) {
        const res = await rcon.sendCommand(`papi parse HEROBRINE_HB ${placeholder}`);
        console.log(`${placeholder}: ${res}`);
    }
    
    await rcon.disconnect();
}

testPAPI().catch(console.error);
