const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const zlib = require('zlib');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const DISCORD_TOKEN  = process.env.DISCORD_TOKEN;
const CLIENT_ID      = process.env.DISCORD_CLIENT_ID;
const BASE_URL       = 'wank.wavu.wiki';
const REGISTRY_FILE  = path.join('/app', 'registry.json');

// ─── Character ID map (from wank.wavu.wiki replay data) ──────────────────────
const CHARA_ID = {
  0:  'Jin',        1:  'Kazuya',     2:  'Paul',       3:  'Law',
  4:  'Jack-8',     5:  'King',       6:  'Jun',        7:  'Reina',
  8:  'Lars',       9:  'Xiaoyu',     10: 'Hwoarang',   11: 'Yoshimitsu',
  12: 'Leroy',      13: 'Asuka',      14: 'Lili',       15: 'Nina',
  16: 'Lee',        17: 'Kuma',       18: 'Panda',      19: 'Feng',
  20: 'Leo',        21: 'Steve',      22: 'Bryan',       23: 'Dragunov',
  24: 'Raven',      25: 'Shaheen',    26: 'Claudio',    27: 'Alisa',
  28: 'Zafina',     29: 'Victor',     30: 'Devil Jin',  31: 'Azucena',
  32: 'Lidia',      33: 'Armor King', 34: 'Miary Zo',   35: 'Anna',
  36: 'Eddy',       37: 'Heihachi',   38: 'Clive',      39: 'Fahkumram',
  40: 'Reina',      41: 'Lars',       42: 'Xiaoyu',     43: 'Yoshimitsu',
  44: 'Leroy',      45: 'Steve',
};

// ─── Rank ID map ──────────────────────────────────────────────────────────────
const RANK_ID = {
  0:  'Beginner',      1:  'Fighter',       2:  'Strategist',    3:  'Combatant',
  4:  'Brawler',       5:  'Ranger',        6:  'Cavalry',       7:  'Warrior',
  8:  'Assailant',     9:  'Dominator',     10: 'Vindicator',    11: 'Juggernaut',
  12: 'Usurper',       13: 'Vanquisher',    14: 'Destroyer',     15: 'Eliminator',
  16: 'Garyu',         17: 'Shinryu',       18: 'Tenryu',        19: 'Mighty Ruler',
  20: 'Flame Ruler',   21: 'Battle Ruler',  22: 'Fujin',         23: 'Raijin',
  24: 'Kishin',        25: 'Bushin',        26: 'Tekken King',   27: 'Tekken Emperor',
  28: 'Tekken God',    29: 'Tekken God Supreme', 30: 'God of Destruction', 31: 'Tekken God Supreme', 32: 'God of Destruction',
};

const RANK_COLORS = {
  'Beginner': 0x808080, 'Fighter': 0xCD7F32, 'Strategist': 0xCD7F32,
  'Combatant': 0xC0C0C0, 'Brawler': 0xC0C0C0, 'Ranger': 0xFFD700,
  'Cavalry': 0xFFD700, 'Warrior': 0xFFD700, 'Assailant': 0x00BFFF,
  'Dominator': 0x00BFFF, 'Vindicator': 0x9370DB, 'Juggernaut': 0x9370DB,
  'Usurper': 0xFF4500, 'Vanquisher': 0xFF4500, 'Destroyer': 0xFF4500,
  'Eliminator': 0xFF4500, 'Garyu': 0xFF0000, 'Shinryu': 0xFF0000,
  'Tenryu': 0xFF0000, 'Mighty Ruler': 0xFF0000, 'Flame Ruler': 0xFF0000,
  'Battle Ruler': 0xFF0000, 'Fujin': 0xFFFFFF, 'Raijin': 0xFFFFFF,
  'Kishin': 0xFFFFFF, 'Bushin': 0xFFFFFF, 'Tekken King': 0xFFD700,
  'Tekken Emperor': 0xFFD700, 'Tekken God': 0xFFD700,
  'Tekken God Supreme': 0xFFD700, 'God of Destruction': 0xFF4500,
};

