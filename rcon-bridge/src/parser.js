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
  parsePlayerList(response) {
    if (!response) return [];
    
    // Support both "players: Steve, Alex" and "entity/entities: Steve, Alex"
    const match = response.match(/(?:players|entity\/entities): (.*)/);
    if (match && match[1]) {
      return match[1].split(',').map(name => name.trim());
    }

    // Alternative formats or empty
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
