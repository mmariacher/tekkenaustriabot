const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const zlib = require('zlib');
const https = require('https');

// ─── Config (set via environment variables) ───────────────────────────────────
const DISCORD_TOKEN  = process.env.DISCORD_TOKEN;
const CLIENT_ID      = process.env.DISCORD_CLIENT_ID;
const EWGF_API_KEY   = process.env.EWGF_API_KEY;
const BASE_URL       = 'api.ewgf.gg';

// ─── Rank ordering (for display colour) ──────────────────────────────────────
const RANK_COLORS = {
  'Beginner': 0x808080,
  'Fighter': 0xCD7F32,
  'Strategist': 0xCD7F32,
  'Combatant': 0xC0C0C0,
  'Brawler': 0xC0C0C0,
  'Ranger': 0xFFD700,
  'Cavalry': 0xFFD700,
  'Warrior': 0xFFD700,
  'Assailant': 0x00BFFF,
  'Dominator': 0x00BFFF,
  'Vindicator': 0x9370DB,
  'Juggernaut': 0x9370DB,
  'Usurper': 0xFF4500,
  'Vanquisher': 0xFF4500,
  'Destroyer': 0xFF4500,
  'Eliminator': 0xFF4500,
  'Garyu': 0xFF0000,
  'Shinryu': 0xFF0000,
  'Tenryu': 0xFF0000,
  'Mighty Ruler': 0xFF0000,
  'Flame Ruler': 0xFF0000,
  'Battle Ruler': 0xFF0000,
  'Fujin': 0xFFFFFF,
  'Raijin': 0xFFFFFF,
  'Kishin': 0xFFFFFF,
  'Bushin': 0xFFFFFF,
  'Tekken King': 0xFFD700,
  'Tekken Emperor': 0xFFD700,
  'Tekken God': 0xFFD700,
  'Tekken God Supreme': 0xFFD700,
  'God of Destruction': 0xFF4500,
};

