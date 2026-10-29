// Node port of the Consumet Meta API shim — runs inside the Anivexa server (Botkeep).
// Serves the /meta/anilist/* endpoints the reMiruro frontend expects, plus the
// /hls/ (obfuscated) HLS/MP4 proxy. handleShim returns null for non-shim routes so
// the Anivexa router can handle them.

const ANILIST = "https://graphql.anilist.co";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Cache-Control": "no-cache",
};

const STATUS_MAP = {
  FINISHED: "Completed",
  RELEASING: "Ongoing",
  NOT_YET_RELEASED: "Not yet aired",
  CANCELLED: "Cancelled",
  HIATUS: "Hiatus",
};

// Provider order: mkissa/anikoto/animegg first — verified playable from the deployed
// Anivexa (reanime is blocked on datacenter IPs and sits later as a fallback).
const PROVIDERS = [
  "mkissa",
  "anikoto",
  "animegg",
  "reanime",
  "aniwaves",
  "animenosub",
  "anizone",
  "kaa",
  "animedunya",
  "animeonsen",
  "anipm",
  "kiwi",
];
const ON_DEMAND = new Set(["kiwi"]);
const SLOW_PROVIDERS = new Set(["mkissa", "animenosub", "animeonsen", "animedunya", "animegg", "kiwi"]);
const LEGACY_PROVIDERS = new Set(["gogoanime", "zoro", "default", "vidstreaming", "gogo"]);

// ---- tiny in-memory TTL cache (persists for the Node process lifetime) ----
const CACHE = new Map();
const TTL = { info: 30 * 60 * 1000, providers: 10 * 60 * 1000, episodes: 5 * 60 * 1000, watch: 5 * 60 * 1000 };

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function cached(key, ttl, fn) {
  const hit = CACHE.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;
  const value = fn().catch((err) => { CACHE.delete(key); throw err; });
  CACHE.set(key, { value, expires: now + ttl });
  if (CACHE.size > 1500) for (const [k, v] of CACHE) if (v.expires <= now) CACHE.delete(k);
  return value;
}
function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}
const TIMED_OUT = Symbol("timed-out");

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...extra },
  });
}

