const Rcon = require('rcon');

const COMMAND_MAPPING = {
  'starter_kit': 'kit starter {player}',
  'vip_trial': 'lp user {player} parent addtemp vip 1d',
  'vote_crate_key': 'crate give physical Vote {player} 1',
  'money_boost': 'eco give {player} 5000'
};

const PRICE_MAPPING = {
  'starter_kit': 50,
  'vip_trial': 500,
  'vote_crate_key': 25,
  'money_boost': 1000
};

exports.handler = async (event) => {
  if (event.httpMethod.toUpperCase() !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const { ign, itemId } = JSON.parse(event.body);

    if (!ign || !itemId) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing ign or itemId' }) };
    }

    const commandTemplate = COMMAND_MAPPING[itemId];
    const price = PRICE_MAPPING[itemId] || 0;

    if (!commandTemplate) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid itemId' }) };
    }

    const host = process.env.RCON_HOST;
    const port = parseInt(process.env.RCON_PORT || "25575");
    const password = process.env.RCON_PASSWORD;

    if (!host || !password) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'RCON config missing on server' }) };
    }

    console.log(`[Shop] Processing purchase: ${itemId} for ${ign} (${price} Gold)`);

    return new Promise((resolve) => {
      const conn = new Rcon(host, port, password);
      let finished = false;
      let step = 'check_balance';

      conn.on('auth', () => {
        // Step 1: Check balance using PAPI
        conn.send(`papi parse ${ign} %playerpoints_points%`);
      }).on('response', (str) => {
        if (finished) return;
        
        console.log(`[Shop] RCON Response (${step}): ${str}`);

        if (step === 'check_balance') {
          const currentGold = parseInt(str.trim());
          if (isNaN(currentGold) || currentGold < price) {
            finished = true;
            conn.disconnect();
            resolve({
              statusCode: 400,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: `Not enough Gold! You have ${isNaN(currentGold) ? 0 : currentGold}` }),
            });
            return;
          }

          // Step 2: Deduct Gold
          step = 'deduct_gold';
          conn.send(`p take ${ign} ${price}`);
        } 
        else if (step === 'deduct_gold') {
          // Step 3: Deliver Item
          step = 'deliver_item';
          const finalCommand = commandTemplate.replace('{player}', ign);
          conn.send(finalCommand);
        } 
        else if (step === 'deliver_item') {
          finished = true;
          conn.disconnect();
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, message: 'Purchase successful!' }),
          });
        }
      }).on('error', (err) => {
        console.error('[Shop] RCON Error:', err.message);
        if (finished) return;
        finished = true;
        resolve({
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Server Error: ${err.message}` }),
        });
      });

      conn.connect();
      
      setTimeout(() => {
        if (!finished) {
          finished = true;
          try { conn.disconnect(); } catch (e) {}
          resolve({
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Server connection timed out' }),
          });
        }
      }, 10000); // 10s for multi-step process
    });

  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};
