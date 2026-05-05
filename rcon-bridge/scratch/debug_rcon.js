const { Rcon } = require('rcon-client');
console.log('Rcon type:', typeof Rcon);
console.log('Rcon.connect type:', typeof Rcon.connect);
if (typeof Rcon === 'function') {
    try {
        const r = new Rcon({host: 'localhost', port: 25575, password: 'pw'});
        console.log('Instance r.connect type:', typeof r.connect);
    } catch (e) {
        console.log('Error instantiating Rcon:', e.message);
    }
}
