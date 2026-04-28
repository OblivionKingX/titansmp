try {
  const RconClient = require('rcon-client');
  console.log('Import type:', typeof RconClient);
  console.log('Available keys:', Object.keys(RconClient));
  
  const Rcon = RconClient.Rcon || RconClient;
  console.log('Rcon type:', typeof Rcon);
  
  try {
    const test = new Rcon({ host: '1.1.1.1', port: 1234, password: 'test' });
    console.log('Success: Rcon is a constructor!');
  } catch (e) {
    console.log('Failure: Rcon is NOT a constructor.', e.message);
  }
} catch (err) {
  console.error('Library not found:', err.message);
}
