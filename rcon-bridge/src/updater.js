const rcon = require('./rcon');
const firebase = require('./firebase');
const parser = require('./parser');
const forumSync = require('./forum-sync');
require('dotenv').config();

class SyncManager {
  constructor() {
    this.interval = parseInt(process.env.UPDATE_INTERVAL) || 60000;
    this.isRunning = false;
    this.objectives = (process.env.STATS_OBJECTIVES || 'kills,deaths,playtime,money,gold').split(',');
    this.knownPlayers = new Set(); // Keep track of all players ever seen
  }

  async start() {
    console.log(`[Sync] Starting sync loop Version 3.0 (Real-Time Offline-Supporting Sync) every ${this.interval / 1000}s...`);
    const runAll = async () => {
      await this.sync();
      await this.syncIslandTop();
    };
    runAll(); // Initial run
    setInterval(runAll, this.interval);
  }

  /**
   * Loads all players ever stored in Firebase into knownPlayers Set.
   * This ensures we continue syncing offline players even after a bridge restart.
   */
  async loadPlayersFromFirebase() {
    try {
      console.log('[Sync] Fetching existing player names from Firebase database...');
      if (!firebase.db) {
        console.warn('[Sync] Firebase database not initialized yet, skipping fetch');
        return;
      }

      // Load from playerData
      const playerDataSnap = await firebase.db.ref('playerData').once('value');
      const playerData = playerDataSnap.val() || {};
      Object.keys(playerData).forEach(name => {
        const clean = parser.cleanName(name);
        if (clean && clean.length >= 3 && clean.length <= 16) {
          this.knownPlayers.add(clean);
        }
      });

      // Load from leaderboard/money
      const leaderboardSnap = await firebase.db.ref('leaderboard/money').once('value');
      const leaderboardData = leaderboardSnap.val() || {};
      Object.keys(leaderboardData).forEach(name => {
        const clean = parser.cleanName(name);
        if (clean && clean.length >= 3 && clean.length <= 16) {
          this.knownPlayers.add(clean);
        }
      });

      console.log(`[Sync] Loaded ${this.knownPlayers.size} unique players from Firebase.`);
    } catch (err) {
      console.error('[Sync] Failed to load players from Firebase:', err.message);
    }
  }

  /**
   * Cleans a prefix/rank response from RCON/PAPI.
   * Returns null if the response is an error or invalid.
   */
  cleanPrefix(response) {
    if (!response || typeof response !== 'string') return null;
    
    const lines = response.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return null;
    
    let clean = lines[lines.length - 1];
    
    // Check for common PAPI error messages or unreplaced placeholders
    const errorIndicators = [
      'Failed to find player',
      'not found',
      'Unknown player',
      'Invalid player',
      'null',
      'None',
      '---'
    ];
    
    if (errorIndicators.some(err => clean.toLowerCase().includes(err.toLowerCase()))) {
      return null;
    }
    
    if (clean.includes('%')) return null;

    // Remove common command result prefixes
    if (clean.includes('is: ')) {
      clean = clean.split('is: ')[1];
    } else if (clean.includes(': ')) {
      const parts = clean.split(': ');
      const lastPart = parts[parts.length - 1];
      if (lastPart.includes('§') || lastPart.includes('&') || lastPart.length < 30) {
        clean = lastPart;
      }
    }
    
    const finalClean = clean.trim();
    return finalClean.length > 0 ? finalClean : null;
  }