// ─── Player Registry ──────────────────────────────────────────────────────────
function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_FILE)) return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch (e) { console.error('Failed to load registry:', e.message); }
  return {};
}

function saveRegistry(registry) {
  try { fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2)); }
  catch (e) { console.error('Failed to save registry:', e.message); }
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function httpGet(hostname, urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path: urlPath,
      method: 'GET',
      headers: { 'Accept-Encoding': 'gzip', 'User-Agent': 'TekkenAustriaBot/1.0' },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const decompress = res.headers['content-encoding'] === 'gzip'
          ? (b) => new Promise((r, x) => zlib.gunzip(b, (e, d) => e ? x(e) : r(d)))
          : (b) => Promise.resolve(b);

        decompress(buf).then((data) => {
          const raw = data.toString('utf8');
          try {
            resolve({ status: res.statusCode, json: JSON.parse(raw) });
          } catch (e) {
            console.error('Failed to parse JSON:', raw.slice(0, 300));
            reject(new Error('Failed to parse JSON'));
          }
        }).catch(reject);
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// ─── Fetch replays for a polaris ID ──────────────────────────────────────────
// Scans up to MAX_BATCHES batches of replays to find the player
const MAX_BATCHES = 50; // covers ~1 hour of recent games

async function fetchPlayerReplays(polarisId) {
  let before = Math.floor(Date.now() / 1000);
  let playerBattles = [];
  let playerName = null;

  for (let i = 0; i < MAX_BATCHES; i++) {
    const { json } = await httpGet(BASE_URL, `/api/replays?before=${before}`);
    if (!Array.isArray(json) || json.length === 0) break;

    for (const b of json) {
      const isP1 = b.p1_polaris_id === polarisId;
      const isP2 = b.p2_polaris_id === polarisId;
      if (isP1 || isP2) {
        playerBattles.push(b);
        if (!playerName) playerName = isP1 ? b.p1_name : b.p2_name;
      }
    }

    // Move before back by 700 seconds for next batch
    before = json[json.length - 1].battle_at - 1;

    // Stop early if we have enough games
    if (playerBattles.length >= 50) break;
  }

  return { playerBattles, playerName };
}

// ─── Analyse battles ──────────────────────────────────────────────────────────
function analyseBattles(battles, polarisId) {
  if (!battles || battles.length === 0) return null;

  const recent = battles.slice(0, 50);
  let wins = 0;
  const charCounts = {};
  const charRatings = {}; // track glicko2 per char
  let highestRank = -1;
  let highestRankName = null;

  for (const b of recent) {
    const isP1 = b.p1_polaris_id === polarisId;
    const won = isP1 ? b.winner === 1 : b.winner === 2;
    if (won) wins++;

    const charaId = isP1 ? b.p1_chara_id : b.p2_chara_id;
    const charName = CHARA_ID[charaId] ?? `Char#${charaId}`;
    const rankId = isP1 ? b.p1_rank : b.p2_rank;
    const rating = isP1 ? b.p1_rating_before : b.p2_rating_before;
    const ratingChange = isP1 ? b.p1_rating_change : b.p2_rating_change;

    charCounts[charName] = (charCounts[charName] || 0) + 1;

    // Track latest rating per character
    if (rating !== null && !charRatings[charName]) {
      charRatings[charName] = { rating, ratingChange };
    }

    if (rankId > highestRank) {
      highestRank = rankId;
      highestRankName = RANK_ID[rankId] ?? `Rank#${rankId}`;
    }
  }

  const charUsage = Object.entries(charCounts).sort((a, b) => b[1] - a[1]);
  const latest = recent[0];
  const isP1Latest = latest.p1_polaris_id === polarisId;
  const currentRankId = isP1Latest ? latest.p1_rank : latest.p2_rank;

  return {
    name: isP1Latest ? latest.p1_name : latest.p2_name,
    gamesAnalysed: recent.length,
    wins,
    losses: recent.length - wins,
    winRate: ((wins / recent.length) * 100).toFixed(1),
    charUsage,
    charRatings,
    currentRank: RANK_ID[currentRankId] ?? `Rank#${currentRankId}`,
    highestRank: highestRankName,
    region: isP1Latest ? latest.p1_region_id : latest.p2_region_id,
    power: isP1Latest ? latest.p1_power : latest.p2_power,
  };
}

function regionName(id) {
  const regions = { 0: 'Asia', 1: 'Americas', 2: 'Middle East', 3: 'South America', 4: 'Europe' };
  return regions[id] ?? 'Unknown';
}

function buildBar(pct) {
  const filled = Math.round(pct / 10);
  return '`' + '█'.repeat(filled) + '░'.repeat(10 - filled) + '`' + ` ${pct}%`;
}

function buildEmbed(stats, polarisId) {
  const charLines = stats.charUsage.map(([char, count]) => {
    const pct = ((count / stats.gamesAnalysed) * 100).toFixed(0);
    const rating = stats.charRatings[char];
    const ratingStr = rating
      ? ` • μ${rating.rating} (${rating.ratingChange >= 0 ? '+' : ''}${rating.ratingChange})`
      : '';
    return '`' + char.padEnd(14) + '`' + ` ${count}g (${pct}%)${ratingStr}`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(RANK_COLORS[stats.currentRank] ?? 0x5865F2)
    .setTitle(`🎮 ${stats.name}`)
    .setURL(`https://wank.wavu.wiki/player/${polarisId}`)
    .setDescription(`**Polaris ID:** \`${polarisId}\`  •  **Region:** ${regionName(stats.region)}`)
    .addFields(
      {
        name: '📊 Current Standing',
        value: [
          `**Rank:** ${stats.currentRank}`,
          `**Peak (last ${stats.gamesAnalysed}g):** ${stats.highestRank}`,
          `**Tekken Power:** ${stats.power?.toLocaleString() ?? 'N/A'}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: `⚔️ Last ${stats.gamesAnalysed} Games`,
        value: [
          `**W/L:** ${stats.wins}W – ${stats.losses}L`,
          `**Win Rate:** ${stats.winRate}%`,
          buildBar(parseFloat(stats.winRate)),
        ].join('\n'),
        inline: true,
      },
      { name: '\u200B', value: '\u200B', inline: false },
      {
        name: '🕹️ Character Usage & Glicko2 Rating',
        value: charLines || 'No data',
        inline: false,
      },
    )
    .setFooter({ text: 'Data from wank.wavu.wiki  •  Ratings may be delayed' })
    .setTimestamp();
}

// ─── Discord client ───────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', () => console.log(`✅ Logged in as ${client.user.tag}`));

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /register
  if (interaction.commandName === 'register') {
    const polarisId = interaction.options.getString('id');
    await interaction.deferReply({ flags: 64 });
    try {
      const { playerBattles, playerName } = await fetchPlayerReplays(polarisId);
      if (playerBattles.length === 0) {
        return interaction.editReply(`⚠️ No recent battles found for \`${polarisId}\`. Make sure the ID is correct and the player has played recently.`);
      }
      const registry = loadRegistry();
      registry[interaction.user.id] = { polarisId, name: playerName, discordName: interaction.user.username };
      saveRegistry(registry);
      await interaction.editReply(`✅ Registered! You are linked to **${playerName}** (\`${polarisId}\`).`);
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ Something went wrong. Check the logs.');
    }
  }

  // /unregister
  if (interaction.commandName === 'unregister') {
    const registry = loadRegistry();
    if (registry[interaction.user.id]) {
      delete registry[interaction.user.id];
      saveRegistry(registry);
      await interaction.reply({ content: '✅ Your Tekken ID has been unlinked.', flags: 64 });
    } else {
      await interaction.reply({ content: '⚠️ You have no registered Tekken ID.', flags: 64 });
    }
  }

  // /tekken
  if (interaction.commandName === 'tekken') {
    const rawId   = interaction.options.getString('id');
    const mention = interaction.options.getUser('player');
    let polarisId = rawId;

    if (mention) {
      const registry = loadRegistry();
      const entry = registry[mention.id];
      if (!entry) {
        return interaction.reply({
          content: `⚠️ ${mention.username} has not registered yet. They can use \`/register\` to link their Tekken ID.`,
          flags: 64,
        });
      }
      polarisId = entry.polarisId;
    }

    if (!polarisId) {
      return interaction.reply({ content: '⚠️ Please provide a Polaris ID or mention a registered player.', flags: 64 });
    }

    await interaction.deferReply();
    try {
      const { playerBattles } = await fetchPlayerReplays(polarisId);
      if (playerBattles.length === 0) {
        return interaction.editReply(`⚠️ No recent battles found for \`${polarisId}\`. The player may not have played recently (data covers ~last 5 hours).`);
      }
      const stats = analyseBattles(playerBattles, polarisId);
      await interaction.editReply({ embeds: [buildEmbed(stats, polarisId)] });
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ Something went wrong. Check the logs.');
    }
  }

  // /roster
  if (interaction.commandName === 'roster') {
    const registry = loadRegistry();
    const entries  = Object.values(registry);
    if (entries.length === 0) {
      return interaction.reply('⚠️ No players registered yet. Use `/register` to add yourself!');
    }

    await interaction.deferReply();
    const results = await Promise.allSettled(
      entries.map((e) => fetchPlayerReplays(e.polarisId))
    );

    const lines = results.map((result, i) => {
      const entry = entries[i];
      if (result.status === 'rejected') return `❌ **${entry.name}** — failed to fetch`;
      const { playerBattles } = result.value;
      if (playerBattles.length === 0) return `⚠️ **${entry.name}** — no recent battles`;
      const stats = analyseBattles(playerBattles, entry.polarisId);
      const mainChar = stats.charUsage[0]?.[0] ?? '?';
      const rating = stats.charRatings[mainChar];
      const ratingStr = rating ? ` • μ${rating.rating}` : '';
      return `**${stats.name}** • ${stats.currentRank} • ${mainChar}${ratingStr} • ${stats.winRate}% WR (${stats.wins}W-${stats.losses}L)`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🏆 Tekken Austria Roster')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `${entries.length} registered player(s)  •  Data from wank.wavu.wiki` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
});

// ─── Register slash commands then start ──────────────────────────────────────
async function main() {
  if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.error('❌ Missing env vars: DISCORD_TOKEN, DISCORD_CLIENT_ID');
    process.exit(1);
  }

  const commands = [
    new SlashCommandBuilder()
      .setName('register')
      .setDescription('Link your Discord account to your Tekken Polaris ID')
      .addStringOption((opt) => opt.setName('id').setDescription('Your Polaris ID from wank.wavu.wiki (e.g. 5Y6b4b9H278n)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('unregister')
      .setDescription('Unlink your Tekken ID from your Discord account'),

    new SlashCommandBuilder()
      .setName('tekken')
      .setDescription('Look up a Tekken 8 player\'s stats')
      .addStringOption((opt) => opt.setName('id').setDescription('Polaris ID from wank.wavu.wiki').setRequired(false))
      .addUserOption((opt) => opt.setName('player').setDescription('Mention a registered Discord user').setRequired(false)),

    new SlashCommandBuilder()
      .setName('roster')
      .setDescription('Show stats for all registered players'),

  ].map((c) => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  console.log('⏳ Registering slash commands...');
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('✅ Slash commands registered globally.');

  client.login(DISCORD_TOKEN);
}

main().catch(console.error);
