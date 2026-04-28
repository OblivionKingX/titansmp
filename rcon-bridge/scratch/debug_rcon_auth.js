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
    console.log('Authenticated:', rcon.authenticated);
    
    try {
        const res = await rcon.send('list');
        console.log('List response:', JSON.stringify(res));
    } catch (e) {
        console.error('Send error:', e);
    }
    
    await rcon.end();
}

debug();
