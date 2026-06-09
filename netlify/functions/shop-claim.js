const Rcon = require('rcon');
const https = require('https');
const crypto = require('crypto');

// ── Firebase REST API helpers (no firebase-admin, fully bundler-safe) ──────────
let _cachedToken = null;
let _tokenExpiry = 0;

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiry - 60000) return _cachedToken;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not set');

  const sa = JSON.parse(raw);
  const privateKey = sa.private_key.replace(/\\n/g, '\n');
  const clientEmail = sa.client_email;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(Buffer.from(JSON.stringify({
    iss: clientEmail, sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email'
  })));

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = base64url(sign.sign(privateKey));
  const jwt = `${header}.${payload}.${signature}`;

  const tokenData = await new Promise((resolve, reject) => {
    const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject); req.write(body); req.end();
  });

  if (!tokenData.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(tokenData));
  _cachedToken = tokenData.access_token;
  _tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
  return _cachedToken;
}

function fbRequest(method, path, body, token) {
  const dbUrl = (process.env.FIREBASE_DATABASE_URL || process.env.NETLIFY_DATABASE_URL).replace('https://', '');
  const hostname = dbUrl.replace(/\/$/, '');
  const urlPath = `/${path}.json?access_token=${token}`;
  const postData = body !== undefined ? JSON.stringify(body) : undefined;

  return new Promise((resolve, reject) => {
    const options = {
      hostname, path: urlPath, method,
      headers: postData ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } : {}
    };
    const req = https.request(options, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d || 'null')));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function getPoints(ign) {
  const token = await getAccessToken();
  const val = await fbRequest('GET', `playerData/${ign}/points`, undefined, token);
  return val || 0;
}

async function setPoints(ign, newPoints) {
  const token = await getAccessToken();
  await fbRequest('PUT', `playerData/${ign}/points`, newPoints, token);
}

async function logTransaction(ign, amount, itemId, pointsPrice) {
  const token = await getAccessToken();
  const entry = {
    playerName: ign, amount: -amount, type: 'shop_purchase',
    description: `Purchased ${itemId} for ${pointsPrice} Points.`,
    timestamp: Date.now()
  };
  await fbRequest('POST', 'point_transactions', entry, token);
}


