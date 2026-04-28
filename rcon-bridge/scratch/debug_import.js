const rconClient = require('rcon-client');
console.log('rcon-client keys:', Object.keys(rconClient));
console.log('rconClient type:', typeof rconClient);
if (rconClient.Rcon) {
  console.log('Rcon is available on the object');
} else {
  console.log('Rcon is NOT available on the object');
}
