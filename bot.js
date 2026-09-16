require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require('discord.js');
const zlib = require('zlib');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── Global error handlers to prevent crashes ────────────────────────────────
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err?.message ?? err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err?.message ?? err);
});

// ─── Dummy web server to keep Render's health check happy ────────────────────
http.createServer((req, res) => res.end('OK')).listen(process.env.PORT || 3000);

// ─── Keep Render free-tier instance awake (spins down after 15 min of no external traffic) ──
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://tekkenaustriabot.onrender.com';
setInterval(() => {
  https.get(RENDER_URL, (res) => res.resume()).on('error', () => {});
}, 10 * 60 * 1000); // every 10 minutes — safely under Render's 15-minute idle timeout

// ─── Config ───────────────────────────────────────────────────────────────────
const DISCORD_TOKEN  = process.env.DISCORD_TOKEN;
const CLIENT_ID      = process.env.DISCORD_CLIENT_ID;
const GUILD_ID       = process.env.GUILD_ID ?? '1242957519723303033';
const EWGF_API_KEY   = process.env.EWGF_API_KEY;
const EWGF_HOST      = 'api.ewgf.gg';
const WAVU_HOST      = 'wank.wavu.wiki';

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

// ─── Character HUD icon URLs (tekkenwarehouse.com) ────────────────────────────
const CHAR_ICON = {
  'Alisa':       'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_mnt.png',
  'Anna':        'https://tekkenwarehouse.com/wp-content/uploads/2024/03/HUD_CH_ICON_L_ANN.png',
  'Armor King':  'https://tekkenwarehouse.com/wp-content/uploads/2024/03/HUD_CH_ICON_L_AKI.png',
  'Asuka':       'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_der.png',
  'Azucena':     'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_cat.png',
  'Bryan':       'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_cht.png',
  'Claudio':     'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_ctr.png',
  'Clive':       'https://tekkenwarehouse.com/wp-content/uploads/2024/12/T_UI_HUD_Character_Icon_L_okm.png',
  'Devil Jin':   'https://tekkenwarehouse.com/wp-content/uploads/2024/02/T_UI_HUD_Character_Icon_L_swl4.png',
  'Dragunov':    'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_kmd.png',
  'Eddy':        'https://tekkenwarehouse.com/wp-content/uploads/2024/03/HUD_CH_ICON_L_EDD.png',
  'Fahkumram':   'https://tekkenwarehouse.com/wp-content/uploads/2024/03/HUD_CH_ICON_L_NSC.png',
  'Feng':        'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_klw.png',
  'Heihachi':    'https://tekkenwarehouse.com/wp-content/uploads/2024/03/HUD_CH_ICON_L_HEI.png',
  'Hwoarang':    'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_snk.png',
  'Jack-8':      'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_ccn.png',
  'Jin':         'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_ant.png',
  'Jun':         'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_aml.png',
  'Kazuya':      'https://tekkenwarehouse.com/wp-content/uploads/2024/02/T_UI_HUD_Character_Icon_L_grl.png',
  'King':        'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_pgn.png',
  'Kuma':        'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_rbt.png',
  'Lars':        'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_lzd.png',
  'Law':         'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_pig.png',
  'Lee':         'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_wlf.png',
  'Leo':         'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_ghp.png',
  'Leroy':       'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_jly.png',
  'Lidia':       'https://tekkenwarehouse.com/wp-content/uploads/2024/03/HUD_CH_ICON_L_NSD.png',
  'Lili':        'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_hms.png',
  'Nina':        'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_kal.png',
  'Panda':       'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_ttr.png',
  'Paul':        'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_grf.png',
  'Raven':       'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_bbn.png',
  'Reina':       'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_zbr.png',
  'Shaheen':     'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_hrs.png',
  'Steve':       'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_bsn.png',
  'Victor':      'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_lon.png',
  'Xiaoyu':      'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_rat.png',
  'Yoshimitsu':  'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_cml.png',
  'Zafina':      'https://tekkenwarehouse.com/wp-content/uploads/2024/10/T_UI_HUD_Character_Icon_L_crw.png',
};

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

