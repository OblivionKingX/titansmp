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

  /**
   * Connects and authenticates with the RCON server.
   * Returns a Promise that resolves when authenticated.
   */
  async connect() {
    if (this.client && this.client.authenticated) {
      return this.client;
    }

    return new Promise((resolve, reject) => {
      console.log(`[RCON] Connecting to ${this.config.host}:${this.config.port}...`);
      
      try {
        this.client = new Rcon(this.config);

        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('RCON connection/auth timeout'));
        }, 10000);

        const onAuthenticated = () => {
          console.log('[RCON] Successfully connected and authenticated.');
          cleanup();
          resolve(this.client);
        };

        const onError = (err) => {
          console.error('[RCON] Connection error:', err.message);
          cleanup();
          this.client = null;
          reject(err);
        };

        const cleanup = () => {
          clearTimeout(timeout);
          this.client.removeListener('authenticated', onAuthenticated);
          this.client.removeListener('error', onError);
        };

        this.client.on('authenticated', onAuthenticated);
        this.client.on('error', onError);

        this.client.connect();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Sends a command and returns the response body.
   */
  async sendCommand(command) {
    const client = await this.connect();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`RCON command timeout: ${command}`));
      }, 5000);

      client.send(command, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });
  }

  async disconnect() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }
}

module.exports = new RconService();
