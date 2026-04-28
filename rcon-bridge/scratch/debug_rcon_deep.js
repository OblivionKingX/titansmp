const { Rcon } = require('rcon-client');
const options = {
    host: '95.217.207.98',
    port: 60501,
    password: 'tITan228@'
};

async function debug() {
    const rcon = new Rcon(options);
    await rcon.connect();
    console.log('Connected.');
    
    // Check all properties
    console.log('Rcon instance keys:', Object.keys(rcon));
    
    try {
        const res = await rcon.send('version');
        console.log('Version response type:', typeof res);
        console.log('Version response:', res);
    } catch (e) {
        console.error('Send error:', e);
    }
    
    await rcon.end();
}

debug();
