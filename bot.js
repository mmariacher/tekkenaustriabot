const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const zlib = require('zlib');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── Dummy web server to keep Railway happy ───────────────────────────────────
http.createServer((req, res) => res.end('OK')).listen(process.env.PORT || 3000);

// ─── Config ───────────────────────────────────────────────────────────────────
const DISCORD_TOKEN  = process.env.DISCORD_TOKEN;
const CLIENT_ID      = process.env.DISCORD_CLIENT_ID;
const EWGF_API_KEY   = process.env.EWGF_API_KEY;
const EWGF_HOST      = 'api.ewgf.gg';
const WAVU_HOST      = 'wank.wavu.wiki';
const REGISTRY_FILE  = path.join('/app', 'registry.json');

// ─── Rank names ───────────────────────────────────────────────────────────────
const RANK_NAMES = [
  'Beginner', 'Fighter', 'Strategist', 'Combatant', 'Brawler',
  'Ranger', 'Cavalry', 'Warrior', 'Assailant', 'Dominator',
  'Vindicator', 'Juggernaut', 'Usurper', 'Vanquisher', 'Destroyer',
  'Eliminator', 'Garyu', 'Shinryu', 'Tenryu', 'Mighty Ruler',
  'Flame Ruler', 'Battle Ruler', 'Fujin', 'Raijin', 'Kishin',
  'Bushin', 'Tekken King', 'Tekken Emperor', 'Tekken God',
  'Tekken God Supreme', 'God of Destruction',
];

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
function httpGet(hostname, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path: urlPath,
      method: 'GET',
      headers: { 'Accept-Encoding': 'gzip', 'User-Agent': 'TekkenAustriaBot/1.0', ...headers },
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
          resolve({ status: res.statusCode, body: data.toString('utf8') });
        }).catch(reject);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── Wavu: scrape player profile page ────────────────────────────────────────