exports.handler = async (event) => {
  if (event.httpMethod.toUpperCase() !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const { ign, itemId, paymentMethod } = JSON.parse(event.body);

    if (!ign || !itemId) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing ign or itemId' }) };
    }

    // Fetch shop items dynamically from Firebase database
    let shopItems = [];
    try {
      const token = await getAccessToken();
      shopItems = await fbRequest('GET', 'shop_items', undefined, token) || [];
    } catch (dbErr) {
      console.error('[Shop] Failed to fetch shop config from Firebase:', dbErr.message);
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to load shop configuration.' }) };
    }

    const item = shopItems.find(i => i.id === itemId);
    if (!item) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid itemId' }) };
    }

    const commandTemplate = item.command;
    const itemCurrencyType = item.currencyType || 'gold';

    // Determine prices based on currencyType
    let priceDef;
    if (itemCurrencyType === 'both' || itemCurrencyType === 'either') {
      priceDef = { gold: item.priceGold, points: item.pricePoints };
    } else if (itemCurrencyType === 'points') {
      priceDef = item.pricePoints;
    } else {
      priceDef = item.priceGold;
    }

    const host = process.env.RCON_HOST;
    const port = parseInt(process.env.RCON_PORT || "25575");
    const password = process.env.RCON_PASSWORD;

    if (!host || !password) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'RCON config missing on server' }) };
    }

    console.log(`[Shop] Processing purchase: ${itemId} for ${ign} (${itemCurrencyType})`);

    let needGoldDeduct = false;
    let needPointsDeduct = false;
    let goldPrice = 0;
    let pointsPrice = 0;

    if (itemCurrencyType === 'both') {
      needGoldDeduct = true;
      needPointsDeduct = true;
      goldPrice = priceDef.gold;
      pointsPrice = priceDef.points;
    } else if (itemCurrencyType === 'either') {
      if (paymentMethod === 'points') {
        needPointsDeduct = true;
        pointsPrice = priceDef.points;
      } else {
        needGoldDeduct = true;
        goldPrice = priceDef.gold;
      }
    } else if (itemCurrencyType === 'points') {
      needPointsDeduct = true;
      pointsPrice = priceDef;
    } else {
      needGoldDeduct = true;
      goldPrice = priceDef;
    }

    // 1. Process Points First (Firebase REST API)
    if (needPointsDeduct) {
      try {
        const currentPoints = await getPoints(ign);
        console.log(`[Shop] ${ign} has ${currentPoints} points, needs ${pointsPrice}`);

        if (currentPoints < pointsPrice) {
          return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `Not enough Points! You have ${currentPoints}` }) };
        }

        await setPoints(ign, currentPoints - pointsPrice);
        await logTransaction(ign, pointsPrice, itemId, pointsPrice);
        console.log(`[Shop] Deducted ${pointsPrice} points from ${ign}. Remaining: ${currentPoints - pointsPrice}`);
      } catch (err) {
        console.error('[Shop] Points processing failed:', err.message);
        return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to process points: ' + err.message }) };
      }
    }


    // Helper: save a pending purchase to Firebase for offline delivery
    async function savePendingPurchase(token) {
      const entry = {
        ign,
        itemId,
        command: commandTemplate.replace('{player}', ign),
        goldDeducted: goldPrice,
        timestamp: Date.now(),
        delivered: false
      };
      await fbRequest('POST', 'pending_purchases', entry, token);
      console.log(`[Shop] Saved pending purchase for offline player ${ign}: ${itemId}`);
    }

    // 2. Connect to RCON to check balance, deduct gold, check online status, and deliver item
    return new Promise((resolve) => {
      const conn = new Rcon(host, port, password);
      let finished = false;
      let step = needGoldDeduct ? 'check_balance' : 'check_online';

      conn.on('auth', () => {
        if (step === 'check_balance') {
          conn.send(`papi parse ${ign} %playerpoints_points%`);
        } else {
          // check_online: use /list and see if the player appears
          conn.send(`list`);
        }
      }).on('response', async (str) => {
        if (finished) return;
        
        console.log(`[Shop] RCON Response (${step}): ${str}`);

        if (step === 'check_balance') {
          const cleanedStr = str.replace(/[§&]./g, '').replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
          const currentGold = parseInt(cleanedStr);
          
          if (isNaN(currentGold) || currentGold < goldPrice) {
            finished = true;
            conn.disconnect();

            // Refund points if they were deducted but gold check failed
            if (needPointsDeduct) {
              getPoints(ign).then(cur => setPoints(ign, cur + pointsPrice)).catch(() => {});
              console.log(`[Shop] Refunded ${pointsPrice} points to ${ign} due to failed Gold check.`);
            }

            resolve({
              statusCode: 400,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: `Not enough Gold! You have ${isNaN(currentGold) ? 0 : currentGold}` }),
            });
            return;
          }

          step = 'deduct_gold';
          conn.send(`p take ${ign} ${goldPrice}`);
        } 
        else if (step === 'deduct_gold') {
          // Gold deducted — now check if the player is currently online
          step = 'check_online';
          conn.send(`list`);
        }
        else if (step === 'check_online') {
          // /list returns something like: "There are X of a max Y players online: Player1, Player2"
          const isOnline = str.toLowerCase().includes(ign.toLowerCase());
          
          if (!isOnline) {
            // Player is offline — save to pending queue and respond with success
            finished = true;
            conn.disconnect();
            try {
              const token = await getAccessToken();
              await savePendingPurchase(token);
            } catch (pendingErr) {
              console.error('[Shop] Failed to save pending purchase:', pendingErr.message);
            }
            resolve({
              statusCode: 200,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ success: true, message: `You were offline, so your item (${itemId}) has been queued and will be delivered automatically when you join the server!` }),
            });
            return;
          }

          // Player is online — deliver immediately
          step = 'deliver_item';
          const finalCommand = commandTemplate.replace('{player}', ign);
          console.log(`[Shop] Executing RCON: ${finalCommand}`);
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