// ─── HTTP helper (handles gzip, returns parsed JSON) ─────────────────────────
function apiGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${EWGF_API_KEY}`,
        'Accept-Encoding': 'gzip',
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const decompress = res.headers['content-encoding'] === 'gzip'
          ? (b) => new Promise((r, x) => zlib.gunzip(b, (e, d) => e ? x(e) : r(d)))
          : (b) => Promise.resolve(b);

        decompress(buf)
          .then((data) => {
            try {
              const json = JSON.parse(data.toString());
              if (res.statusCode === 200) resolve(json);
              else reject({ status: res.statusCode, body: json });
            } catch (e) {
              reject(new Error('Failed to parse JSON'));
            }
          })
          .catch(reject);
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// ─── Stats helpers ────────────────────────────────────────────────────────────
function analyseGames(battles, tekkenId) {
  if (!battles || battles.length === 0) return null;

  const last10 = battles.slice(0, 10);

  let wins = 0;
  const charCounts = {};

  for (const b of last10) {
    const isP1 = b.p1_tekken_id === tekkenId;
    const won  = isP1 ? b.winner === 1 : b.winner === 2;
    if (won) wins++;

    const char = isP1 ? b.p1_char : b.p2_char;
    charCounts[char] = (charCounts[char] || 0) + 1;
  }

  // Sort characters by usage desc
  const charUsage = Object.entries(charCounts)
    .sort((a, b) => b[1] - a[1]);

  // Get the player's current rank from the most recent battle
  const latest = last10[0];
  const isP1Latest = latest.p1_tekken_id === tekkenId;
  const currentRank = isP1Latest ? latest.p1_dan_rank : latest.p2_dan_rank;
  const tekkenPower = isP1Latest ? latest.p1_tekken_power : latest.p2_tekken_power;

  return {
    gamesAnalysed: last10.length,
    wins,
    losses: last10.length - wins,
    winRate: ((wins / last10.length) * 100).toFixed(1),
    charUsage,
    currentRank,
    tekkenPower,
  };
}

function buildEmbed(profile, stats, tekkenId) {
  const rankColor = RANK_COLORS[stats.currentRank] ?? 0x5865F2;

  const winRateBar = buildBar(parseFloat(stats.winRate));

  const charLines = stats.charUsage
    .map(([char, count]) => {
      const pct = ((count / stats.gamesAnalysed) * 100).toFixed(0);
      return `\`${char.padEnd(16)}\` ${count}g  (${pct}%)`;
    })
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(rankColor)
    .setTitle(`🎮 ${profile.name}`)
    .setURL(`https://ewgf.gg/profile/${tekkenId}`)
    .setDescription(`**Tekken ID:** \`${tekkenId}\`  •  **Platform:** ${profile.platform}`)
    .addFields(
      {
        name: '📊 Current Standing',
        value: [
          `**Rank:** ${stats.currentRank}`,
          `**Tekken Power:** ${stats.tekkenPower.toLocaleString()}`,
          `**Tekken Prowess:** ${profile.tekken_prowess.toLocaleString()}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: `⚔️ Last ${stats.gamesAnalysed} Games`,
        value: [
          `**W/L:** ${stats.wins}W – ${stats.losses}L`,
          `**Win Rate:** ${stats.winRate}%`,
          winRateBar,
        ].join('\n'),
        inline: true,
      },
      { name: '\u200B', value: '\u200B', inline: false },
      {
        name: '🕹️ Character Usage',
        value: charLines || 'No data',
        inline: false,
      },
    )
    .setFooter({ text: `Region: ${profile.region}  •  Data from ewgf.gg` })
    .setTimestamp();

  if (profile.player_message) {
    embed.addFields({ name: '💬 Profile Message', value: `*${profile.player_message}*` });
  }

  return embed;
}

function buildBar(pct) {
  const filled = Math.round(pct / 10);
  const empty  = 10 - filled;
  const bar    = '█'.repeat(filled) + '░'.repeat(empty);
  return `\`${bar}\` ${pct}%`;
}

// ─── Discord setup ────────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'tekken') {
    const tekkenId = interaction.options.getString('id');
    await interaction.deferReply();

    try {
      // Fetch profile + battles in parallel
      const [profileRes, battlesRes] = await Promise.all([
        apiGet(`/external/profile/${tekkenId}`),
        apiGet(`/external/battles/${tekkenId}`),
      ]);

      const profile  = profileRes.data;
      const battles  = battlesRes.data;

      const stats = analyseGames(battles, tekkenId);

      if (!stats) {
        return interaction.editReply('⚠️ No battle data found for this player.');
      }

      const embed = buildEmbed(profile, stats, tekkenId);
      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error(err);
      if (err.status === 404) {
        await interaction.editReply(`❌ Player \`${tekkenId}\` not found.`);
      } else if (err.status === 401) {
        await interaction.editReply('❌ Invalid API key — check your EWGF_API_KEY.');
      } else if (err.status === 429) {
        await interaction.editReply('⏳ Rate limit hit. Try again in a moment.');
      } else {
        await interaction.editReply('❌ Something went wrong. Check the logs.');
      }
    }
  }
});

// ─── Register slash commands then start ──────────────────────────────────────
async function main() {
  if (!DISCORD_TOKEN || !CLIENT_ID || !EWGF_API_KEY) {
    console.error('❌ Missing env vars: DISCORD_TOKEN, DISCORD_CLIENT_ID, EWGF_API_KEY');
    process.exit(1);
  }

  const commands = [
    new SlashCommandBuilder()
      .setName('tekken')
      .setDescription('Look up a Tekken 8 player\'s stats')
      .addStringOption((opt) =>
        opt.setName('id')
           .setDescription('The player\'s Tekken ID (e.g. 3YrtMtjNqqBn)')
           .setRequired(true)
      ),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  console.log('⏳ Registering slash commands...');
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('✅ Slash commands registered globally.');

  client.login(DISCORD_TOKEN);
}

main().catch(console.error);
