const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const zlib = require('zlib');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const DISCORD_TOKEN  = process.env.DISCORD_TOKEN;
const CLIENT_ID      = process.env.DISCORD_CLIENT_ID;
const EWGF_API_KEY   = process.env.EWGF_API_KEY;
const BASE_URL       = 'api.ewgf.gg';
const REGISTRY_FILE  = path.join('/app', 'registry.json');

// ─── Player Registry (Discord ID → Tekken ID) ────────────────────────────────
function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load registry:', e.message);
  }
  return {};
}

function saveRegistry(registry) {
  try {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
  } catch (e) {
    console.error('Failed to save registry:', e.message);
  }
}

// ─── Rank colours ─────────────────────────────────────────────────────────────
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

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function apiGet(urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path: urlPath,
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
            const raw = data.toString('utf8');
            try {
              const json = JSON.parse(raw);
              if (res.statusCode === 200) resolve(json);
              else reject({ status: res.statusCode, body: json });
            } catch (e) {
              console.error('Failed to parse JSON (status ' + res.statusCode + '):', raw.slice(0, 500));
              reject(new Error('Failed to parse JSON (status ' + res.statusCode + ')'));
            }
          })
          .catch((e) => {
            console.error('Decompression error:', e.message);
            reject(e);
          });
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
    if (isP1 ? b.winner === 1 : b.winner === 2) wins++;
    const char = isP1 ? b.p1_char : b.p2_char;
    charCounts[char] = (charCounts[char] || 0) + 1;
  }

  const charUsage = Object.entries(charCounts).sort((a, b) => b[1] - a[1]);
  const latest = last10[0];
  const isP1Latest = latest.p1_tekken_id === tekkenId;

  return {
    gamesAnalysed: last10.length, wins,
    losses: last10.length - wins,
    winRate: ((wins / last10.length) * 100).toFixed(1),
    charUsage,
    currentRank: isP1Latest ? latest.p1_dan_rank : latest.p2_dan_rank,
    tekkenPower: isP1Latest ? latest.p1_tekken_power : latest.p2_tekken_power,
  };
}

function buildBar(pct) {
  const filled = Math.round(pct / 10);
  return '`' + '█'.repeat(filled) + '░'.repeat(10 - filled) + '`' + ` ${pct}%`;
}

function buildEmbed(profile, stats, tekkenId) {
  const charLines = stats.charUsage
    .map(([char, count]) => {
      const pct = ((count / stats.gamesAnalysed) * 100).toFixed(0);
      return '`' + char.padEnd(16) + '`' + ` ${count}g  (${pct}%)`;
    }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(RANK_COLORS[stats.currentRank] ?? 0x5865F2)
    .setTitle(`🎮 ${profile.name}`)
    .setURL(`https://ewgf.gg/profile/${tekkenId}`)
    .setDescription(`**Tekken ID:** \`${tekkenId}\`  •  **Platform:** ${profile.platform}`)
    .addFields(
      {
        name: '📊 Current Standing',
        value: [`**Rank:** ${stats.currentRank}`, `**Tekken Power:** ${stats.tekkenPower.toLocaleString()}`, `**Tekken Prowess:** ${profile.tekken_prowess.toLocaleString()}`].join('\n'),
        inline: true,
      },
      {
        name: `⚔️ Last ${stats.gamesAnalysed} Games`,
        value: [`**W/L:** ${stats.wins}W – ${stats.losses}L`, `**Win Rate:** ${stats.winRate}%`, buildBar(parseFloat(stats.winRate))].join('\n'),
        inline: true,
      },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: '🕹️ Character Usage', value: charLines || 'No data', inline: false },
    )
    .setFooter({ text: `Region: ${profile.region}  •  Data from ewgf.gg` })
    .setTimestamp();

  if (profile.player_message) {
    embed.addFields({ name: '💬 Profile Message', value: `*${profile.player_message}*` });
  }
  return embed;
}

async function lookupPlayer(tekkenId) {
  const [profileRes, battlesRes] = await Promise.all([
    apiGet(`/external/profile/${tekkenId}`),
    apiGet(`/external/battles/${tekkenId}`),
  ]);
  return {
    profile: profileRes.data,
    stats: analyseGames(battlesRes.data, tekkenId),
  };
}

