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
const REGISTRY_FILE  = path.join('/app/data', 'registry.json');

// ─── Character emoji map ─────────────────────────────────────────────────────
const CHAR_EMOJI = {
  'Alisa':       '<:alisa:1447498187811192853>',
  'Anna':        '<:anna:1447498153095073842>',
  'Armor King':  '<:armor_king:1447498130932236289>',
  'Asuka':       '<:asuka:1447498042721701938>',
  'Azucena':     '<:azucena:1447498103879106670>',
  'Bryan':       '<:bryan:1447498017656537109>',
  'Claudio':     '<:claudio:1447497995573661716>',
  'Clive':       '<:clive:1447497960584646736>',
  'Devil Jin':   '<:devil_jin:1447497910194274345>',
  'Dragunov':    '<:dragunov:1447497850177982605>',
  'Eddy':        '<:eddy:1447497819370950810>',
  'Fahkumram':   '<:fahkumram:1447497785392894013>',
  'Feng':        '<:feng:1447497755927773285>',
  'Heihachi':    '<:heihachi:1447497727629070499>',
  'Hwoarang':    '<:hwoarang:1447497679159689388>',
  'Jack-8':      '<:jack8:1447497587145048074>',
  'Jin':         '<:jin:1447497538457309317>',
  'Jun':         '<:jun:1447497505767161968>',
  'Kazuya':      '<:kazuya:1447494422668378172>',
  'King':        '<:king:1447497472459935856>',
  'Kuma':        '<:kuma:1447497423592095804>',
  'Lars':        '<:lars:1447497390922924102>',
  'Law':         '<:law:1447497361298292838>',
  'Lee':         '<:lee:1447497330675810304>',
  'Leo':         '<:leo1:1498649825942569081>',
  'Leroy':       '<:leroy:1447497253848617013>',
  'Lidia':       '<:lidia:1447497223591039020>',
  'Lili':        '<:lili:1447497194549547079>',
  'Miary Zo':    '<:miary_zo:1446100851990204589>',
  'Nina':        '<:nina:1447497160995373177>',
  'Panda':       '<:panda:1447494390804254740>',
  'Paul':        '<:paul:1447483479389638677>',
  'Raven':       '<:raven:1447483438562283641>',
  'Reina':       '<:reina:1447483386003193888>',
  'Shaheen':     '<:shaheen:1447483347033915505>',
  'Steve':       '<:steve:1447483281900568697>',
  'Victor':      '<:victor:1447483138845577287>',
  'Xiaoyu':      '<:xiaoyu:1447483102451597363>',
  'Yoshimitsu':  '<:yoshimitsu:1447483166339240069>',
  'Zafina':      '<:zafina:1447482973636264037>',
};

function charEmoji(char) {
  return CHAR_EMOJI[char] ?? '';
}

// ─── Rank names ───────────────────────────────────────────────────────────────
const RANK_NAMES = [
  'Beginner', '1st Dan', '2nd Dan', 'Fighter', 'Strategist', 'Combatant',
  'Brawler', 'Ranger', 'Cavalry', 'Warrior', 'Assailant', 'Dominator',
  'Vanquisher', 'Destroyer', 'Eliminator', 'Garyu', 'Shinryu', 'Tenryu',
  'Mighty Ruler', 'Flame Ruler', 'Battle Ruler', 'Fujin', 'Raijin', 'Kishin',
  'Bushin', 'Tekken King', 'Tekken Emperor', 'Tekken God',
  'Tekken God Supreme', 'God of Destruction', 'God of Destruction I',
  'God of Destruction II', 'God of Destruction III', 'God of Destruction IV',
  'God of Destruction V', 'God of Destruction VI', 'God of Destruction VII',
  'God of Destruction ∞',
];

