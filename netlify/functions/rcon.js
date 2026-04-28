const Rcon = require('rcon');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const { command } = JSON.parse(event.body);
    const host = process.env.RCON_HOST;
    const port = parseInt(process.env.RCON_PORT || "25575");
    const password = process.env.RCON_PASSWORD;

    if (!host || !password) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Config missing' }) };
    }

    return new Promise((resolve) => {
      const conn = new Rcon(host, port, password);
      let finished = false;

      conn.on('auth', () => {
        console.log('[RCON] Authenticated. Sending command...');
        conn.send(command);
      }).on('response', (str) => {
        console.log('[RCON] Received response.');
        if (finished) return;
        finished = true;
        conn.disconnect();
        resolve({
          statusCode: 200,
          body: JSON.stringify({ response: str }),
        });
      }).on('error', (err) => {
        console.error('[RCON] Error:', err.message);
        if (finished) return;
        finished = true;
        resolve({
          statusCode: 500,
          body: JSON.stringify({ error: `RCON Error: ${err.message}` }),
        });
      }).on('end', () => {
        if (!finished) {
          finished = true;
          resolve({
            statusCode: 500,
            body: JSON.stringify({ error: 'Connection closed unexpectedly' }),
          });
        }
      });

      conn.connect();
      
      // Safety timeout
      setTimeout(() => {
        if (!finished) {
          finished = true;
          console.log('[RCON] Connection timed out.');
          try { conn.disconnect(); } catch (e) {}
          resolve({
            statusCode: 500,
            body: JSON.stringify({ error: 'Connection timed out' }),
          });
        }
      }, 5000);
    });

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
