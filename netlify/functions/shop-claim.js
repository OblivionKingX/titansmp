const Rcon = require('rcon');
const admin = require('firebase-admin');

// Initialize Firebase Admin lazily to prevent cold start errors if missing
let firebaseApp = null;
function getFirebase() {
  if (firebaseApp) return admin.database();
  try {
    const databaseURL = process.env.FIREBASE_DATABASE_URL;
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
    }

    if (databaseURL && serviceAccount) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: databaseURL
      });
      return admin.database();
    }
  } catch (err) {
    console.error('[Shop] Firebase Admin init failed:', err.message);
  }
  return null;
}

const COMMAND_MAPPING = {
  'starter_kit': 'kit starter {player}',
  'vip_trial': 'lp user {player} parent addtemp vip 1d',
  'elite_rank': 'lp user {player} parent addtemp elite 7d',
  'vote_crate_key': 'crate give physical Vote {player} 1',
  'titan_sword': 'give {player} diamond_sword{Enchantments:[{id:sharpness,lvl:5}]} 1',
  'god_apples': 'give {player} enchanted_golden_apple 16',
  'money_boost': 'eco give {player} 5000',
  'money_boost_large': 'eco give {player} 25000',
  'points_crate_key': 'crate give physical Points {player} 1'
};

const PRICE_MAPPING = {
  'starter_kit': 50,
  'vip_trial': 500,
  'elite_rank': 2500,
  'vote_crate_key': 25,
  'titan_sword': 1500,
  'god_apples': 300,
  'money_boost': 1000,
  'money_boost_large': 4000,
  'points_crate_key': 50
};

const CURRENCY_MAPPING = {
  'points_crate_key': 'points'
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
    const currencyType = CURRENCY_MAPPING[itemId] || 'gold';

    if (!commandTemplate) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid itemId' }) };
    }

    const host = process.env.RCON_HOST;
    const port = parseInt(process.env.RCON_PORT || "25575");
    const password = process.env.RCON_PASSWORD;

    if (!host || !password) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'RCON config missing on server' }) };
    }

    console.log(`[Shop] Processing purchase: ${itemId} for ${ign} (${price} ${currencyType})`);

    // Handle Points Currency
    if (currencyType === 'points') {
      const db = getFirebase();
      if (!db) {
        return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Firebase config missing. Cannot process points.' }) };
      }

      // Read current points
      const pointsRef = db.ref(`playerData/${ign}/points`);
      const snapshot = await pointsRef.once('value');
      const currentPoints = snapshot.val() || 0;

      if (currentPoints < price) {
        return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `Not enough Points! You have ${currentPoints}` }) };
      }

      // Deduct Points
      await pointsRef.set(currentPoints - price);

      // Log Transaction
      await db.ref('point_transactions').push({
        playerName: ign,
        amount: -price,
        type: 'shop_purchase',
        description: `Purchased ${itemId} for ${price} Points.`,
        timestamp: Date.now()
      });

      // Now Connect to RCON to deliver the item
      return new Promise((resolve) => {
        const conn = new Rcon(host, port, password);
        let finished = false;

        conn.on('auth', () => {
          const finalCommand = commandTemplate.replace('{player}', ign);
          console.log(`[Shop] Executing RCON: ${finalCommand}`);
          conn.send(finalCommand);
        }).on('response', (str) => {
          if (finished) return;
          console.log(`[Shop] RCON Response: ${str}`);
          finished = true;
          conn.disconnect();
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, message: 'Purchase successful!' })
          });
        }).on('error', (err) => {
          console.error('[Shop] RCON Error:', err.message);
          if (finished) return;
          finished = true;
          resolve({
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: `Item purchased but delivery failed: ${err.message}. Contact admin.` })
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
              body: JSON.stringify({ error: 'Item purchased but delivery timed out. Contact admin.' })
            });
          }
        }, 10000); 
      });
    } 
    
    // Handle Gold Currency (Existing Logic)
    return new Promise((resolve) => {
      const conn = new Rcon(host, port, password);
      let finished = false;
      let step = 'check_balance';

      conn.on('auth', () => {
        conn.send(`papi parse ${ign} %playerpoints_points%`);
      }).on('response', (str) => {
        if (finished) return;
        
        console.log(`[Shop] RCON Response (${step}): ${str}`);

        if (step === 'check_balance') {
          const cleanedStr = str.replace(/§./g, '').trim();
          const currentGold = parseInt(cleanedStr);
          
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

          step = 'deduct_gold';
          conn.send(`p take ${ign} ${price}`);
        } 
        else if (step === 'deduct_gold') {
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
      }, 10000); 
    });

  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};