const RANK_COLORS = {
  'Beginner': 0x8B4513, '1st Dan': 0xC0C0C0, '2nd Dan': 0xC0C0C0,
  'Fighter': 0x00CED1, 'Strategist': 0x00CED1, 'Combatant': 0x00CED1,
  'Brawler': 0x008000, 'Ranger': 0x008000, 'Cavalry': 0x008000,
  'Warrior': 0xFFD700, 'Assailant': 0xFFD700, 'Dominator': 0xFFD700,
  'Vanquisher': 0xFF8C00, 'Destroyer': 0xFF8C00, 'Eliminator': 0xFF8C00,
  'Garyu': 0xFF0000, 'Shinryu': 0xFF0000, 'Tenryu': 0xFF0000,
  'Mighty Ruler': 0xFF0000, 'Flame Ruler': 0xFF0000, 'Battle Ruler': 0xFF0000,
  'Fujin': 0x00BFFF, 'Raijin': 0x00BFFF, 'Kishin': 0x00BFFF, 'Bushin': 0x00BFFF,
  'Tekken King': 0x9B59B6, 'Tekken Emperor': 0x9B59B6,
  'Tekken God': 0xFFD700, 'Tekken God Supreme': 0xFFD700,
  'God of Destruction': 0xFF4500, 'God of Destruction I': 0xFF4500,
  'God of Destruction II': 0xFF4500, 'God of Destruction III': 0xFF4500,
  'God of Destruction IV': 0xFF4500, 'God of Destruction V': 0xFF4500,
  'God of Destruction VI': 0xFF4500, 'God of Destruction VII': 0xFF4500,
  'God of Destruction ∞': 0xFF4500,
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
function buildProfileEmbed(profile, polarisId, guildId) {
  const topChar = profile.ratings[0];
  const color = RANK_COLORS[topChar?.char] ?? 0x5865F2;

  const ratingLines = profile.ratings.map((r) => {
    const muStr    = `μ${r.mu}`;
    const sigmaStr = r.sigma2 != null ? ` σ²${r.sigma2}` : '';
    const gamesStr = r.games != null ? ` • ${r.games.toLocaleString()}g` : '';
    const dateStr  = r.lastSeen ? ` • ${r.lastSeen}` : '';
    return `${charEmoji(r.char)} \`${r.char.padEnd(14)}\` ${muStr}${sigmaStr}${gamesStr}${dateStr}`;
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
    return `${charEmoji(char)} \`${char.padEnd(14)}\` ${count}g (${pct}%)`;
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


// ─── Fetch Powerranking AT from Google Sheets ────────────────────────────────
async function fetchPowerrankingAT() {
  const sheetId = '11IkWR6ExfcBknpetqL5S3KMlmKPNV_HasIyjQiZipYk';
  const url = `/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'docs.google.com',
      path: url,
      method: 'GET',
      headers: { 'User-Agent': 'TekkenAustriaBot/1.0' },
    };

    const req = https.request(options, (res) => {
      // Handle redirects
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = new URL(res.headers.location);
        const redirectOptions = {
          hostname: redirectUrl.hostname,
          path: redirectUrl.pathname + redirectUrl.search,
          method: 'GET',
          headers: { 'User-Agent': 'TekkenAustriaBot/1.0' },
        };
        const req2 = https.request(redirectOptions, (res2) => {
          const chunks = [];
          res2.on('data', (c) => chunks.push(c));
          res2.on('end', () => {
            const csv = Buffer.concat(chunks).toString('utf8');
            resolve(parseCSV(csv));
          });
        });
        req2.on('error', reject);
        req2.end();
        return;
      }

      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const csv = Buffer.concat(chunks).toString('utf8');
        resolve(parseCSV(csv));
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function parseCSV(csv) {
  const lines = csv.trim().split('\n').slice(1); // skip header
  const players = [];
  for (const line of lines) {
    const parts = line.split(',');
    const rank  = parseInt(parts[0]);
    const name  = parts[1]?.replace(/"/g, '').trim();
    const score = parseInt(parts[2]);
    if (!isNaN(rank) && name && !isNaN(score)) {
      players.push({ rank, name, score });
    }
  }
  return players;
}

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


  // ── /admin-register ────────────────────────────────────────────────────────
  if (interaction.commandName === 'admin-register') {
    if (!interaction.memberPermissions?.has('Administrator')) {
      return interaction.reply({ content: '❌ You need Administrator permissions to use this command.', flags: 64 });
    }
    const targetUser = interaction.options.getUser('user');
    const polarisId  = interaction.options.getString('id');
    await interaction.deferReply({ flags: 64 });
    try {
      const profile = await scrapeWavuProfile(polarisId);
      if (!profile.name) return interaction.editReply(`⚠️ Could not find player \`${polarisId}\` on wank.wavu.wiki.`);
      const registry = loadRegistry();
      registry[targetUser.id] = { polarisId, name: profile.name, discordName: targetUser.username };
      saveRegistry(registry);
      await interaction.editReply(`✅ Registered **${targetUser.username}** as **${profile.name}** (\`${polarisId}\`).`);
    } catch (err) {
      console.error(err);
      if (err.status === 404) return interaction.editReply(`❌ Player \`${polarisId}\` not found.`);
      await interaction.editReply('❌ Something went wrong.');
    }
  }

  // ── /admin-unregister ──────────────────────────────────────────────────────
  if (interaction.commandName === 'admin-unregister') {
    if (!interaction.memberPermissions?.has('Administrator')) {
      return interaction.reply({ content: '❌ You need Administrator permissions to use this command.', flags: 64 });
    }
    const targetUser = interaction.options.getUser('user');
    const registry = loadRegistry();
    if (registry[targetUser.id]) {
      const name = registry[targetUser.id].name;
      delete registry[targetUser.id];
      saveRegistry(registry);
      await interaction.reply({ content: `✅ Unregistered **${targetUser.username}** (was linked to **${name}**).`, flags: 64 });
    } else {
      await interaction.reply({ content: `⚠️ **${targetUser.username}** has no registered Tekken ID.`, flags: 64 });
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
      await interaction.editReply({ embeds: [buildProfileEmbed(profile, polarisId, interaction.guildId)] });
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

  // ── /leaderboard ──────────────────────────────────────────────────────────
  if (interaction.commandName === 'powerranking') {
    const mention = interaction.options.getUser('player');
    const registry = loadRegistry();
    const entries  = Object.values(registry);

    if (entries.length === 0) {
      return interaction.reply('⚠️ No players registered yet. Use `/register` to add yourself!');
    }

    await interaction.deferReply();

    // Fetch all profiles in parallel
    const results = await Promise.allSettled(entries.map((e) => scrapeWavuProfile(e.polarisId)));

    // Build scored list
    const scored = [];
    for (let i = 0; i < results.length; i++) {
      const entry = entries[i];
      if (results[i].status === 'rejected') continue;
      const profile = results[i].value;
      // Find highest mu across all characters
      const best = profile.ratings.reduce((top, r) => (!top || r.mu > top.mu) ? r : top, null);
      if (!best) continue;
      scored.push({
        polarisId: entry.polarisId,
        discordId: Object.keys(registry).find(k => registry[k].polarisId === entry.polarisId),
        name: profile.name,
        char: best.char,
        mu: best.mu,
        sigma2: best.sigma2,
        games: best.games,
      });
    }

    // Sort by highest mu descending
    scored.sort((a, b) => b.mu - a.mu);

    const medals = ['🥇', '🥈', '🥉'];

    // If a player is mentioned, find their rank
    let highlightIdx = -1;
    if (mention) {
      const entry = registry[mention.id];
      if (entry) {
        highlightIdx = scored.findIndex(p => p.polarisId === entry.polarisId);
      }
    }

    const lines = scored.map((p, i) => {
      const pos = medals[i] ?? `**${i + 1}.**`;
      const highlight = i === highlightIdx ? ' 👈' : '';
      return `${pos} ${p.name} • ${charEmoji(p.char)} ${p.char} • μ${p.mu} σ²${p.sigma2}${highlight}`;
    });

    // If mentioned player not found in scored
    if (mention && highlightIdx === -1) {
      const entry = registry[mention.id];
      if (!entry) {
        lines.push(`
⚠️ ${mention.username} is not registered.`);
      } else {
        lines.push(`
⚠️ Could not fetch data for ${mention.username}.`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆 Tekken Austria Leaderboard')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `${scored.length} player(s) ranked  •  Highest glicko2 μ per player  •  wank.wavu.wiki` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
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
      const ratingStr = top ? ` • ${charEmoji(top.char)} ${top.char} μ${top.mu} σ²${top.sigma2}` : '';
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

    new SlashCommandBuilder()
      .setName('admin-register')
      .setDescription('[Admin] Register another player')
      .setDefaultMemberPermissions(8) // Administrator only
      .addUserOption((opt) =>
        opt.setName('user')
          .setDescription('The Discord user to register')
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('id')
          .setDescription('Their Polaris ID — start typing their name to search')
          .setRequired(true)
          .setAutocomplete(true)
      ),

    new SlashCommandBuilder()
      .setName('admin-unregister')
      .setDescription('[Admin] Unregister another player')
      .setDefaultMemberPermissions(8) // Administrator only
      .addUserOption((opt) =>
        opt.setName('user')
          .setDescription('The Discord user to unregister')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('powerrankingat')
      .setDescription('🇦🇹 Powerranking Austria — Braacket Ranking')
      .addUserOption((opt) =>
        opt.setName('player')
          .setDescription('Spieler hervorheben')
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('powerranking')
      .setDescription('Tekken Austria Power Ranking — ranked by highest glicko2 rating')
      .addUserOption((opt) =>
        opt.setName('player')
          .setDescription('Highlight a specific registered player')
          .setRequired(false)
      ),

  ].map((c) => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  console.log('⏳ Registering slash commands...');
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, '1242957519723303033'), { body: commands });
  console.log('✅ Slash commands registered globally.');

  client.login(DISCORD_TOKEN);
}

main().catch(console.error);
