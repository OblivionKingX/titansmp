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
    this.sync(); // Initial run
    setInterval(() => this.sync(), this.interval);
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

      // 2. Add tracked players to our memory
      trackedPlayers.forEach(p => this.knownPlayers.add(p));

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

      // 3. Transform data for Realtime Database structure requested by user
      // Structure: leaderboard -> objective -> player: value
      const leaderboardData = {};
      this.objectives.forEach(obj => {
        leaderboardData[obj] = {};
        for (const [name, stats] of Object.entries(allStats.players)) {
          if (stats[obj] !== undefined) {
            leaderboardData[obj][name] = stats[obj];
          }
        }
      });

      // 4. Update Firebase
      await firebase.updateLeaderboard(leaderboardData);
      
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

      const parts = listResponse.split(':');
      if (parts.length < 2) return;

      const playerNames = parts[parts.length - 1]
        .split(',')
        .map(name => name.replace(/B'.|§./g, '').replace(/[^a-zA-Z0-9_]/g, '').trim())
        .filter(name => name.length > 0);

      if (playerNames.length > 0) {
        console.log(`[Sync] Syncing PAPI stats for: ${playerNames.join(', ')}`);
        playerNames.forEach(name => this.knownPlayers.add(name));
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
      }
    } catch (err) {
      console.warn('[Sync] PAPI sync failed:', err.message);
    }
  }
}

module.exports = new SyncManager();