function errorMessage(err, tekkenId) {
  if (err.status === 404) return `❌ Player \`${tekkenId}\` not found.`;
  if (err.status === 401) return '❌ Invalid API key — check your EWGF_API_KEY.';
  if (err.status === 429) return '⏳ Rate limit hit. Try again in a moment.';
  return '❌ Something went wrong. Check the logs.';
}

// ─── Discord client ───────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => console.log(`✅ Logged in as ${client.user.tag}`));

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /register
  if (interaction.commandName === 'register') {
    const tekkenId = interaction.options.getString('id');
    await interaction.deferReply({ ephemeral: true });
    try {
      const profileRes = await apiGet(`/external/profile/${tekkenId}`);
      const name = profileRes.data.name;
      const registry = loadRegistry();
      registry[interaction.user.id] = { tekkenId, name, discordName: interaction.user.username };
      saveRegistry(registry);
      await interaction.editReply(`✅ Registered! You are linked to **${name}** (\`${tekkenId}\`).`);
    } catch (err) {
      console.error(err);
      await interaction.editReply(errorMessage(err, tekkenId));
    }
  }

  // /unregister
  if (interaction.commandName === 'unregister') {
    const registry = loadRegistry();
    if (registry[interaction.user.id]) {
      delete registry[interaction.user.id];
      saveRegistry(registry);
      await interaction.reply({ content: '✅ Your Tekken ID has been unlinked.', ephemeral: true });
    } else {
      await interaction.reply({ content: '⚠️ You have no registered Tekken ID.', ephemeral: true });
    }
  }

  // /tekken
  if (interaction.commandName === 'tekken') {
    const rawId   = interaction.options.getString('id');
    const mention = interaction.options.getUser('player');
    let tekkenId  = rawId;

    if (mention) {
      const registry = loadRegistry();
      const entry = registry[mention.id];
      if (!entry) {
        return interaction.reply({
          content: `⚠️ ${mention.username} has not registered a Tekken ID yet. They can use \`/register\` to link one.`,
          ephemeral: true,
        });
      }
      tekkenId = entry.tekkenId;
    }

    if (!tekkenId) {
      return interaction.reply({ content: '⚠️ Please provide a Tekken ID or mention a registered player.', ephemeral: true });
    }

    await interaction.deferReply();
    try {
      const { profile, stats } = await lookupPlayer(tekkenId);
      if (!stats) return interaction.editReply('⚠️ No battle data found for this player.');
      await interaction.editReply({ embeds: [buildEmbed(profile, stats, tekkenId)] });
    } catch (err) {
      console.error(err);
      await interaction.editReply(errorMessage(err, tekkenId));
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
    const results = await Promise.allSettled(entries.map((e) => lookupPlayer(e.tekkenId)));

    const lines = results.map((result, i) => {
      const entry = entries[i];
      if (result.status === 'rejected') return `❌ **${entry.name}** — failed to fetch`;
      const { profile, stats } = result.value;
      if (!stats) return `⚠️ **${profile.name}** — no battle data`;
      const mainChar = stats.charUsage[0]?.[0] ?? '?';
      return `**${profile.name}** • ${stats.currentRank} • ${mainChar} • ${stats.winRate}% WR (${stats.wins}W-${stats.losses}L last ${stats.gamesAnalysed})`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🏆 Tekken Austria Roster')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `${entries.length} registered player(s)  •  Data from ewgf.gg` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
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
      .setName('register')
      .setDescription('Link your Discord account to your Tekken ID')
      .addStringOption((opt) => opt.setName('id').setDescription('Your Tekken ID (find it on ewgf.gg)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('unregister')
      .setDescription('Unlink your Tekken ID from your Discord account'),

    new SlashCommandBuilder()
      .setName('tekken')
      .setDescription('Look up a Tekken 8 player\'s stats')
      .addStringOption((opt) => opt.setName('id').setDescription('Tekken ID (e.g. 3YrtMtjNqqBn)').setRequired(false))
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