function stripHtml(html) {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mapTitle(m) {
  const t = m?.title || {};
  return {
    romaji: t.romaji || null,
    english: t.english || null,
    native: t.native || null,
    userPreferred: t.userPreferred || t.romaji || t.english || null,
  };
}
function coverOf(m) { return m?.coverImage?.extraLarge || m?.coverImage?.large || null; }

function mapMedia(media, { extras = false } = {}) {
  const anime = {
    id: String(media.id),
    malId: media.idMal ? String(media.idMal) : null,
    title: mapTitle(media),
    trailer: media.trailer ? { id: media.trailer.id || null, site: media.trailer.site || null, thumbnail: media.trailer.thumbnail || null, thumbnailHash: null } : null,
    synonyms: media.synonyms || [],
    isLicensed: !!media.isLicensed,
    isAdult: !!media.isAdult,
    countryOfOrigin: media.countryOfOrigin || null,
    image: coverOf(media),
    imageHash: null,
    cover: media.bannerImage || coverOf(media),
    coverHash: null,
    description: media.description ? stripHtml(media.description) : null,
    status: STATUS_MAP[media.status] || media.status,
    releaseDate: media.seasonYear || media.startDate?.year || null,
    totalEpisodes: media.episodes ?? null,
    currentEpisode: media.status === "RELEASING" ? (media.nextAiringEpisode?.episode ? media.nextAiringEpisode.episode - 1 : 0) : media.episodes ?? 0,
    rating: media.averageScore ?? null,
    duration: media.duration ?? null,
    genres: media.genres || [],
    studios: media.studios?.edges?.map((e) => e.node?.name).filter(Boolean) || [],
    subOrDub: "sub",
    season: media.season || null,
    popularity: media.popularity ?? null,
    type: media.format || null,
    startDate: media.startDate || { year: null, month: null, day: null },
    endDate: media.endDate || { year: null, month: null, day: null },
    recommendations: [],
    characters: [],
    tags: [],
    relations: [],
    mappings: [],
    artwork: [],
    episodes: [],
    logo: null,
    tvdbId: null,
    color: media.coverImage?.color || null,
    nextAiringEpisode: media.nextAiringEpisode ? { episode: media.nextAiringEpisode.episode, airingTime: media.nextAiringEpisode.airingAt } : null,
  };
  if (extras) {
    const art = anime.cover || anime.image;
    anime.artwork = art ? Array.from({ length: 4 }, () => ({ img: art, type: "banner", providerId: null })) : [];
    anime.recommendations = (media.recommendations?.edges || []).map((e) => mapCard(e.node?.mediaRecommendation)).filter(Boolean);
    anime.relations = (media.relations?.edges || []).map((e) => mapCard(e.node, e.relationType)).filter(Boolean);
    anime.characters = (media.characters?.edges || []).map((e) => ({ id: e.node?.id, role: e.role || null, name: e.node?.name || null, image: e.node?.image?.large || null })).filter((c) => c.id);
  }
  return anime;
}

function mapCard(node, relationType = null) {
  if (!node) return null;
  return {
    id: String(node.id),
    malId: node.idMal ? String(node.idMal) : null,
    relationType: relationType || null,
    title: mapTitle(node),
    status: STATUS_MAP[node.status] || node.status,
    episodes: node.episodes ?? null,
    image: coverOf(node),
    imageHash: null,
    cover: node.bannerImage || coverOf(node),
    coverHash: null,
    rating: node.averageScore ?? null,
    type: node.format || null,
  };
}

// ---- AniList ----
const MEDIA_FRAGMENT = `
  id idMal isAdult isLicensed countryOfOrigin status season seasonYear format
  episodes duration genres averageScore popularity
  title { romaji english native userPreferred }
  synonyms startDate { year month day } endDate { year month day }
  nextAiringEpisode { airingAt episode }
  description(asHtml: false)
  coverImage { extraLarge large color }
  bannerImage trailer { id site thumbnail }
`;
const EXTRAS_FRAGMENT = `
  studios { edges { node { name } } }
  characters(perPage: 18, sort: [ROLE, RELEVANCE]) { edges { role node { id name { full userPreferred } image { large } } } }
  relations { edges { relationType node { id idMal status format episodes averageScore title { romaji english native userPreferred } coverImage { extraLarge large color } bannerImage } } }
  recommendations { edges { node { mediaRecommendation { id idMal status format episodes averageScore title { romaji english native userPreferred } coverImage { extraLarge large color } bannerImage } } } }
`;

async function anilist(query, variables) {
  const res = await fetch(ANILIST, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA }, body: JSON.stringify({ query, variables }) });
  if (res.ok) {
    const data = await res.json();
    if (!data.errors?.length) return data.data;
  }
  // Cloudflare IPs are often 403/429'd on the public API — fall back to AniList's own
  // website GraphQL (scrape al_token + cookies), which has a different, roomier limit.
  const web = await anilistWeb(query, variables);
  if (web) return web;
  if (res.status === 429) throw new Error("AniList rate limited");
  throw new Error(`AniList HTTP ${res.status}`);
}

// Cache the anilist.co session token so we don't scrape the homepage every request.
let AL_SESSION = null;
async function anilistWeb(query, variables) {
  try {
    if (!AL_SESSION) {
      const home = await fetch("https://anilist.co/", { headers: { "User-Agent": UA, Accept: "text/html" } });
      if (!home.ok) return null;
      const html = await home.text();
      const token = html.match(/window\.al_token\s*=\s*"([^"]+)"/)?.[1];
      const setCookie = typeof home.headers.getSetCookie === "function" ? home.headers.getSetCookie() : [home.headers.get("set-cookie")].filter(Boolean);
      const cookie = setCookie.map((v) => String(v).split(";")[0]).join("; ");
      if (!token || !cookie) return null;
      AL_SESSION = { token, cookie };
    }
    const res = await fetch("https://anilist.co/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": UA,
        Referer: "https://anilist.co/home",
        "x-csrf-token": AL_SESSION.token,
        schema: "default",
        Cookie: AL_SESSION.cookie,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) { AL_SESSION = null; return null; }
    const data = await res.json();
    if (data.errors?.length) { AL_SESSION = null; return null; }
    return data.data;
  } catch {
    return null;
  }
}

function readTags(raw) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) { const t = parsed.map((x) => String(x).trim()).filter(Boolean); return t.length ? t : undefined; }
    if (parsed) return [String(parsed)];
  } catch {}
  const t = raw.split(",").map((x) => x.trim()).filter(Boolean);
  return t.length ? t : undefined;
}
function scoreBound(raw, ignore) { if (raw == null || raw === "") return undefined; const v = Number(raw); return Number.isFinite(v) && v !== ignore ? v : undefined; }

