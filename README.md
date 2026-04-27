# Tekken 8 Discord Bot (ewgf.gg)

Look up any Tekken 8 player's last 10 games with a single slash command.

## What it shows

- Current rank & Tekken Power
- W/L record + win rate (with a visual bar) over the last 10 ranked games
- Character usage breakdown
- Profile metadata (platform, region, player message)

## Setup

### 1. Prerequisites

- Node.js 18+
- A Discord bot (create one at https://discord.com/developers/applications)
- An ewgf.gg account with an API key (Settings → Developer tab)

### 2. Install dependencies

```bash
npm install
```

### 3. Set environment variables

Create a `.env` file (or export in your shell):

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_client_id
EWGF_API_KEY=your_ewgf_api_key
```

> **Note:** The free EWGF plan gives 50 battles with a 24h delay. For real-time stats, upgrade to Pro ($10/mo).

### 4. Run the bot

```bash
node bot.js
```

On first run it registers the `/tekken` slash command globally (can take up to 1 hour to propagate to all Discord servers). Subsequent runs skip re-registration but it won't hurt to leave it in.

### 5. Invite the bot to your server

In the Discord Developer Portal → OAuth2 → URL Generator:
- Scopes: `bot`, `applications.commands`
- Bot Permissions: `Send Messages`, `Use Slash Commands`, `Embed Links`

## Usage

```
/tekken id:3YrtMtjNqqBn
```

Replace `3YrtMtjNqqBn` with any player's Tekken ID (visible on their ewgf.gg profile URL).

## Environment Variables Reference

| Variable             | Description                          |
|----------------------|--------------------------------------|
| `DISCORD_TOKEN`      | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID`  | Application (client) ID              |
| `EWGF_API_KEY`       | ewgf.gg API key from Developer tab   |

## Notes

- The bot uses Discord.js v14 with slash commands only (no prefix commands).
- All API responses are gzip-decompressed automatically.
- Error codes (404, 401, 429) are handled with user-friendly messages.
