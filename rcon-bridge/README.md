# Minecraft RCON to Firebase Bridge

A production-ready Node.js application that synchronizes Minecraft player statistics with Firebase Realtime Database.

## Features
- **Live Leaderboard Sync**: Automatically fetches data from Minecraft and pushes to Firebase.
- **Resilient Connection**: Handles RCON disconnects and retries.
- **Flexible Stats**: Track any scoreboard objective defined in Minecraft.
- **Structured Data**: Stores data in a clean format optimized for web leaderboards.

## Prerequisites
- Node.js 18+
- A Minecraft server with RCON enabled
- A Firebase project with Realtime Database enabled

## Installation

1.  **Clone or Download** this folder to your server.
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Setup Configuration**:
    - Copy `.env.example` to `.env`.
    - Fill in your RCON details and Firebase Database URL.
    - Place your Firebase Service Account JSON file in the project folder and update `FIREBASE_SERVICE_ACCOUNT_PATH` in `.env`.

## Minecraft Setup

To track statistics, you must create scoreboard objectives in Minecraft:

```mcfunction
# Create objectives
/scoreboard objectives add kills playerKillCount "Kills"
/scoreboard objectives add deaths deathCount "Deaths"
/scoreboard objectives add playtime dummy "Playtime"

# (Optional) If you want to track things manually or via plugins
/scoreboard objectives add money dummy "Money"
```

Then add these names (`kills`, `deaths`, `playtime`, `money`) to the `STATS_OBJECTIVES` variable in your `.env` file.

## Running the Application

### Development
```bash
npm run dev
```

### Production
Using a process manager like **PM2** is highly recommended:
```bash
npm install -g pm2
pm2 start src/index.js --name mc-bridge
```

## Firebase Database Structure

The data will be stored as follows:

```json
{
  "leaderboard": {
    "kills": {
      "Steve": 120,
      "Alex": 95
    },
    "deaths": {
      "Steve": 30,
      "Alex": 40
    }
  }
}
```

## Troubleshooting
- **RCON Connection Refused**: Ensure `enable-rcon=true` is set in your `server.properties` and the port is open in your firewall.
- **Firebase Permission Denied**: Check your Firebase Database Rules. You might need to allow writes from the service account.
- **No Players Found**: The bridge only syncs players who have at least one score in the tracked objectives.