async function anilistPage(sp) {
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const perPage = Math.min(50, parseInt(sp.get("perPage") || "20", 10) || 20);
  let sort = ["TRENDING_DESC"];
  const sortRaw = sp.get("sort");
  if (sortRaw) {
    try { const p = JSON.parse(sortRaw); if (Array.isArray(p) && p.length) sort = p; else if (typeof p === "string" && p) sort = [p]; }
    catch { if (sortRaw) sort = [sortRaw]; }
  }
  let genres = null;
  const genresRaw = sp.get("genres");
  if (genresRaw) {
    try { const p = JSON.parse(genresRaw); if (Array.isArray(p) && p.length) genres = p; } catch { genres = genresRaw.split(",").map((g) => g.trim()).filter(Boolean); }
  }
  const variables = {
    page, perPage,
    search: sp.get("query") || undefined,
    type: "ANIME",
    season: sp.get("season") || undefined,
    seasonYear: sp.get("year") ? Number(sp.get("year")) : undefined,
    format: sp.get("format") || undefined,
    status: sp.get("status") || undefined,
    genre: genres || undefined,
    tags: readTags(sp.get("tag")),
    source: sp.get("source") || undefined,
    country: sp.get("country") || undefined,
    scoreGreater: scoreBound(sp.get("scoreMin"), 0),
    scoreLesser: scoreBound(sp.get("scoreMax"), 100),
    sort,
  };
  const query = `query ($page: Int, $perPage: Int, $search: String, $type: MediaType, $season: MediaSeason, $seasonYear: Int, $format: MediaFormat, $status: MediaStatus, $genre: [String], $tags: [String], $source: MediaSource, $country: CountryCode, $scoreGreater: Int, $scoreLesser: Int, $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total perPage currentPage lastPage hasNextPage }
      media(search: $search, type: $type, season: $season, seasonYear: $seasonYear, format: $format, status: $status, genre_in: $genre, tag_in: $tags, source: $source, countryOfOrigin: $country, averageScore_greater: $scoreGreater, averageScore_lesser: $scoreLesser, sort: $sort, isAdult: false) { ${MEDIA_FRAGMENT} }
    }
  }`;
  const data = await anilist(query, variables);
  const info = data.Page.pageInfo;
  return { currentPage: info.currentPage, hasNextPage: info.hasNextPage, totalPages: info.lastPage || 1, totalResults: info.total, results: data.Page.media.map((m) => mapMedia(m)) };
}

async function anilistInfo(id, extras = true) {
  return cached(`info:${id}:${extras ? 1 : 0}`, TTL.info, async () => {
    const query = `query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FRAGMENT} ${extras ? EXTRAS_FRAGMENT : ""} } }`;
    const data = await anilist(query, { id: Number(id) });
    if (!data.Media) throw new Error("Anime not found");
    return mapMedia(data.Media, { extras });
  });
}

// ---- Anivexa ----
async function anivexa(ANIVEXA, path) {
  const res = await fetch(`${ANIVEXA}${path}`, { headers: { "User-Agent": UA } });
  if (!res.ok) { const err = new Error(`Anivexa HTTP ${res.status} for ${path}`); err.status = res.status; try { const b = await res.json(); if (b?.error) err.message += ": " + b.error; } catch {} throw err; }
  return res.json();
}

function pickEpisodeList(data, provider, audio) {
  const p = data?.[provider];
  const alt = audio === "sub" ? "dub" : "sub";
  const list = p?.episodes?.[audio];
  if (Array.isArray(list) && list.length) return { provider, list, audio, title: p?.meta?.title || null };
  const altList = p?.episodes?.[alt];
  if (Array.isArray(altList) && altList.length) return { provider, list: altList, audio: alt, title: p?.meta?.title || null };
  return null;
}

