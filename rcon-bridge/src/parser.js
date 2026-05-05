/**
 * Parser for Minecraft RCON responses.
 */
class Parser {
  /**
   * Parses the output of "/scoreboard players list"
   * Example: "There are 2 tracked players: Steve, Alex"
   * @param {string} response 
   * @returns {string[]} List of player names
   */
  /**
   * Cleans a player name by removing color codes, prefixes, and suffixes.
   * Minecraft usernames only allow a-z, A-Z, 0-9 and _
   * @param {string} name 
   * @returns {string} Cleaned username
   */
  cleanName(name) {
    if (!name) return '';
    
    // 1. Remove Minecraft color codes (§ codes) - handles standard and hex
    let cleaned = name.replace(/§./g, '');
    
    // 2. Remove common prefix/suffix patterns like [Admin], (Member), etc.
    cleaned = cleaned.replace(/[\[\(].*?[\]\)]/g, '');

    // 3. Trim and handle multiple rank keywords (e.g. "Developer Steve STAFF")
    cleaned = cleaned.trim();

    const rankPrefixes = [
      'owner', 'co-owner', 'manager', 'admin', 'lead developer', 'developer', 
      'moderator', 'mod', 'helper', 'staff', 'builder', 'pvper', 'grinder', 'member',
      'vip', 'mvp', 'elite', 'titan'
    ];
    
    // Split into words and filter out rank keywords
    const words = cleaned.split(/\s+/);
    const filteredWords = words.filter(word => {
      return !rankPrefixes.includes(word.toLowerCase());
    });

    // Take the first word that remains (usually the username)
    cleaned = filteredWords[0] || '';

    // 4. Remove "B'." prefix sometimes seen in RCON responses
    cleaned = cleaned.replace(/^B'\./g, '');

    return cleaned.trim();
  }

  /**
   * Parses the output of "/scoreboard players list"
   * Example: "There are 2 tracked players: Steve, Alex"
   * @param {string} response 
   * @returns {string[]} List of player names
   */
  parsePlayerList(response) {
    if (!response) return [];
    
    const match = response.match(/(?:players|entity\/entities): (.*)/);
    if (match && match[1]) {
      return match[1].split(',').map(name => this.cleanName(name)).filter(name => name.length > 0);
    }

    return [];
  }

  /**
   * Parses the output of "/scoreboard players list <player>"
   * Example: "Steve has 3 score(s): [kills]: 120, [deaths]: 30, [playtime]: 5400"
   * @param {string} response 
   * @returns {Object} { kills: 120, deaths: 30, ... }
   */
  parsePlayerScores(response) {
    const scores = {};
    if (!response) return scores;

    // Vanilla format matches scores like [objective]: value
    const regex = /\[(.*?)\]: (\d+)/g;
    let match;
    while ((match = regex.exec(response)) !== null) {
      const objective = match[1];
      const value = parseInt(match[2]);
      scores[objective] = value;
    }

    return scores;
  }

  /**
   * Parses a generic leaderboard command if available (e.g. from a plugin)
   * This is a fallback if specific plugins are used.
   * @param {string} response 
   * @returns {Array} List of { name, value }
   */
  parsePluginLeaderboard(response) {
    // Custom implementation depends on the plugin
    // This is just a placeholder logic
    return [];
  }
}

module.exports = new Parser();
