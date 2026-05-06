const rcon = require('./rcon');
const firebase = require('./firebase');
const parser = require('./parser');
require('dotenv').config();

class SyncManager {
  constructor() {
    this.interval = parseInt(process.env.UPDATE_INTERVAL) || 60000;
    this.isRunning = false;
    this.objectives = (process.env.STATS_OBJECTIVES || 'kills,deaths,playtime,money').split(',');
    this.knownPlayers = new Set(); // Keep track of all players ever seen
    this.directStats = {}; // Store stats fetched directly (like Vault money)
  }

  async start() {
    console.log(`[Sync] Starting sync loop every ${this.interval / 1000}s...`);
    const runAll = async () => {
      await this.sync();
      await this.syncIslandTop();
    };
    runAll(); // Initial run
    setInterval(runAll, this.interval);
  }

  async sync() {
    if (this.isRunning) {
      console.warn('[Sync] Previous sync still running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('[Sync] Starting synchronization...');

    try {
      // 0. Auto-sync Money, Kills, Deaths, and Playtime from PAPI directly
      await this.syncPAPIStats();

      // 1. Get player list from Minecraft
      const playerListResponse = await rcon.sendCommand('scoreboard players list');
      const trackedPlayers = parser.parsePlayerList(playerListResponse);

      // 2. Add tracked players to our memory (Cleaned)
      trackedPlayers.forEach(p => {
        const clean = parser.cleanName(p);
        if (clean && clean.length <= 16) {
          this.knownPlayers.add(clean);
        }
      });

      // 3. Use all known players for the sync
      const players = Array.from(this.knownPlayers);

      if (players.length === 0) {
        console.log('[Sync] No tracked players found.');
        this.isRunning = false;
        return;
      }

      const allStats = {
        lastUpdate: Date.now(),
        players: {}
      };

      // 2. Fetch stats for each player
      // Note: In large servers, you might want to chunk this or use a single command if possible
      for (const playerName of players) {
        try {
          const scoresResponse = await rcon.sendCommand(`scoreboard players list ${playerName}`);
          const scores = parser.parsePlayerScores(scoresResponse);
          
          // Only include objectives we care about (case-insensitive matching)
          const filteredScores = {};
          this.objectives.forEach(obj => {
            // Check if we have a direct stat first (bypasses scoreboard limit)
            if (this.directStats[playerName] && this.directStats[playerName][obj] !== undefined) {
              filteredScores[obj] = this.directStats[playerName][obj];
            } else {
              const foundObj = Object.keys(scores).find(k => k.toLowerCase() === obj.toLowerCase());
              filteredScores[obj] = foundObj ? scores[foundObj] : 0; // Default to 0 if not found
            }
          });

          allStats.players[playerName] = filteredScores;
        } catch (err) {
          console.error(`[Sync] Failed to get stats for ${playerName}:`, err.message);
        }
      }

      // 3. Update each category individually using the new no-wipe method
      for (const stat of this.objectives) {
        const statData = {};
        for (const [name, stats] of Object.entries(allStats.players)) {
          if (stats[stat] !== undefined) {
            statData[name] = stats[stat];
          }
        }
        
        if (Object.keys(statData).length > 0) {
          await firebase.updateLeaderboard(stat, statData);
        }
      }
      
      console.log(`[Sync] Successfully synced ${players.length} players.`);
    } catch (error) {
      console.error('[Sync] Synchronization failed:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Automatically syncs stats using PlaceholderAPI for online players.
   * This bypasses the need for vanilla scoreboards.
   */
  async syncPAPIStats() {
    try {
      // Get online players
      const listResponse = await rcon.sendCommand('list');
      if (!listResponse) return;

      console.log(`[Sync] Parsing list response: ${listResponse.replace(/\n/g, ' ')}`);

      // Handle multi-line responses and various formats
      // We look for parts after a colon that contain commas or single names
      const allPlayerNames = [];
      const lines = listResponse.split('\n');
      
      for (const line of lines) {
        const parts = line.split(':');
        if (parts.length < 2) continue;
        
        const possiblePlayers = parts[parts.length - 1].split(',');
        possiblePlayers.forEach(p => {
          const clean = parser.cleanName(p);
          if (clean && clean.length >= 3 && clean.length <= 16) {
            allPlayerNames.push(clean);
          }
        });
      }

      const playerNames = [...new Set(allPlayerNames)]; // Unique names

      if (playerNames.length > 0) {
        console.log(`[Sync] Syncing PAPI stats for: ${playerNames.join(', ')}`);
        playerNames.forEach(name => this.knownPlayers.add(name));
      } else {
        console.log('[Sync] No online players detected via list.');
      }

      for (const name of playerNames) {
        if (!this.directStats[name]) this.directStats[name] = {};

        // Fetch Money
        const balanceResponse = await rcon.sendCommand(`papi parse ${name} %vault_eco_balance_fixed%`);
        const balance = parseFloat(balanceResponse);
        if (!isNaN(balance)) this.directStats[name]['money'] = balance;

        // Fetch Kills
        const killsResponse = await rcon.sendCommand(`papi parse ${name} %statistic_player_kills%`);
        const kills = parseInt(killsResponse);
        if (!isNaN(kills)) this.directStats[name]['kills'] = kills;

        // Fetch Deaths
        const deathsResponse = await rcon.sendCommand(`papi parse ${name} %statistic_deaths%`);
        const deaths = parseInt(deathsResponse);
        if (!isNaN(deaths)) this.directStats[name]['deaths'] = deaths;

        // Fetch Playtime (in seconds)
        const playtimeResponse = await rcon.sendCommand(`papi parse ${name} %statistic_seconds_played%`);
        const playtime = parseInt(playtimeResponse);
        if (!isNaN(playtime)) this.directStats[name]['playtime'] = playtime;

        // Fetch Rank/Prefix
        const prefixResponse = await rcon.sendCommand(`papi parse ${name} %luckperms_prefix%`);
        if (prefixResponse && prefixResponse.trim().length > 0) {
          await firebase.updatePlayerMetadata(name, { rank: prefixResponse.trim() });
        }
      }
    } catch (err) {
      console.warn('[Sync] PAPI sync failed:', err.message);
    }
  }

  async syncIslandTop() {
    console.log('[Sync] Syncing Island Top leaderboard...');
    const islandData = {};
    const topCount = 10;

    try {
      // We need a target player for PAPI to work on some servers
      const target = 'OblivionKingX'; 

      for (let i = 1; i <= topCount; i++) {
        // Use the placeholders that we verified work on your server
        const islandName = (await rcon.sendCommand(`papi parse ${target} %superior_island_top_worth_${i}%`)).trim();
        const leaderName = (await rcon.sendCommand(`papi parse ${target} %superior_island_top_worth_${i}_leader%`)).trim();
        const worthValue = (await rcon.sendCommand(`papi parse ${target} %superior_island_top_worth_value_${i}%`)).trim();
        
        const value = worthValue ? parseFloat(worthValue.replace(/,/g, '')) : 0;

        // Use leaderName as fallback if islandName is empty
        const finalIslandName = (islandName && islandName !== 'None' && islandName !== '---' && !islandName.includes('%')) 
                                ? islandName 
                                : leaderName;

        if (finalIslandName && finalIslandName !== 'None' && finalIslandName !== '---' && !finalIslandName.includes('%')) {
          // Store all details separately so the frontend can draw them nicely
          islandData[`slot_${i}`] = {
            islandName: (islandName && islandName.length > 0) ? islandName : 'Unnamed Island',
            leaderName: leaderName,
            worth: value
          };

          // Fetch rank for the leader
          if (leaderName && leaderName.length > 0) {
            const prefixResponse = await rcon.sendCommand(`papi parse ${target} %luckperms_prefix_${leaderName}%`);
            const cleanPrefix = prefixResponse ? prefixResponse.trim() : '';
            
            // Only save if it's a real rank (doesn't contain the placeholder % symbols)
            if (cleanPrefix.length > 0 && !cleanPrefix.includes('%')) {
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