async function getEpisodes(ANIVEXA, anilistId, audio, preferred = null) {
  const wanted = preferred && PROVIDERS.includes(preferred) ? preferred : null;
  if (wanted) {
    try { const data = await anivexa(ANIVEXA, `/episodes/${wanted}/${anilistId}?map=false`); const hit = pickEpisodeList(data, wanted, audio); if (hit) return hit; } catch {}
  }
  // mkissa first (CORS-open, playable), then anikoto, then race the rest.
  for (const first of ["mkissa", "anikoto", "animegg"]) {
    if (first === wanted) continue;
    try { const data = await anivexa(ANIVEXA, `/episodes/${first}/${anilistId}?map=false`); const hit = pickEpisodeList(data, first, audio); if (hit && hit.audio === audio) return hit; if (hit) return hit; } catch {}
  }
  const rest = PROVIDERS.filter((x) => !["mkissa", "anikoto", "animegg", wanted].includes(x) && !ON_DEMAND.has(x));
  return await new Promise((resolve) => {
    let pending = rest.length;
    let fallback = null;
    if (pending === 0) return resolve({ provider: null, list: [] });
    const settle = () => { pending -= 1; if (pending <= 0) resolve(fallback || { provider: null, list: [] }); };
    for (const provider of rest) {
      anivexa(ANIVEXA, `/episodes/${provider}/${anilistId}?map=false`)
        .then((data) => { const hit = pickEpisodeList(data, provider, audio); if (hit && hit.audio === audio) { resolve(hit); return; } if (hit && !fallback) fallback = hit; })
        .catch(() => {})
        .finally(settle);
    }
  });
}

async function providerRow(ANIVEXA, provider, anilistId) {
  return cached(`prov:${provider}:${anilistId}`, TTL.providers, async () => {
    const data = await anivexa(ANIVEXA, `/episodes/${provider}/${anilistId}?map=false`);
    const p = data?.[provider];
    const sub = Array.isArray(p?.episodes?.sub) ? p.episodes.sub.length : 0;
    const dub = Array.isArray(p?.episodes?.dub) ? p.episodes.dub.length : 0;
    if (!sub && !dub) return null;
    return { name: provider, title: p?.meta?.title || null, sub, dub };
  });
}

async function listProviders(ANIVEXA, anilistId) {
  const core = PROVIDERS.filter((p) => !ON_DEMAND.has(p));
  const rows = await Promise.all(core.map((p) => withTimeout(providerRow(ANIVEXA, p, anilistId), 8000, TIMED_OUT)));
  const results = rows.filter((r) => r && r !== TIMED_OUT);
  return { results, partial: rows.some((r) => r === TIMED_OUT) };
}

const GENERIC_TITLE = /^(episode|ep\.?)\s*\d+$/i;
function mapEpisode(anilistId, provider, audio, ep) {
  const providerTitle = ep.title && !GENERIC_TITLE.test(ep.title.trim()) ? ep.title : null;
  return {
    id: `${provider}-${audio}-anilist${anilistId}-episode-${ep.number}`,
    title: providerTitle || `Episode ${ep.number}`,
    description: stripHtml(ep.description || "") || null,
    number: ep.number,
    image: ep.image || null,
    imageHash: null,
    airDate: ep.airDate || null,
  };
}

// ---- proxy helpers (Uint8Array, no Buffer) ----
const td = new TextDecoder();
function b64ToU8(s) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }

function decryptManifest(text, keyB64) {
  const trimmed = text.trim();
  if (trimmed.startsWith("#EXTM3U")) return { text: trimmed, encrypted: false };
  try {
    const key = b64ToU8(keyB64);
    const payload = b64ToU8(trimmed);
    const out = new Uint8Array(payload.length);
    for (let i = 0; i < payload.length; i++) out[i] = payload[i] ^ key[i % key.length];
    const t = td.decode(out).trim();
    if (t.startsWith("#EXTM3U")) return { text: t, encrypted: true };
  } catch {}
  return null;
}

const FLIX_IMG_XOR_KEY = Uint8Array.from([157, 42, 241, 71, 179, 142, 92, 112, 166, 25, 228, 59, 216, 98, 15, 197]);
function isImageWrapped(b) {
  const isWebp = b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  const isPng = b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
  return { isWebp, isPng };
}
function unwrapSegment(body) {
  const b = new Uint8Array(body);
  const { isWebp, isPng } = isImageWrapped(b);
  let offset = 0, needsXor = false;
  if (isWebp) { offset = 12; needsXor = b[offset] !== 0x47; }
  else if (isPng) { offset = 8; needsXor = b[offset] !== 0x47; }
  if (!offset) return { body: b, unwrapped: false };
  const out = new Uint8Array(b.subarray(offset));
  if (needsXor) for (let i = 0; i < out.length; i++) out[i] ^= FLIX_IMG_XOR_KEY[i % FLIX_IMG_XOR_KEY.length];
  return { body: out, unwrapped: true };
}
function isMpegTs(buf) { return buf.length > 188 && buf[0] === 0x47 && buf[188] === 0x47; }

