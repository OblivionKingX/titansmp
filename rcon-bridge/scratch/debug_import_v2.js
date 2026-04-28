const { Rcon } = require('rcon-client');
console.log('Rcon keys:', Object.keys(Rcon));
console.log('Rcon prototype keys:', Object.getOwnPropertyNames(Rcon.prototype));