  async sync() {
    if (this.isRunning) {
      console.warn('[Sync] Previous sync still running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('[Sync] Starting synchronization...');

    try {
      // 1. Pre-load all registered players from Firebase
      await this.loadPlayersFromFirebase();

      // 2. Discover currently online players to make sure new players are instantly captured
      try {
        const listResponse = await rcon.sendCommand('list');
        if (listResponse) {
          const lines = listResponse.split('\n');
          for (const line of lines) {
            const parts = line.split(':');
            if (parts.length < 2) continue;
            const possiblePlayers = parts[parts.length - 1].split(',');
            possiblePlayers.forEach(p => {
              const clean = parser.cleanName(p);
              if (clean && clean.length >= 3 && clean.length <= 16) {
                this.knownPlayers.add(clean);
              }
            });
          }
        }
      } catch (listErr) {
        console.warn('[Sync] Failed to fetch online player list:', listErr.message);
      }

      // 3. Discover players with vanilla scoreboard entries to make sure they are included
      try {
        const playerListResponse = await rcon.sendCommand('scoreboard players list');
        const trackedPlayers = parser.parsePlayerList(playerListResponse);
        trackedPlayers.forEach(p => {
          const clean = parser.cleanName(p);
          if (clean && clean.length >= 3 && clean.length <= 16) {
            this.knownPlayers.add(clean);
          }
        });
      } catch (scoreListErr) {
        console.warn('[Sync] Failed to fetch scoreboard player list:', scoreListErr.message);
      }

      const players = Array.from(this.knownPlayers);
      if (players.length === 0) {
        console.log('[Sync] No players found to sync.');
        this.isRunning = false;
        return;
      }

      console.log(`[Sync] Fetching and updating real-time stats for ${players.length} players...`);

      const allStats = {
        lastUpdate: Date.now(),
        players: {}
      };

      // 4. Batch query PAPI placeholders in one single RCON request per player (online and offline)
      for (const playerName of players) {
        try {
          // Combined placeholder string:
          // money (%vault_eco_balance_fixed%) | gold (%playerpoints_points%) | kills (%statistic_player_kills%) | deaths (%statistic_deaths%) | playtime (%statistic_seconds_played%) | rank (%luckperms_prefix_playerName%)
          const papiQuery = `%vault_eco_balance_fixed%|%playerpoints_points%|%statistic_player_kills%|%statistic_deaths%|%statistic_seconds_played%|%luckperms_prefix_${playerName}%`;
          const papiResponse = await rcon.sendCommand(`papi parse ${playerName} ${papiQuery}`);

          if (!papiResponse || papiResponse.toLowerCase().includes('failed to find player') || papiResponse.toLowerCase().includes('invalid player')) {
            console.warn(`[Sync] Skipping offline player ${playerName} (failed to parse or not found on server)`);
            continue;
          }

          const parts = papiResponse.trim().split('|');
          if (parts.length < 5) {
            console.warn(`[Sync] Unexpected PAPI response format for ${playerName}: "${papiResponse.trim()}"`);
            continue;
          }

          // Parse results safely
          const money = parseFloat(parts[0]);
          const gold = parseInt(parts[1]);
          const kills = parseInt(parts[2]);
          const deaths = parseInt(parts[3]);
          const playtime = parseInt(parts[4]);
          const rawRank = parts[5];

          // Save standard stats to our local accumulator
          allStats.players[playerName] = {
            money: !isNaN(money) ? money : 0,
            gold: !isNaN(gold) ? gold : 0,
            kills: !isNaN(kills) ? kills : 0,
            deaths: !isNaN(deaths) ? deaths : 0,
            playtime: !isNaN(playtime) ? playtime : 0
          };

          // Retrieve current points and lastPlaytime from Firebase to calculate playtime rewards
          let currentPoints = 0;
          let lastPlaytimeVal = 0;
          try {
            const playerSnap = await firebase.db.ref(`playerData/${playerName}`).once('value');
            if (playerSnap.exists()) {
              const pData = playerSnap.val();
              currentPoints = pData.points || 0;
              lastPlaytimeVal = pData.lastPlaytime || 0;
            }
          } catch (dbErr) {
            console.warn(`[Sync] Could not read existing points/playtime for ${playerName}:`, dbErr.message);
          }

          let pointsToAward = 0;
          let newLastPlaytime = lastPlaytimeVal;

          if (!isNaN(playtime) && playtime > 0) {
            if (lastPlaytimeVal === 0) {
              // First time syncing, initialize lastPlaytime so we do not award retrospective points
              newLastPlaytime = playtime;
            } else if (playtime > lastPlaytimeVal) {
              const diffSeconds = playtime - lastPlaytimeVal;
              const earnedPoints = Math.floor(diffSeconds / 360); // 1 point per 6 minutes (360 seconds)
              if (earnedPoints > 0) {
                pointsToAward = earnedPoints;
                newLastPlaytime = lastPlaytimeVal + (earnedPoints * 360);
              }
            } else if (playtime < lastPlaytimeVal) {
              // Stat reset or manual adjustment, reset to prevent issues
              newLastPlaytime = playtime;
            }
          }

          // Build unified metadata updates
          const metaUpdates = {};
          if (!isNaN(gold)) {
            metaUpdates.gold = gold;
          }
          if (rawRank) {
            const cleanRank = this.cleanPrefix(rawRank);
            if (cleanRank) {
              metaUpdates.rank = cleanRank;
            }
          }
          if (newLastPlaytime !== lastPlaytimeVal) {
            metaUpdates.lastPlaytime = newLastPlaytime;
          }
          if (pointsToAward > 0) {
            metaUpdates.points = currentPoints + pointsToAward;
          }

          // Write unified updates to Firebase
          if (Object.keys(metaUpdates).length > 0) {
            await firebase.updatePlayerMetadata(playerName, metaUpdates);
          }

          if (pointsToAward > 0) {
            console.log(`[Sync] Awarded ${pointsToAward} point(s) to ${playerName} for playtime (${playtime}s, last was ${lastPlaytimeVal}s)`);
            
            // Log the point transaction
            try {
              const txRef = firebase.db.ref('point_transactions').push();
              await txRef.set({
                playerName,
                amount: pointsToAward,
                type: 'playtime',
                description: `Earned ${pointsToAward} Point(s) for playing ${Math.round((pointsToAward * 360) / 60)} minutes.`,
                timestamp: Date.now()
              });
            } catch (txErr) {
              console.error(`[Sync] Failed to write playtime transaction for ${playerName}:`, txErr.message);
            }
          }

        } catch (playerErr) {
          console.error(`[Sync] Failed to process stats for ${playerName}:`, playerErr.message);
        }
      }

      // 5. Update Firebase leaderboards for all categories
      for (const stat of this.objectives) {
        try {
          const statData = {};
          for (const [name, stats] of Object.entries(allStats.players)) {
            // Ensure no invalid Firebase database keys
            if (stats[stat] !== undefined && name && !/[.#$/\[\]]/.test(name)) {
              statData[name] = stats[stat];
            }
          }

          if (Object.keys(statData).length > 0) {
            await firebase.updateLeaderboard(stat, statData);
          }
        } catch (statErr) {
          console.error(`[Sync] Failed to update leaderboard for ${stat}:`, statErr.message);
        }
      }

      // 6. Trigger Forum Sync to process posts/replies and award activity points
      try {
        await forumSync.sync();
      } catch (forumErr) {
        console.error('[Sync] Forum synchronization failed:', forumErr.message);
      }

      console.log(`[Sync] Successfully finished real-time synchronization for ${Object.keys(allStats.players).length} active players.`);
    } catch (error) {
      console.error('[Sync] Synchronization failed:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  async syncIslandTop() {
    console.log('[Sync] Syncing Island Top leaderboard...');
    const islandData = {};
    const topCount = 10;

    try {
      const target = 'OblivionKingX'; 

      for (let i = 1; i <= topCount; i++) {
        const islandName = (await rcon.sendCommand(`papi parse ${target} %superior_island_top_worth_${i}%`)).trim();
        const leaderName = (await rcon.sendCommand(`papi parse ${target} %superior_island_top_worth_${i}_leader%`)).trim();
        const worthValue = (await rcon.sendCommand(`papi parse ${target} %superior_island_top_worth_value_${i}%`)).trim();
        
        const value = worthValue ? parseFloat(worthValue.replace(/,/g, '')) : 0;
        const finalIslandName = (islandName && islandName !== 'None' && islandName !== '---' && !islandName.includes('%')) 
                                ? islandName 
                                : leaderName;

        if (finalIslandName && finalIslandName !== 'None' && finalIslandName !== '---' && !finalIslandName.includes('%')) {
          islandData[`slot_${i}`] = {
            islandName: (islandName && islandName.length > 0) ? islandName : 'Unnamed Island',
            leaderName: leaderName,
            worth: value
          };

          if (leaderName && leaderName.length > 0) {
            const prefixResponse = await rcon.sendCommand(`papi parse ${target} %luckperms_prefix_${leaderName}%`);
            const cleanPrefix = this.cleanPrefix(prefixResponse);
            
            if (cleanPrefix) {
              await firebase.updatePlayerMetadata(leaderName, { rank: cleanPrefix });
            }
          }
        }
      }

      if (Object.keys(islandData).length > 0) {
        await firebase.updateLeaderboard('islands', islandData);
        console.log(`[Sync] Successfully synced ${Object.keys(islandData).length} islands.`);
      } else {
        console.log('[Sync] No valid islands found to sync.');
      }
    } catch (err) {
      console.error('[Sync] Island Top sync failed:', err.message);
    }
  }
}

module.exports = new SyncManager();