// ---- stream-URL obfuscation (miruro-style): XOR with a key, then base64url ----
const OBF_KEY_HEX = "b7d2f04a9c1e3f7856a2d9e4c8b31f6a";
const OBF_KEY = Uint8Array.from(OBF_KEY_HEX.match(/.{2}/g).map((h) => parseInt(h, 16)));
function obfEncode(str) {
  const b = new TextEncoder().encode(str);
  for (let i = 0; i < b.length; i++) b[i] ^= OBF_KEY[i % OBF_KEY.length];
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function obfDecode(e) {
  try {
    const bin = atob(e.replace(/-/g, "+").replace(/_/g, "/"));
    const b = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    for (let i = 0; i < b.length; i++) b[i] ^= OBF_KEY[i % OBF_KEY.length];
    return new TextDecoder().decode(b);
  } catch {
    return "";
  }
}
function proxyToken(url, key, referer) {
  return obfEncode(JSON.stringify({ u: url, r: referer || "", k: key || "" }));
}
function parseProxyToken(token) {
  try {
    const j = JSON.parse(obfDecode(token));
    return { url: j?.u || "", referer: j?.r || "", key: j?.k || "" };
  } catch {
    return { url: "", referer: "", key: "" };
  }
}

function proxyHref(proxyBase, url, key, referer) {
  return `${proxyBase}/hls/${proxyToken(url, key, referer)}/pl.m3u8`;
}

async function fetchPlaylist(proxyBase, url, key, referer) {
  let ref = referer, origin = null;
  const host = (() => { try { return new URL(url).host; } catch { return ""; } })();
  const defaultRef = { flixcloud: "https://flixcloud.cc/", krussdomi: "https://krussdomi.com/", settlar: "https://embed.settlar.io/", nexabloom: "https://megaplay.buzz/" };
  if (!ref) for (const [k, v] of Object.entries(defaultRef)) if (host.includes(k)) { ref = v; origin = new URL(v).origin; break; }
  if (ref && !origin) { try { origin = new URL(ref).origin; } catch {} }
  const headers = { "User-Agent": UA, Accept: "*/*" };
  if (ref) headers["Referer"] = ref;
  if (origin) headers["Origin"] = origin;
  const resp = await fetch(url, { headers, redirect: "follow" });
  if (!resp.ok) return new Response(`upstream ${resp.status}`, { status: resp.status, headers: { ...CORS, "Content-Type": "text/plain" } });
  const buf = new Uint8Array(await resp.arrayBuffer());
  const contentType = resp.headers.get("content-type") || "";
  if (isMpegTs(buf)) return new Response(buf, { status: 200, headers: { ...CORS, "Content-Type": "video/mp2t", "Content-Length": buf.length } });
  const wrapped = isImageWrapped(buf);
  if (wrapped.isWebp || wrapped.isPng) { const u = unwrapSegment(buf).body; return new Response(u, { status: 200, headers: { ...CORS, "Content-Type": "video/mp2t", "Content-Length": u.length } }); }
  const head = td.decode(buf.subarray(0, 64)).trim().toLowerCase();
  if (contentType.includes("text/html") || head.startsWith("<!doctype") || head.startsWith("<html")) return new Response("upstream returned HTML (likely blocked)", { status: 502, headers: { ...CORS, "Content-Type": "text/plain" } });

  const text = td.decode(buf);
  let manifest = text.trim().startsWith("#EXTM3U") ? { text: text.trim(), encrypted: false } : null;
  if (!manifest && key) manifest = decryptManifest(text, key);
  if (!manifest && (contentType.includes("dash") || /<MPD[\s>]/.test(text) || /\.mpd(\?|$)/i.test(url))) {
    return new Response(text.replace(/https?:\/\/[^"'<\s]+/g, (abs) => proxyHref(proxyBase, abs, key, ref)), { status: 200, headers: { ...CORS, "Content-Type": "application/dash+xml" } });
  }
  if (manifest) {
    const base = url;
    const out = manifest.text.split(/\r?\n/).map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (!t.startsWith("#")) { try { return proxyHref(proxyBase, new URL(t, base).toString(), key, ref); } catch { return line; } }
      return line.replace(/URI="([^"]+)"/g, (m, uri) => { try { return `URI="${proxyHref(proxyBase, new URL(uri, base).toString(), key, ref)}"`; } catch { return m; } });
    });
    // Prefetch the first child variant so the player's next request is already warm.
    const child = out.find((l) => l && !l.trim().startsWith("#") && l.includes("/hls/"));
    if (child) {
      try {
        const childMatch = new URL(child, proxyBase).pathname.match(/^\/hls\/([^/]+)\//);
        if (childMatch) {
          const c = parseProxyToken(childMatch[1]);
          if (c.url && c.url !== url) fetchPlaylist(proxyBase, c.url, c.key, c.referer).catch(() => {});
        }
      } catch {}
    }
    return new Response(out.join("\n"), { status: 200, headers: { ...CORS, "Content-Type": "application/vnd.apple.mpegurl" } });
  }
  return new Response(buf, { status: 200, headers: { ...CORS, "Content-Type": contentType || "application/octet-stream", "Content-Length": buf.length } });
}

// Stream an MP4 upstream through the proxy with byte-range support, so the browser
// can seek (and start) properly. Forwards the request's Range header upstream and
// passes the 206/Content-Range straight back without buffering the whole file.
async function fetchMp4(url, referer, range) {
  const headers = { "User-Agent": UA, Accept: "*/*" };
  if (referer) headers["Referer"] = referer;
  if (range) headers["Range"] = range;
  const resp = await fetch(url, { headers, redirect: "follow" });
  const hdrs = { ...CORS, "Accept-Ranges": "bytes", "Content-Type": "video/mp4" };
  for (const h of ["Content-Range", "Content-Length", "Content-Type"]) {
    const v = resp.headers.get(h);
    if (v) hdrs[h] = v;
  }
  return new Response(resp.body, { status: resp.status, headers: hdrs });
}

function collectSources(data, p, proxyBase) {
  let raw = Array.isArray(data?.streams) ? data.streams : [];
  if (!raw.length && Array.isArray(data?.sources)) raw = data.sources.map((s) => ({ url: s.extractedUrl || s.url, type: s.extractedType || s.type, server: s.name || s.server, referer: s.referer || s.headers?.Referer, headers: s.headers, key: s.key || s.playlist_key, playlist_key: s.playlist_key }));
  if (!raw.length && data?.stream_url) raw = [{ url: data.stream_url, type: "hls", key: data.playlist_key || data.key || null }];
  const topHeaders = data?.headers || {};
  const sources = [], embeds = [];
  for (const s of raw) {
    if (!s?.url) continue;
    const looksMedia = /\.(m3u8|mpd|mp4)(\?|$)/i.test(s.url);
    if (s.type === "embed" && !looksMedia) { embeds.push(s.url); continue; }
    const ref = s.referer || s.headers?.Referer || topHeaders.Referer || topHeaders.Referrer || null;
    const key = s.key || s.playlist_key || null;
    const isHls = s.type === "hls" || /\.m3u8(\?|$)/i.test(s.url);
    const isDash = s.type === "dash" || /\.mpd(\?|$)/i.test(s.url);
    const isMp4 = s.type === "mp4" || /\.mp4(\?|$)/i.test(s.url);
    const proxied = isMp4 && !isHls
      ? `${proxyBase}/hls/${proxyToken(s.url, key, ref)}/file.mp4`
      : proxyHref(proxyBase, s.url, key, ref);
    sources.push({ url: proxied, quality: sources.length === 0 ? "default" : "backup", isM3U8: isHls && !isMp4, isDASH: isDash, isMP4: isMp4 && !isHls, provider: p });
  }
  if (!sources.length) for (const url of embeds) sources.push({ url, quality: sources.length === 0 ? "default" : "backup", isM3U8: false, isEmbed: true, provider: p });
  return { sources, download: data?.download || data?.stream_url || "", subtitles: data?.subtitles || [] };
}

async function attemptWatch(ANIVEXA, p, anilistId, audio, ep, proxyBase, limit) {
  const budget = limit || (SLOW_PROVIDERS.has(p) ? 14000 : 11000);
  const data = await withTimeout(anivexa(ANIVEXA, `/watch/${p}/${anilistId}/${audio}/${p}-${ep}`), budget, null);
  if (!data) throw new Error(`${p} timed out`);
  const built = collectSources(data, p, proxyBase);
  if (!built.sources.length) throw new Error(`${p} has no playable streams`);
  return built;
}

// First provider to return a playable stream wins. Candidates start a few hundred ms
// apart rather than waiting on one slow upstream, which is what used to turn a single
// slow scraper into a hard 404 for the viewer.
function raceWatch(ANIVEXA, providers, anilistId, audio, ep, proxyBase, limit) {
  return new Promise((resolve, reject) => {
    if (!providers.length) return reject(new Error("no providers"));
    let pending = providers.length;
    let settled = false;
    let lastErr = null;
    providers.forEach((p, i) => {
      setTimeout(() => {
        attemptWatch(ANIVEXA, p, anilistId, audio, ep, proxyBase, limit)
          .then((value) => {
            if (settled) return;
            settled = true;
            resolve(value);
          })
          .catch((err) => {
            lastErr = err;
            pending -= 1;
            if (pending === 0 && !settled) {
              settled = true;
              reject(lastErr || new Error("all providers failed"));
            }
          });
      }, i === 0 ? 0 : 150 + i * 250);
    });
  });
}

// Requested server first (what the viewer picked), then the ones that actually resolve
// from a datacenter IP, then the long tail.
const WATCH_ORDER = ["anikoto", "mkissa", "animegg", "reanime", "aniwaves", "animenosub", "anizone", "kaa", "animedunya", "animeonsen", "anipm"];

// Resolves an episode id to a playable source list. Returns plain JSON — never a
// Response — so callers can build a fresh Response per request.
async function handleWatch(ANIVEXA, episodeId, proxyBase) {
  const m = episodeId.match(/^(.+?)-(sub|dub)-anilist(\d+)-episode-(\d+)$/);
  if (!m) throw Object.assign(new Error("Invalid episode id"), { status: 400 });
  const [, provider, audio, anilistId, ep] = m;
  const epKey = `${anilistId}:${audio}:${ep}`;

  // A provider that already answered for this episode is the fastest and most reliable bet.
  const best = CACHE.get(`best:${epKey}`);
  const knownGood = best && best.expires > Date.now() ? best.value : null;

  const order = [];
  const push = (p) => {
    if (p && PROVIDERS.includes(p) && !ON_DEMAND.has(p) && !order.includes(p)) order.push(p);
  };
  push(provider);
  push(knownGood);
  WATCH_ORDER.forEach(push);

  let built;
  try {
    built = await raceWatch(ANIVEXA, order.slice(0, 3), anilistId, audio, ep, proxyBase);
  } catch {
    // Scrapers flake constantly — a second wave with the next providers and a longer
    // budget turns most transient misses into a success.
    built = await raceWatch(ANIVEXA, order.slice(3, 6).concat(order.slice(0, 2)), anilistId, audio, ep, proxyBase, 20000);
  }

  const winner = built?.sources?.[0]?.provider || provider;
  CACHE.set(`best:${epKey}`, { value: winner, expires: Date.now() + 30 * 60 * 1000 });
  return built;
}

// ---- entrypoint ----
export async function handleShim(request, env) {
  const u = new URL(request.url);
  const path = u.pathname;
  const ANIVEXA = env.ANIVEXA_URL || u.origin;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const proxyBase = env.PUBLIC_URL || u.origin;

      // Generic AniList GraphQL passthrough — the browser never talks to AniList
      // directly, so the per-IP rate limit (which blanks out homepage rails) is
      // avoided; the Worker caches + falls back to AniList's web endpoint.
      if (path === "/anilist" && request.method === "POST") {
        let body;
        try { body = await request.json(); } catch { return json({ error: "invalid body" }, 400); }
        if (!body?.query) return json({ error: "missing query" }, 400);
        const cacheKey = "al:" + hashString(JSON.stringify({ q: body.query, v: body.variables || {} }));
        const hit = CACHE.get(cacheKey);
        if (hit && hit.expires > Date.now()) return json(await hit.value);
        const value = anilist(body.query, body.variables || {}).catch((e) => { CACHE.delete(cacheKey); throw e; });
        CACHE.set(cacheKey, { value, expires: Date.now() + 5 * 60 * 1000 });
        try {
          return json(await value);
        } catch (e) {
          return json({ error: e?.message || String(e) }, 502);
        }
      }

      let hlsMatch;
      if ((hlsMatch = path.match(/^\/hls\/([^/]+)\/(pl\.m3u8|file\.mp4)/))) {
        const { url, referer, key } = parseProxyToken(hlsMatch[1]);
        if (!url) return json({ error: "bad token" }, 400);
        if (hlsMatch[2] === "file.mp4") {
          return await fetchMp4(url, referer, request.headers.get("Range"));
        }
        return await fetchPlaylist(ctx, proxyBase, url, key, referer);
      }

      if (path === "/meta/anilist/advanced-search") return json(await anilistPage(u.searchParams));
      if (path === "/meta/anilist/trending") { const sp = new URLSearchParams(u.searchParams); sp.set("sort", JSON.stringify(["TRENDING_DESC"])); return json(await anilistPage(sp)); }
      if (path === "/meta/anilist/recent-episodes") { const sp = new URLSearchParams(u.searchParams); sp.set("sort", JSON.stringify(["UPDATED_AT_DESC"])); sp.set("status", "RELEASING"); return json(await anilistPage(sp)); }

      let m;
      if ((m = path.match(/^\/meta\/anilist\/data\/(\d+)\/?$/))) return json(await anilistInfo(m[1], true));
      if ((m = path.match(/^\/meta\/anilist\/info\/(\d+)\/?$/))) return json(await anilistInfo(m[1], true));

      if ((m = path.match(/^\/meta\/anilist\/episodes\/(\d+)\/?$/))) {
        const anilistId = m[1];
        const audio = u.searchParams.get("dub") === "true" ? "dub" : "sub";
        const requested = u.searchParams.get("provider");
        const preferred = requested && !LEGACY_PROVIDERS.has(requested) ? requested : null;
        const key = `eps:${anilistId}:${preferred || "*"}:${audio}`;
        const hit = CACHE.get(key);
        if (hit && hit.expires > Date.now()) return json(await hit.value);
        const { provider, list, audio: actualAudio } = await getEpisodes(ANIVEXA, anilistId, audio, preferred);
        const episodes = list.map((ep) => mapEpisode(anilistId, provider, actualAudio || audio, ep));
        CACHE.set(key, { value: Promise.resolve(episodes), expires: Date.now() + TTL.episodes });
        return json(episodes);
      }

      if ((m = path.match(/^\/meta\/anilist\/providers\/(\d+)\/?$/))) return json(await listProviders(ANIVEXA, m[1]));

      if ((m = path.match(/^\/meta\/anilist\/watch\/(.+)$/))) {
        const episodeId = decodeURIComponent(m[1]);
        const parsed = episodeId.match(/^(.+?)-(sub|dub)-anilist(\d+)-episode-(\d+)$/);
        if (!parsed) return json({ error: "Invalid episode id" }, 400);
        const [, , audio, anilistId, ep] = parsed;
        // Cache the JSON payload, keyed by episode only (not by the provider the caller
        // asked for) — a Response body can be read once, so caching Responses returned
        // HTTP 500 on every hit inside the TTL.
        const key = `watch:${anilistId}:${audio}:${ep}`;
        const hit = CACHE.get(key);
        if (hit && hit.expires > Date.now()) {
          try {
            return json(await hit.value);
          } catch {
            CACHE.delete(key);
          }
        }
        const value = handleWatch(ANIVEXA, episodeId, proxyBase).catch((err) => {
          CACHE.delete(key); // never cache a failure
          throw err;
        });
        CACHE.set(key, { value, expires: Date.now() + TTL.watch });
        try {
          return json(await value);
        } catch (err) {
          return json({ error: "No working stream: " + (err?.message || "unknown") }, err?.status || 404);
        }
      }

      if ((m = path.match(/^\/meta\/anilist\/servers\/(.+)$/))) {
        const episodeId = decodeURIComponent(m[1]);
        const parsed = episodeId.match(/^(.+?)-(sub|dub)-anilist(\d+)-episode-(\d+)$/);
        if (!parsed) return json([]);
        const [, , audio, anilistId, ep] = parsed;
        const { results } = await listProviders(ANIVEXA, anilistId);
        return json(results.map((row) => ({ name: row.name, url: `${row.name}-${audio}-anilist${anilistId}-episode-${ep}` })));
      }

      return null; // not a shim route — let the Anivexa router handle it
    } catch (err) {
      return json({ error: err?.message || String(err) }, 500);
    }
}
