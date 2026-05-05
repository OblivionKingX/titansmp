const { Rcon } = require('rcon-client');
require('dotenv').config();

class RconService {
  constructor() {
    this.client = null;
    this.config = {
      host: process.env.RCON_HOST,
      port: parseInt(process.env.RCON_PORT),
      password: process.env.RCON_PASSWORD,
    };
  }

  async connect() {
    // Check if client exists and socket is still active
    if (this.client && this.client.socket && !this.client.socket.destroyed) {
      return this.client;
    }

    try {
      console.log(`[RCON] Connecting to ${this.config.host}:${this.config.port}...`);
      this.client = await Rcon.connect(this.config);
      console.log('[RCON] Connected successfully');
      return this.client;
    } catch (err) {
      this.client = null;
      throw err;
    }
  }

  /**
   * Sends a command and returns the response body.
   */
  async sendCommand(command) {
    const client = await this.connect();
    return await client.send(command);
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.end();
      } catch (err) {
        // Ignore errors during disconnect
      }
      this.client = null;
    }
  }
}

module.exports = new RconService();