async function scrapeWavuProfile(polarisId) {
  const { status, body } = await httpGet(WAVU_HOST, `/player/${polarisId}`);
  if (status === 404) throw { status: 404 };

  const html = body;
  const result = { name: null, region: null, ratings: [] };

  // Name
  const nameMatch = html.match(/<div class="name">\s*([\s\S]*?)\s*<\/div>/);
  if (nameMatch) result.name = nameMatch[1].trim();

  // Region
  const regionMatch = html.match(/<span class="region">\s*<a[^>]*>\s*(.*?)\s*<\/a>/);
  if (regionMatch) result.region = regionMatch[1].trim();

  // Ratings — parse each rating block
  const ratingBlockRegex = /<div class="rating">([\s\S]*?)<\/div>\s*<\/div>/g;
  let match;
  while ((match = ratingBlockRegex.exec(html)) !== null) {
    const block = match[1];
    const char    = (block.match(/<div class="char">(.*?)<\/div>/) || [])[1]?.trim();
    const mu      = (block.match(/<div class="mu">μ\s*(\d+)<\/div>/) || [])[1];
    const sigma2  = (block.match(/σ²\s*(\d+)/) || [])[1];
    const games   = (block.match(/<div class="games">([\d,]+)\s*games/) || [])[1]?.replace(/,/g, '');
    const lastSeen = (block.match(/printDate\((\d+)\)/) || [])[1];

    if (char && mu) {
      result.ratings.push({
        char,
        mu: parseInt(mu),
        sigma2: sigma2 ? parseInt(sigma2) : null,
        games: games ? parseInt(games) : null,
        lastSeen: lastSeen ? new Date(parseInt(lastSeen) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : null,
      });
    }
  }

  return result;
}

// ─── Wavu: search players by name ────────────────────────────────────────────
async function searchWavuPlayers(query) {
  const { status, body } = await httpGet(WAVU_HOST, '/player/search?q=' + encodeURIComponent(query));
  if (status !== 200) return [];

  const results = [];
  const seen = new Set();
  // Match player links: <a href="/player/ID">Name</a>
  const rows = body.split('<a href="/player/');
  for (let i = 1; i < rows.length; i++) {
    const idEnd = rows[i].indexOf('"');
    const nameStart = rows[i].indexOf('>') + 1;
    const nameEnd = rows[i].indexOf('</a>');
    if (idEnd < 0 || nameStart < 0 || nameEnd < 0) continue;
    const id = rows[i].slice(0, idEnd).replace(/-/g, '');
    const name = rows[i].slice(nameStart, nameEnd).replace(/<[^>]+>/g, '').trim();
    if (!name || seen.has(id)) continue;
    seen.add(id);
    results.push({ id, name });
    if (results.length >= 25) break;
  }
  return results;
}

// ─── ewgf: fetch last 50 battles ─────────────────────────────────────────────
async function fetchEwgfBattles(polarisId) {
  const { status, body } = await httpGet(EWGF_HOST, `/external/battles/${polarisId}`, {
    'Authorization': `Bearer ${EWGF_API_KEY}`,
  });
  if (status !== 200) throw { status };
  return JSON.parse(body).data;
}

// ─── Analyse ewgf battles ─────────────────────────────────────────────────────
function analyseBattles(battles, polarisId) {
  if (!battles || battles.length === 0) return null;
  const recent = battles.slice(0, 50);
  let wins = 0;
  const charCounts = {};
  let highestRankIdx = -1;

  for (const b of recent) {
    const isP1 = b.p1_tekken_id === polarisId;
    if (isP1 ? b.winner === 1 : b.winner === 2) wins++;
    const char = isP1 ? b.p1_char : b.p2_char;
    charCounts[char] = (charCounts[char] || 0) + 1;
    const rank = isP1 ? b.p1_dan_rank : b.p2_dan_rank;
    const rankBase = rank ? rank.replace(/ (I{1,3}|IV|IX|V|VI{0,3}|X)$/i, '').trim() : '';
    const rankIdx = RANK_NAMES.indexOf(rankBase) >= 0 ? RANK_NAMES.indexOf(rankBase) : RANK_NAMES.indexOf(rank);
    if (rankIdx > highestRankIdx) highestRankIdx = rankIdx;
  }

  const charUsage = Object.entries(charCounts).sort((a, b) => b[1] - a[1]);
  const latest = recent[0];
  const isP1Latest = latest.p1_tekken_id === polarisId;

  return {
    name: isP1Latest ? latest.p1_name : latest.p2_name,
    gamesAnalysed: recent.length,
    wins,
    losses: recent.length - wins,
    winRate: ((wins / recent.length) * 100).toFixed(1),
    charUsage,
    currentRank: isP1Latest ? latest.p1_dan_rank : latest.p2_dan_rank,
    highestRank: highestRankIdx >= 0 ? RANK_NAMES[highestRankIdx] : (isP1Latest ? latest.p1_dan_rank : latest.p2_dan_rank),
    tekkenPower: isP1Latest ? latest.p1_tekken_power : latest.p2_tekken_power,
    region: isP1Latest ? latest.p1_region : latest.p2_region,
  };
}

function buildBar(pct) {
  const filled = Math.round(pct / 10);
  return '`' + '█'.repeat(filled) + '░'.repeat(10 - filled) + '`' + ` ${pct}%`;
}

// ─── Embeds ───────────────────────────────────────────────────────────────────
function buildProfileEmbed(profile, polarisId) {
  const topChar = profile.ratings[0];
  const color = RANK_COLORS[topChar?.char] ?? 0x5865F2;

  const ratingLines = profile.ratings.map((r) => {
    const muStr    = `μ${r.mu}`;
    const sigmaStr = r.sigma2 != null ? ` σ²${r.sigma2}` : '';
    const gamesStr = r.games != null ? ` • ${r.games.toLocaleString()}g` : '';
    const dateStr  = r.lastSeen ? ` • ${r.lastSeen}` : '';
    return '`' + r.char.padEnd(14) + '`' + ` ${muStr}${sigmaStr}${gamesStr}${dateStr}`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📊 ${profile.name}`)
    .setURL(`https://wank.wavu.wiki/player/${polarisId}`)
    .setDescription(`**ID:** \`${polarisId}\`  •  **Region:** ${profile.region ?? 'Unknown'}`)
    .addFields({
      name: '🏅 Glicko2 Ratings',
      value: ratingLines || 'No rated characters found.',
      inline: false,
    })
    .setFooter({ text: 'Data from wank.wavu.wiki' })
    .setTimestamp();
}

function buildTekkenEmbed(stats, polarisId) {
  const charLines = stats.charUsage.map(([char, count]) => {
    const pct = ((count / stats.gamesAnalysed) * 100).toFixed(0);
    return '`' + char.padEnd(14) + '`' + ` ${count}g (${pct}%)`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(RANK_COLORS[stats.currentRank] ?? 0x5865F2)
    .setTitle(`🎮 ${stats.name}`)
    .setURL(`https://wank.wavu.wiki/player/${polarisId}`)
    .setDescription(`**ID:** \`${polarisId}\`  •  **Region:** ${stats.region ?? 'Unknown'}`)
    .addFields(
      {
        name: '📊 Current Standing',
        value: [
          `**Rank:** ${stats.currentRank}`,
          `**Peak (last ${stats.gamesAnalysed}g):** ${stats.highestRank}`,
          `**Tekken Power:** ${stats.tekkenPower?.toLocaleString() ?? 'N/A'}`,
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
      { name: '🕹️ Character Usage', value: charLines || 'No data', inline: false },
    )
    .setFooter({ text: 'Data from ewgf.gg  •  24h delay on free plan' })
    .setTimestamp();
}

function ewgfError(err, id) {
  if (err.status === 404) return `❌ Player \`${id}\` not found on ewgf.gg.`;
  if (err.status === 401) return '❌ Invalid EWGF API key.';
  if (err.status === 429) return '⏳ Rate limit hit. Try again in a moment.';
  return '❌ Something went wrong fetching battle data.';
}

// ─── Discord client ───────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', () => console.log(`✅ Logged in as ${client.user.tag}`));


// ─── Autocomplete handler ─────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isAutocomplete()) return;

  const focused = interaction.options.getFocused();
  if (!focused || focused.length < 2) {
    return interaction.respond([]);
  }

  try {
    const results = await searchWavuPlayers(focused);
    await interaction.respond(
      results.map((r) => ({ name: `${r.name} (${r.id})`, value: r.id }))
    );
  } catch (err) {
    console.error('Autocomplete error:', err.message);
    await interaction.respond([]);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // ── /register ──────────────────────────────────────────────────────────────
  if (interaction.commandName === 'register') {
    const polarisId = interaction.options.getString('id');
    await interaction.deferReply({ flags: 64 });
    try {
      const profile = await scrapeWavuProfile(polarisId);
      if (!profile.name) return interaction.editReply(`⚠️ Could not find player \`${polarisId}\` on wank.wavu.wiki.`);
      const registry = loadRegistry();
      registry[interaction.user.id] = { polarisId, name: profile.name, discordName: interaction.user.username };
      saveRegistry(registry);
      await interaction.editReply(`✅ Registered! You are linked to **${profile.name}** (\`${polarisId}\`).`);
    } catch (err) {
      console.error(err);
      if (err.status === 404) return interaction.editReply(`❌ Player \`${polarisId}\` not found.`);
      await interaction.editReply('❌ Something went wrong.');
    }
  }

  // ── /unregister ────────────────────────────────────────────────────────────
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

  // ── /profile ───────────────────────────────────────────────────────────────
  if (interaction.commandName === 'profile') {
    const rawId   = interaction.options.getString('id');
    const mention = interaction.options.getUser('player');
    let polarisId = rawId;

    if (mention) {
      const registry = loadRegistry();
      const entry = registry[mention.id];
      if (!entry) return interaction.reply({ content: `⚠️ ${mention.username} has not registered yet.`, flags: 64 });
      polarisId = entry.polarisId;
    }

    if (!polarisId) return interaction.reply({ content: '⚠️ Please provide an ID or mention a registered player.', flags: 64 });

    await interaction.deferReply();
    try {
      const profile = await scrapeWavuProfile(polarisId);
      if (!profile.name) return interaction.editReply('⚠️ Could not find this player on wank.wavu.wiki.');
      await interaction.editReply({ embeds: [buildProfileEmbed(profile, polarisId)] });
    } catch (err) {
      console.error(err);
      if (err.status === 404) return interaction.editReply(`❌ Player \`${polarisId}\` not found.`);
      await interaction.editReply('❌ Something went wrong.');
    }
  }

  // ── /tekken ────────────────────────────────────────────────────────────────
  if (interaction.commandName === 'tekken') {
    const rawId   = interaction.options.getString('id');
    const mention = interaction.options.getUser('player');
    let polarisId = rawId;

    if (mention) {
      const registry = loadRegistry();
      const entry = registry[mention.id];
      if (!entry) return interaction.reply({ content: `⚠️ ${mention.username} has not registered yet.`, flags: 64 });
      polarisId = entry.polarisId;
    }

    if (!polarisId) return interaction.reply({ content: '⚠️ Please provide an ID or mention a registered player.', flags: 64 });

    await interaction.deferReply();
    try {
      const battles = await fetchEwgfBattles(polarisId);
      const stats = analyseBattles(battles, polarisId);
      if (!stats) return interaction.editReply('⚠️ No battle data found for this player.');
      await interaction.editReply({ embeds: [buildTekkenEmbed(stats, polarisId)] });
    } catch (err) {
      console.error(err);
      await interaction.editReply(ewgfError(err, polarisId));
    }
  }

  // ── /search ────────────────────────────────────────────────────────────────
  if (interaction.commandName === 'search') {
    const query = interaction.options.getString('name');
    await interaction.deferReply();
    try {
      const results = await searchWavuPlayers(query);
      if (results.length === 0) {
        return interaction.editReply(`No players found for "${query}".`);
      }
      const lines = results.map((r, i) => `**${i + 1}.** ${r.name} — \`${r.id}\``).join('\n');
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`Search results for "${query}"`)
        .setDescription(lines)
        .setFooter({ text: 'Use /register or /profile with one of these IDs' })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      await interaction.editReply('Something went wrong with the search.');
    }
  }

  // ── /roster ────────────────────────────────────────────────────────────────
  if (interaction.commandName === 'roster') {
    const registry = loadRegistry();
    const entries  = Object.values(registry);
    if (entries.length === 0) return interaction.reply('⚠️ No players registered yet. Use `/register` to add yourself!');

    await interaction.deferReply();
    const results = await Promise.allSettled(entries.map((e) => scrapeWavuProfile(e.polarisId)));

    const lines = results.map((result, i) => {
      const entry = entries[i];
      if (result.status === 'rejected') return `❌ **${entry.name}** — failed to fetch`;
      const profile = result.value;
      const top = profile.ratings[0];
      const ratingStr = top ? ` • ${top.char} μ${top.mu} σ²${top.sigma2}` : '';
      return `**${profile.name}**${ratingStr} • [profile](https://wank.wavu.wiki/player/${entry.polarisId})`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🏆 Tekken Austria Roster')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `${entries.length} registered player(s)  •  wank.wavu.wiki` })
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
      .setDescription('Link your Discord account to your Tekken ID')
      .addStringOption((opt) =>
        opt.setName('id')
          .setDescription('Your Polaris ID — start typing your name to search')
          .setRequired(true)
          .setAutocomplete(true)
      ),

    new SlashCommandBuilder()
      .setName('unregister')
      .setDescription('Unlink your Tekken ID from your Discord account'),

    new SlashCommandBuilder()
      .setName('search')
      .setDescription('Search for a Tekken player by name')
      .addStringOption((opt) =>
        opt.setName('name')
          .setDescription('Player name to search for')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('profile')
      .setDescription('Show glicko2 ratings from wank.wavu.wiki')
      .addStringOption((opt) =>
        opt.setName('id')
          .setDescription('Polaris ID — start typing your name to search')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addUserOption((opt) => opt.setName('player').setDescription('Mention a registered Discord user').setRequired(false)),

    new SlashCommandBuilder()
      .setName('tekken')
      .setDescription('Show last 50 games, win rate and peak rank from ewgf.gg')
      .addStringOption((opt) =>
        opt.setName('id')
          .setDescription('Polaris ID — start typing your name to search')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addUserOption((opt) => opt.setName('player').setDescription('Mention a registered Discord user').setRequired(false)),

    new SlashCommandBuilder()
      .setName('roster')
      .setDescription('Show glicko2 ratings for all registered players'),

  ].map((c) => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  console.log('⏳ Registering slash commands...');
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('✅ Slash commands registered globally.');

  client.login(DISCORD_TOKEN);
}

main().catch(console.error);