// ─── Player Registry via Supabase ────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://tpfmddydiculltvwkkqk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function supabaseRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'resolution=merge-duplicates,return=representation' : 'return=representation',
      },
    };
    if (body) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: res.statusCode, data: JSON.parse(text) }); }
        catch (e) { resolve({ status: res.statusCode, data: text }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function loadRegistry() {
  const { status, data } = await supabaseRequest('GET', '/rest/v1/registry?select=*');
  if (status !== 200) { console.error('Supabase load failed:', status, data); return {}; }
  const registry = {};
  for (const row of data) {
    registry[row.discord_id] = {
      polarisId: row.polaris_id,
      name: row.name,
      discordName: row.discord_name,
    };
  }
  return registry;
}

// Upsert a single player
async function upsertPlayer(discordId, entry) {
  const { status, data } = await supabaseRequest('POST', '/rest/v1/registry?on_conflict=discord_id', {
    discord_id: discordId,
    polaris_id: entry.polarisId,
    name: entry.name,
    discord_name: entry.discordName,
  });
  if (status !== 200 && status !== 201) console.error('Supabase upsert failed:', status, data);
}

// Delete a single player
async function deletePlayer(discordId) {
  const { status, data } = await supabaseRequest('DELETE', `/rest/v1/registry?discord_id=eq.${discordId}`);
  if (status !== 200 && status !== 204) console.error('Supabase delete failed:', status, data);
}

async function updateRegistry(fn) {
  const registry = await loadRegistry();
  const before = JSON.parse(JSON.stringify(registry)); // deep copy
  fn(registry);

  // Find added/updated entries
  for (const [discordId, entry] of Object.entries(registry)) {
    if (JSON.stringify(before[discordId]) !== JSON.stringify(entry)) {
      await upsertPlayer(discordId, entry);
    }
  }

  // Find deleted entries
  for (const discordId of Object.keys(before)) {
    if (!registry[discordId]) {
      await deletePlayer(discordId);
    }
  }

  return registry;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function httpGet(hostname, urlPath, headers = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path: urlPath,
      method: 'GET',
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      // Follow redirects
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location && maxRedirects > 0) {
        const loc = new URL(res.headers.location, `https://${hostname}`);
        res.resume();
        return httpGet(loc.hostname, loc.pathname + loc.search, headers, maxRedirects - 1)
          .then(resolve).catch(reject);
      }

      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const encoding = res.headers['content-encoding'];
        const decompress =
          encoding === 'br' ? (b) => new Promise((r, x) => zlib.brotliDecompress(b, (e, d) => e ? x(e) : r(d))) :
          encoding === 'gzip' ? (b) => new Promise((r, x) => zlib.gunzip(b, (e, d) => e ? x(e) : r(d))) :
          encoding === 'deflate' ? (b) => new Promise((r, x) => zlib.inflate(b, (e, d) => e ? x(e) : r(d))) :
          (b) => Promise.resolve(b);

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

  // If we can't even parse a player name, this almost certainly isn't a real
  // profile page (bot-block/challenge page, unexpected redirect, etc.) rather
  // than a real player with zero ranked games — treat it as a hard failure so
  // it surfaces as "Failed to fetch" instead of silently showing as "no ratings".
  if (!result.name) {
    const snippet = html.replace(/\s+/g, ' ').trim().slice(0, 500);
    console.error(`[wavu debug] Unparseable response for ${polarisId} (length ${html.length}):\n${snippet}`);
    throw new Error(`Could not parse player name for ${polarisId} — response may be a block/challenge page, not a real profile (length ${html.length})`);
  }

  // Region
  const regionMatch = html.match(/<span class="region">\s*<a[^>]*>\s*(.*?)\s*<\/a>/);
  if (regionMatch) result.region = regionMatch[1].trim();

  // Ratings — split by <div class="rating"
  const ratingParts = html.split('<div class="rating"');
  for (let i = 1; i < ratingParts.length; i++) {
    const block = ratingParts[i];
    const char     = (block.match(/<div class="char">(.*?)<\/div>/) || [])[1]?.trim();
    const mu       = (block.match(/<div class="mu">μ\s*(\d+)<\/div>/) || [])[1];
    const sigma2   = (block.match(/σ²\s*(\d+)/) || [])[1];
    const games    = (block.match(/<div class="games">([\d,]+)\s*games/) || [])[1]?.replace(/,/g, '');
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

// Splits lines into multiple embed fields when they would exceed Discord's 1024-char field limit
function chunkField(lines, fieldName) {
  const MAX = 1024;
  const fields = [];
  let current = '';
  for (const line of lines) {
    const next = current ? current + '\n' + line : line;
    if (next.length > MAX) {
      fields.push({ name: fields.length === 0 ? fieldName : '​', value: current, inline: false });
      current = line;
    } else {
      current = next;
    }
  }
  if (current) fields.push({ name: fields.length === 0 ? fieldName : '​', value: current, inline: false });
  return fields;
}

function buildProfileEmbed(profile, polarisId) {
  const ratingLines = profile.ratings.map((r) => {
    const muStr    = `μ${r.mu}`;
    const sigmaStr = r.sigma2 != null ? ` σ²${r.sigma2}` : '';
    const gamesStr = r.games != null ? ` • ${r.games.toLocaleString()}g` : '';
    const dateStr  = r.lastSeen ? ` • ${r.lastSeen}` : '';
    return `${charEmoji(r.char)} \`${r.char.padEnd(14)}\` ${muStr}${sigmaStr}${gamesStr}${dateStr}`;
  });

  const fields = ratingLines.length
    ? chunkField(ratingLines, '🏅 Glicko2 Ratings')
    : [{ name: '🏅 Glicko2 Ratings', value: 'No rated characters found.', inline: false }];

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📊 ${profile.name}`)
    .setURL(`https://wank.wavu.wiki/player/${polarisId}`)
    .setDescription(`**ID:** \`${polarisId}\`  •  **Region:** ${profile.region ?? 'Unknown'}`)
    .addFields(...fields)
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
  const { body, status } = await httpGet(
    'docs.google.com',
    '/spreadsheets/d/e/2PACX-1vR77w4dnZu984fm3COEVVExbBmvvisGmOQnJJcIFe7ec4CYo03RbMi1e1WI_vYVMjgfG8EdcwLm4BJp/pub?output=csv'
  );
  if (status !== 200) {
    console.error('Sheets fetch failed:', status);
    return [];
  }
  return parseCSV(body);
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
      await updateRegistry(r => { r[interaction.user.id] = { polarisId, name: profile.name, discordName: interaction.user.username }; });
      await interaction.editReply(`✅ Registered! You are linked to **${profile.name}** (\`${polarisId}\`).`);
    } catch (err) {
      console.error(err);
      if (err.status === 404) return interaction.editReply(`❌ Player \`${polarisId}\` not found.`);
      await interaction.editReply('❌ Something went wrong.');
    }
  }

  // ── /unregister ────────────────────────────────────────────────────────────
  if (interaction.commandName === 'unregister') {
    await interaction.deferReply({ flags: 64 });
    let wasRegistered = false;
    await updateRegistry(r => {
      if (r[interaction.user.id]) { wasRegistered = true; delete r[interaction.user.id]; }
    });
    await interaction.editReply(wasRegistered
      ? '✅ Your Tekken ID has been unlinked.'
      : '⚠️ You have no registered Tekken ID.');
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
      await updateRegistry(r => { r[targetUser.id] = { polarisId, name: profile.name, discordName: targetUser.username }; });
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
    await interaction.deferReply({ flags: 64 });
    let removedName = null;
    await updateRegistry(r => {
      if (r[targetUser.id]) { removedName = r[targetUser.id].name; delete r[targetUser.id]; }
    });
    await interaction.editReply(removedName
      ? `✅ Unregistered **${targetUser.username}** (was linked to **${removedName}**).`
      : `⚠️ **${targetUser.username}** has no registered Tekken ID.`);
  }

  // ── /profile ───────────────────────────────────────────────────────────────
  if (interaction.commandName === 'profile') {
    const rawId   = interaction.options.getString('id');
    const mention = interaction.options.getUser('player');
    let polarisId = rawId;

    if (!polarisId && !mention) return interaction.reply({ content: '⚠️ Please provide an ID or mention a registered player.', flags: 64 });

    await interaction.deferReply();

    if (mention) {
      const registry = await loadRegistry();
      const entry = registry[mention.id];
      if (!entry) return interaction.editReply(`⚠️ ${mention.username} has not registered yet.`);
      polarisId = entry.polarisId;
    }
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

    if (!polarisId && !mention) return interaction.reply({ content: '⚠️ Please provide an ID or mention a registered player.', flags: 64 });

    await interaction.deferReply();

    if (mention) {
      const registry = await loadRegistry();
      const entry = registry[mention.id];
      if (!entry) return interaction.editReply(`⚠️ ${mention.username} has not registered yet.`);
      polarisId = entry.polarisId;
    }
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
  // ── /powerranking (AT) ─────────────────────────────────────────────────────
  if (interaction.commandName === 'powerranking') {
    const mention = interaction.options.getUser('player');
    await interaction.deferReply();
    try {
      const players = await fetchPowerrankingAT();
      if (!players.length) return interaction.editReply('⚠️ Konnte das Ranking nicht laden.');

      const medals = ['🥇', '🥈', '🥉'];
      let highlightName = null;
      if (mention) {
        const registry = await loadRegistry();
        const entry = registry[mention.id];
        if (entry) highlightName = entry.name.toLowerCase();
      }

      const lines = players.map((p) => {
        const pos = medals[p.rank - 1] ?? `**${p.rank}.**`;
        const highlight = highlightName && p.name.toLowerCase().includes(highlightName) ? ' 👈' : '';
        return `${pos} **${p.name}** • ${p.score} Pts${highlight}`;
      });

      const chunkSize = 25;
      const chunks = [];
      for (let i = 0; i < lines.length; i += chunkSize) {
        chunks.push(lines.slice(i, i + chunkSize));
      }
      const totalPages = chunks.length;

      function buildPage(page) {
        const embed = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🇦🇹 Powerranking Austria')
          .setDescription(chunks[page].join('\n'))
          .setFooter({ text: `Seite ${page + 1}/${totalPages} • ${players.length} Spieler • braacket.com/league/TekkenAustria` });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('prev')
            .setLabel('◀️ Zurück')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Weiter ▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1),
        );

        return { embeds: [embed], components: [row] };
      }

      let currentPage = 0;

      // If a player is highlighted, jump to their page
      if (highlightName) {
        const idx = lines.findIndex(l => l.includes('👈'));
        if (idx >= 0) currentPage = Math.floor(idx / chunkSize);
      }

      const msg = await interaction.editReply(buildPage(currentPage));

      // Button collector — 5 minutes timeout
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 5 * 60 * 1000,
      });

      collector.on('collect', async (btn) => {
        if (btn.user.id !== interaction.user.id) {
          return btn.reply({ content: '❌ Nur der Aufrufer kann blättern.', ephemeral: true });
        }
        if (btn.customId === 'prev' && currentPage > 0) currentPage--;
        if (btn.customId === 'next' && currentPage < totalPages - 1) currentPage++;
        await btn.update(buildPage(currentPage));
      });

      collector.on('end', () => {
        // Disable buttons after timeout
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('prev').setLabel('◀️ Zurück').setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('next').setLabel('Weiter ▶️').setStyle(ButtonStyle.Secondary).setDisabled(true),
        );
        interaction.editReply({ components: [row] }).catch(() => {});
      });

    } catch (err) {
      console.error('powerrankingat error:', err);
      await interaction.editReply('❌ Fehler beim Laden des Rankings.');
    }
  }

  if (interaction.commandName === 'glicko') {
    const mention = interaction.options.getUser('player');
    await interaction.deferReply();
    try {
    const registry = await loadRegistry();
    const entries  = Object.values(registry);

    if (entries.length === 0) {
      return interaction.editReply('⚠️ No players registered yet. Use `/register` to add yourself!');
    }

    // Fetch profiles sequentially with small delay to avoid rate limiting
    const results = [];
    for (const entry of entries) {
      results.push(await scrapeWavuProfile(entry.polarisId).then(v => ({ status: 'fulfilled', value: v })).catch(r => ({ status: 'rejected', reason: r })));
      await new Promise(r => setTimeout(r, 300)); // 300ms delay between requests
    }

    // Build scored list
    const scored = [];
    const unrated = [];
    for (let i = 0; i < results.length; i++) {
      const entry = entries[i];
      if (results[i].status === 'rejected') {
        console.error(`Failed to fetch wavu profile for ${entry.name} (${entry.polarisId}):`, results[i].reason?.message);
        unrated.push(entry.name);
        continue;
      }
      const profile = results[i].value;
      // Find highest mu across all characters
      const best = profile.ratings.reduce((top, r) => (!top || r.mu > top.mu) ? r : top, null);
      if (!best) {
        console.log(`No ratings found for ${entry.name} (${entry.polarisId})`);
        unrated.push(profile.name || entry.name);
        continue;
      }
      scored.push({
        polarisId: entry.polarisId,
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

    // Add unrated players at bottom
    if (unrated.length > 0) {
      lines.push('');
      lines.push(`*Keine Wertung: ${unrated.join(', ')}*`);
    }

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

    const chunkSize = 8;
    const chunks = [];
    for (let i = 0; i < lines.length; i += chunkSize) {
      chunks.push(lines.slice(i, i + chunkSize));
    }
    const totalPages = chunks.length;

    function buildGlickoPage(page) {
      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 Tekken Austria Glicko2 Ranking')
        .setDescription(chunks[page].join('\n'))
        .setFooter({ text: `Seite ${page + 1}/${totalPages} • ${scored.length} Spieler • wank.wavu.wiki` })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('glicko_prev')
          .setLabel('◀️ Zurück')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('glicko_next')
          .setLabel('Weiter ▶️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === totalPages - 1),
      );

      return { embeds: [embed], components: totalPages > 1 ? [row] : [] };
    }

    let currentPage = 0;
    if (highlightIdx >= 0) currentPage = Math.floor(highlightIdx / chunkSize);

    const msg = await interaction.editReply(buildGlickoPage(currentPage));

    if (totalPages > 1) {
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 5 * 60 * 1000,
      });

      collector.on('collect', async (btn) => {
        if (btn.user.id !== interaction.user.id) {
          return btn.reply({ content: '❌ Nur der Aufrufer kann blättern.', ephemeral: true });
        }
        if (btn.customId === 'glicko_prev' && currentPage > 0) currentPage--;
        if (btn.customId === 'glicko_next' && currentPage < totalPages - 1) currentPage++;
        await btn.update(buildGlickoPage(currentPage));
      });

      collector.on('end', () => {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('glicko_prev').setLabel('◀️ Zurück').setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('glicko_next').setLabel('Weiter ▶️').setStyle(ButtonStyle.Secondary).setDisabled(true),
        );
        interaction.editReply({ components: [row] }).catch(() => {});
      });
    }
    } catch (err) {
      console.error('glicko error:', err);
      await interaction.editReply('❌ Something went wrong building the Glicko2 ranking.').catch(() => {});
    }
  }

  // ── /roster ────────────────────────────────────────────────────────────────
  if (interaction.commandName === 'roster') {
    await interaction.deferReply();
    const registry = await loadRegistry();
    const entries  = Object.values(registry);
    if (entries.length === 0) return interaction.editReply('⚠️ No players registered yet. Use `/register` to add yourself!');
    const results = [];
    for (const entry of entries) {
      results.push(await scrapeWavuProfile(entry.polarisId).then(v => ({ status: 'fulfilled', value: v })).catch(r => ({ status: 'rejected', reason: r })));
      await new Promise(r => setTimeout(r, 300));
    }

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
  if (!DISCORD_TOKEN || !CLIENT_ID || !SUPABASE_KEY) {
    console.error('❌ Missing env vars: DISCORD_TOKEN, DISCORD_CLIENT_ID, SUPABASE_KEY');
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
      .setName('powerranking')
      .setDescription('🇦🇹 Powerranking Austria — Braacket Ranking')
      .addUserOption((opt) =>
        opt.setName('player')
          .setDescription('Spieler hervorheben')
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('glicko')
      .setDescription('Tekken Austria Glicko2 Ranking — ranked by highest glicko2 rating')
      .addUserOption((opt) =>
        opt.setName('player')
          .setDescription('Highlight a specific registered player')
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('roster')
      .setDescription('Show all registered Tekken Austria players'),

  ].map((c) => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  console.log('⏳ Registering slash commands...');
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log('✅ Slash commands registered globally.');

  client.login(DISCORD_TOKEN);

  // Keep Supabase free tier alive (pauses after 1 week of inactivity).
  // Pings immediately on startup too — setInterval alone only fires after the
  // first full interval elapses, so if the process never stayed alive that
  // long (e.g. Render kept restarting it), the ping never actually ran.
  async function pingSupabase() {
    try { await supabaseRequest('GET', '/rest/v1/registry?select=count&limit=1'); }
    catch (e) { console.error('Supabase keep-alive ping failed:', e.message); }
  }
  pingSupabase();
  setInterval(pingSupabase, 24 * 60 * 60 * 1000); // every 1 day
}

main().catch(console.error);
