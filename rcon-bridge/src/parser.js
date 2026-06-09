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
    
    // 1. Remove Minecraft color codes (§ and & codes)
    let cleaned = name.replace(/[§&]./g, '');
    
    // 2. Strip out common rank/status/AFK tags that appear in /list
    const tags = ['STAFF', 'OWNER', 'ADMIN', 'MODERATOR', 'HELPER', 'VIP', 'MVP', 'BUILDER', 'AFK', 'ROYALTY', 'KNIGHT', 'MEMBER', 'CO'];
    tags.forEach(tag => {
      // Match tag at the start of the string, even if no space follows it
      const regex = new RegExp(`^${tag}\\b?`, 'i');
      cleaned = cleaned.replace(regex, '');
    });

    // 3. IMPORTANT: Remove all characters that are NOT valid in a Minecraft name 
    // This also ensures the name is a valid Firebase key.
    // Minecraft names only allow A-Z, a-z, 0-9 and _
    cleaned = cleaned.replace(/[^A-Za-z0-9_]/g, '');

    // 4. Safe fallback for direct concatenation (e.g. AFKOblivionKingX -> OblivionKingX)
    // Only strip if it starts with "AFK" followed by an uppercase letter or underscore
    cleaned = cleaned.replace(/^AFK([A-Z_])/, '$1');

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
