// Anivexa → Consumet Meta API adapter shim
// Exposes the /meta/anilist/* endpoints Miruro expects, backed by:
//   - AniList GraphQL (search / info / browse)
//   - Anivexa API (episodes / watch streams)
//   - /proxy/hls (FlixCloud manifest decrypt + image-wrapped segment unwrap + CORS passthrough)
//
// Usage: node server.mjs   (listens on :3001)

import http from "node:http";
import { wreqFetch } from "../Anivexa-API-main/core/wreq.js";

const PORT = Number(process.env.SERVER_PORT || process.env.SHIM_PORT) || 3001;
const ANIVEXA = process.env.ANIVEXA_URL || "http://localhost:4000";
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

// Provider priority for episode resolution (first with data wins).
// NOTE: "senshi" is intentionally excluded — its embeds point at cdn1.anidap.biz
// playlists that now 404, and the replacement vidcloud flow needs a browser-only
// obfuscated token runtime (s-91.bcdn1.se master.txt?token=…), so streams can't be proxied.
const PROVIDERS = [
  "reanime",
  "aniwaves",
  "anikoto",
  "mkissa",
  "animegg",
  "animenosub",
  "anizone",
  "kaa",
  "animedunya",
  "animeonsen",
  "anipm",
  "kiwi",
];

// Kiwi is AnimePahe. It stays out of the first scan because that host sits behind Cloudflare.
const ON_DEMAND = new Set(["kiwi"]);

const FLAKY_PROVIDERS = new Set(["reanime", "anipm", "kaa", "animenosub", "mkissa"]);
const WREQ_HOSTS = /settlar\.io|krussdomi\.com|nexabloom\.top|anime-dunya\.com/i;
const LEGACY_PROVIDERS = new Set(["gogoanime", "zoro", "default", "vidstreaming", "gogo"]);

// ---- Small in-memory TTL cache (keeps repeat page loads fast) ----
const CACHE = new Map();
const TTL = {
  info: 30 * 60 * 1000,
  providers: 10 * 60 * 1000,
  episodes: 5 * 60 * 1000,
  anizip: 60 * 60 * 1000,
  watch: 90 * 1000,
};
function cached(key, ttl, fn) {
  const hit = CACHE.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;
  const value = fn().catch((err) => {
    CACHE.delete(key);
    throw err;
  });
  CACHE.set(key, { value, expires: now + ttl });
  if (CACHE.size > 2000) {
    for (const [k, v] of CACHE) if (v.expires <= now) CACHE.delete(k);
  }
  return value;
}
function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}
const TIMED_OUT = Symbol("timed-out");
// Like withTimeout but rejects on timeout so callers can tell "slow" from "failed".
function raceTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error(`timeout after ${ms}ms`), { code: "TIMEOUT" })), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// Providers that answered "NEED_CAPTCHA" (mkissa's Turnstile) are skipped for a while so a
// click on an episode doesn't sit through the upstream's ~45s retry loop before falling back.
const BLOCKED_UNTIL = new Map();
const CAPTCHA_BLOCK_MS = 10 * 60 * 1000;
function isBlocked(provider) {
  const until = BLOCKED_UNTIL.get(provider);
  if (!until) return false;
  if (until > Date.now()) return true;
  BLOCKED_UNTIL.delete(provider);
  return false;
}
function noteFailure(provider, err) {
  if (err?.code === "NEED_CAPTCHA") BLOCKED_UNTIL.set(provider, Date.now() + CAPTCHA_BLOCK_MS);
  else if (err?.status >= 500) BLOCKED_UNTIL.set(provider, Date.now() + 3 * 60 * 1000);
}

function json(data, status = 200, extra = {}) {
  const body = JSON.stringify(data);
  return { status, body, headers: { ...CORS, "Content-Type": "application/json", ...extra } };
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

function coverOf(m) {
  return m?.coverImage?.extraLarge || m?.coverImage?.large || null;
}

function mapMedia(media, { extras = false } = {}) {
  const anime = {
    id: String(media.id),
    malId: media.idMal ? String(media.idMal) : null,
    title: mapTitle(media),
    trailer: media.trailer
      ? {
          id: media.trailer.id || null,
          site: media.trailer.site || null,
          thumbnail: media.trailer.thumbnail || null,
          thumbnailHash: null,
        }
      : null,
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
    currentEpisode:
      media.status === "RELEASING"
        ? media.nextAiringEpisode?.episode
          ? media.nextAiringEpisode.episode - 1
          : 0
        : media.episodes ?? 0,
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
    nextAiringEpisode: media.nextAiringEpisode
      ? { episode: media.nextAiringEpisode.episode, airingTime: media.nextAiringEpisode.airingAt }
      : null,
  };

  if (extras) {
    const art = anime.cover || anime.image;
    anime.artwork = art ? Array.from({ length: 4 }, () => ({ img: art, type: "banner", providerId: null })) : [];
    anime.recommendations = (media.recommendations?.edges || [])
      .map((e) => mapCard(e.node?.mediaRecommendation, e.node?.rating ? null : null))
      .filter(Boolean);
    anime.relations = (media.relations?.edges || [])
      .map((e) => mapCard(e.node, e.relationType))
      .filter(Boolean);
    anime.tags = (media.tags || [])
      .filter((t) => t?.name && !t.isMediaSpoiler)
      .sort((a, b) => (b.rank || 0) - (a.rank || 0))
      .slice(0, 12)
      .map((t) => t.name);
    anime.characters = (media.characters?.edges || [])
      .map((e) => ({
        id: e.node?.id,
        role: e.role || null,
        name: e.node?.name || null,
        image: e.node?.image?.large || null,
      }))
      .filter((c) => c.id);
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

// ---- AniList GraphQL ----
const MEDIA_FRAGMENT = `
  id idMal isAdult isLicensed countryOfOrigin status season seasonYear format
  episodes duration genres averageScore popularity
  title { romaji english native userPreferred }
  synonyms
  startDate { year month day }
  endDate { year month day }
  nextAiringEpisode { airingAt episode }
  description(asHtml: false)
  coverImage { extraLarge large color }
  bannerImage
  trailer { id site thumbnail }
`;

const EXTRAS_FRAGMENT = `
  studios { edges { node { name } } }
  tags { name rank isMediaSpoiler }
  characters(perPage: 18, sort: [ROLE, RELEVANCE]) { edges { role node { id name { full userPreferred } image { large } } } }
  relations { edges { relationType node { id idMal status format episodes averageScore title { romaji english native userPreferred } coverImage { extraLarge large color } bannerImage } } }
  recommendations { edges { node { mediaRecommendation { id idMal status format episodes averageScore title { romaji english native userPreferred } coverImage { extraLarge large color } bannerImage } } } }
`;

async function anilist(query, variables) {
  const res = await fetch(ANILIST, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error("AniList: " + data.errors[0].message);
  return data.data;
}

function readTags(raw) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const tags = parsed.map((tag) => String(tag).trim()).filter(Boolean);
      return tags.length ? tags : undefined;
    }
    if (parsed) return [String(parsed)];
  } catch {
    /* single tag or comma list */
  }
  const tags = raw.split(",").map((tag) => tag.trim()).filter(Boolean);
  return tags.length ? tags : undefined;
}

function scoreBound(raw, ignore) {
  if (raw == null || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value === ignore) return undefined;
  return value;
}

async function anilistPage(searchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const perPage = Math.min(50, parseInt(searchParams.get("perPage") || "20", 10) || 20);

  const sortRaw = searchParams.get("sort");
  let sort = ["TRENDING_DESC"];
  if (sortRaw) {
    try {
      const parsed = JSON.parse(sortRaw);
      if (Array.isArray(parsed) && parsed.length) sort = parsed;
      else if (typeof parsed === "string" && parsed) sort = [parsed];
    } catch {
      if (sortRaw) sort = [sortRaw];
    }
  }

  let genres = null;
  const genresRaw = searchParams.get("genres");
  if (genresRaw) {
    try {
      const parsed = JSON.parse(genresRaw);
      if (Array.isArray(parsed) && parsed.length) genres = parsed;
    } catch {
      genres = genresRaw.split(",").map((g) => g.trim()).filter(Boolean);
    }
  }

  const variables = {
    page,
    perPage,
    search: searchParams.get("query") || undefined,
    type: "ANIME",
    season: searchParams.get("season") || undefined,
    seasonYear: searchParams.get("year") ? Number(searchParams.get("year")) : undefined,
    format: searchParams.get("format") || undefined,
    status: searchParams.get("status") || undefined,
    genre: genres || undefined,
    tags: readTags(searchParams.get("tag")),
    source: searchParams.get("source") || undefined,
    country: searchParams.get("country") || undefined,
    scoreGreater: scoreBound(searchParams.get("scoreMin"), 0),
    scoreLesser: scoreBound(searchParams.get("scoreMax"), 100),
    sort,
  };

  const query = `query ($page: Int, $perPage: Int, $search: String, $type: MediaType, $season: MediaSeason, $seasonYear: Int, $format: MediaFormat, $status: MediaStatus, $genre: [String], $tags: [String], $source: MediaSource, $country: CountryCode, $scoreGreater: Int, $scoreLesser: Int, $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total perPage currentPage lastPage hasNextPage }
      media(search: $search, type: $type, season: $season, seasonYear: $seasonYear, format: $format, status: $status, genre_in: $genre, tag_in: $tags, source: $source, countryOfOrigin: $country, averageScore_greater: $scoreGreater, averageScore_lesser: $scoreLesser, sort: $sort, isAdult: false) {
        ${MEDIA_FRAGMENT}
      }
    }
  }`;

  const data = await anilist(query, variables);
  const info = data.Page.pageInfo;
  return {
    currentPage: info.currentPage,
    hasNextPage: info.hasNextPage,
    totalPages: info.lastPage || 1,
    totalResults: info.total,
    results: data.Page.media.map((m) => mapMedia(m)),
  };
}

// ani.zip → TVDB artwork (clear logo, fanart, banner, poster)
const ANIZIP = "https://api.ani.zip/mappings";
async function anizipArtwork(anilistId) {
  return cached(`anizip:${anilistId}`, TTL.anizip, async () => {
    const res = await fetch(`${ANIZIP}?anilist_id=${anilistId}`, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`ani.zip HTTP ${res.status}`);
    const data = await res.json();
    const images = Array.isArray(data?.images) ? data.images : [];
    const pick = (type) => images.find((i) => i?.coverType?.toLowerCase() === type)?.url || null;
    const first = Object.values(data?.episodes || {}).find((e) => e?.tvdbShowId);
    // Per-episode metadata (TVDB via ani.zip) — used to fill in providers that only
    // return "Episode N" titles / no thumbnails.
    const episodes = {};
    for (const [key, e] of Object.entries(data?.episodes || {})) {
      // The object key and `episode` are the absolute episode id providers use.
      // `episodeNumber` is the TVDB season index, so it repeats and would store
      // a later episode's still on top of an earlier one.
      const num = Number(e?.episode ?? key);
      if (!Number.isFinite(num) || num <= 0) continue;
      const title = e?.title?.en || e?.title?.["x-jat"] || e?.title?.ja || null;
      episodes[num] = {
        title: title && !/^episode\s*\d+$/i.test(title) ? title : null,
        image: e?.image || null,
        airDate: e?.airDate || e?.airdate || null,
        description: e?.overview || e?.summary || null,
      };
    }
    return {
      logo: pick("clearlogo"),
      fanart: pick("fanart"),
      banner: pick("banner"),
      poster: pick("poster"),
      tvdbId: first?.tvdbShowId || null,
      episodes,
      artwork: images
        .filter((i) => i?.url)
        .map((i) => ({ img: i.url, type: String(i.coverType || "").toLowerCase(), providerId: "tvdb" })),
    };
  });
}

async function anilistInfo(id, extras = true) {
  return cached(`info:${id}:${extras ? 1 : 0}`, TTL.info, async () => {
    const query = `query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FRAGMENT}
        ${extras ? EXTRAS_FRAGMENT : ""}
      }
    }`;
    const [data, art] = await Promise.all([
      anilist(query, { id: Number(id) }),
      extras ? withTimeout(anizipArtwork(id), 800, null) : Promise.resolve(null),
    ]);
    if (!data.Media) throw new Error("Anime not found");
    const anime = mapMedia(data.Media, { extras });
    if (art) {
      anime.logo = art.logo;
      anime.tvdbId = art.tvdbId;
      if (!anime.cover || anime.cover === anime.image) anime.cover = art.fanart || art.banner || anime.cover;
      if (art.artwork.length) anime.artwork = art.artwork;
    }
    return anime;
  });
}

// ---- Anivexa integration ----
async function anivexa(path) {
  const res = await fetch(`${ANIVEXA}${path}`, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    const err = new Error(`Anivexa HTTP ${res.status} for ${path}`);
    err.status = res.status;
    try {
      const body = await res.json();
      if (body?.code) err.code = body.code;
      if (body?.error) err.message = `${err.message}: ${body.error}`;
    } catch {}
    throw err;
  }
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

async function getEpisodes(anilistId, audio, preferred = null) {
  const wanted = preferred && PROVIDERS.includes(preferred) ? preferred : null;

  if (wanted) {
    try {
      const data = await anivexa(`/episodes/${wanted}/${anilistId}?map=false`);
      const hit = pickEpisodeList(data, wanted, audio);
      if (hit) return hit;
    } catch {}
  }

  // Prefer reanime — its streams are verified playable through the proxy.
  try {
    const data = await anivexa(`/episodes/reanime/${anilistId}?map=false`);
    const hit = pickEpisodeList(data, "reanime", audio);
    if (hit) return hit;
  } catch {}

  const rest = PROVIDERS.filter((x) => x !== "reanime" && x !== wanted && !ON_DEMAND.has(x));
  return await new Promise((resolve) => {
    let pending = rest.length;
    let fallback = null;
    if (pending === 0) return resolve({ provider: null, list: [] });
    const settle = () => {
      pending -= 1;
      if (pending <= 0) resolve(fallback || { provider: null, list: [] });
    };
    for (const provider of rest) {
      anivexa(`/episodes/${provider}/${anilistId}?map=false`)
        .then((data) => {
          const hit = pickEpisodeList(data, provider, audio);
          if (hit && hit.audio === audio) {
            resolve(hit);
            return;
          }
          if (hit && !fallback) fallback = hit;
        })
        .catch(() => {})
        .finally(settle);
    }
  });
}

const PROVIDER_TIMEOUT = Number(process.env.PROVIDER_TIMEOUT) || 8000;
// Slowest healthy upstream watch call measured ~15s (animenosub); anything past this is treated as down.
const WATCH_TIMEOUT = Number(process.env.WATCH_TIMEOUT) || 20000;

async function providerRow(provider, anilistId) {
  return cached(`prov:${provider}:${anilistId}`, TTL.providers, async () => {
    const data = await anivexa(`/episodes/${provider}/${anilistId}?map=false`);
    const p = data?.[provider];
    const sub = Array.isArray(p?.episodes?.sub) ? p.episodes.sub.length : 0;
    const dub = Array.isArray(p?.episodes?.dub) ? p.episodes.dub.length : 0;
    if (!sub && !dub) return null;
    return { name: provider, title: p?.meta?.title || null, sub, dub };
  });
}

async function listProviders(anilistId) {
  // Kiwi keeps scanning in the background and shows up on the follow-up request.
  const core = PROVIDERS.filter((provider) => !ON_DEMAND.has(provider));
  const rows = await Promise.all(
    core.map((provider) => withTimeout(providerRow(provider, anilistId), PROVIDER_TIMEOUT, TIMED_OUT)),
  );
  const results = rows.filter((row) => row && row !== TIMED_OUT);

  const kiwiKey = `prov:kiwi:${anilistId}`;
  const kiwiCached = CACHE.get(kiwiKey);
  let kiwiPending = true;
  if (kiwiCached && kiwiCached.expires > Date.now()) {
    kiwiPending = false;
    const kiwi = await withTimeout(kiwiCached.value, 200, null);
    if (kiwi) results.push(kiwi);
  } else {
    providerRow("kiwi", anilistId).catch(() => {});
  }
  return {
    results,
    partial: rows.some((row) => row === TIMED_OUT) || kiwiPending,
  };
}

const GENERIC_TITLE = /^(episode|ep\.?)\s*\d+$/i;

function mapEpisode(anilistId, provider, audio, ep, meta = null) {
  const m = meta?.[ep.number] || null;
  const providerTitle = ep.title && !GENERIC_TITLE.test(ep.title.trim()) ? ep.title : null;
  return {
    id: `${provider}-${audio}-anilist${anilistId}-episode-${ep.number}`,
    title: providerTitle || m?.title || `Episode ${ep.number}`,
    description: stripHtml(ep.description || m?.description || "") || null,
    number: ep.number,
    image: m?.image || ep.image || null,
    imageHash: null,
    airDate: ep.airDate || m?.airDate || null,
  };
}

// ---- FlixCloud proxy helpers ----
function decryptManifest(text, keyB64) {
  const trimmed = text.trim();
  if (trimmed.startsWith("#EXTM3U")) return { text: trimmed, encrypted: false };
  try {
    const key = Buffer.from(keyB64, "base64");
    const payload = Buffer.from(trimmed, "base64");
    const out = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) out[i] = payload[i] ^ key[i % key.length];
    const t = out.toString("utf8").trim();
    if (t.startsWith("#EXTM3U")) return { text: t, encrypted: true };
  } catch {}
  return null; // not a manifest we can decode
}

const FLIX_IMG_XOR_KEY = Uint8Array.from([
  157, 42, 241, 71, 179, 142, 92, 112, 166, 25, 228, 59, 216, 98, 15, 197,
]);

function isImageWrapped(body) {
  const b = body;
  const isWebp =
    b.length > 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  const isPng =
    b.length > 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
  return { isWebp, isPng };
}

function unwrapSegment(body) {
  const b = Buffer.from(body);
  const { isWebp, isPng } = isImageWrapped(b);
  let offset = 0;
  let needsXor = false;
  if (isWebp) {
    offset = 12;
    needsXor = b[offset] !== 0x47;
  } else if (isPng) {
    offset = 8;
    needsXor = b[offset] !== 0x47;
  }
  if (!offset) return { body: b, unwrapped: false };
  const out = Buffer.from(b.subarray(offset));
  if (needsXor) {
    for (let i = 0; i < out.length; i++) out[i] ^= FLIX_IMG_XOR_KEY[i % FLIX_IMG_XOR_KEY.length];
  }
  return { body: out, unwrapped: true };
}

function proxyHref(proxyBase, url, key, referer) {
  const params = new URLSearchParams({ url });
  if (key) params.set("key", key);
  if (referer) params.set("referer", referer);
  // End the path in ".m3u8" so the player infers HLS from the URL extension.
  return `${proxyBase}/proxy/hls/playlist.m3u8?${params.toString()}`;
}

async function upstreamFetch(url, headers) {
  const host = (() => { try { return new URL(url).host; } catch { return ""; } })();
  if (WREQ_HOSTS.test(host)) {
    try {
      return await wreqFetch(url, {
        session: `proxy:${host}`,
        browser: "chrome_149",
        os: "windows",
        headers,
        warm: headers.Referer ? [{ url: headers.Referer, headers: { "User-Agent": headers["User-Agent"] || UA } }] : [],
      });
    } catch (err) {
      console.error("wreq proxy fallback:", err.message);
    }
  }
  return fetch(url, { headers, redirect: "follow" });
}

const PLAYLIST_CACHE = new Map();
const PLAYLIST_INFLIGHT = new Map();
const PLAYLIST_TTL = 60 * 1000;
const SEGMENT_CACHE = new Map();
const SEGMENT_INFLIGHT = new Map();
let SEGMENT_BYTES = 0;
const SEGMENT_BUDGET = 64 * 1024 * 1024;

function cachedSegment(url) {
  const hit = SEGMENT_CACHE.get(url);
  if (!hit) return null;
  SEGMENT_CACHE.delete(url);
  SEGMENT_CACHE.set(url, hit);
  return hit;
}

function rememberSegment(url, result) {
  if (!Buffer.isBuffer(result?.body) || result.body.length > 4 * 1024 * 1024) return result;
  const prev = SEGMENT_CACHE.get(url);
  if (prev) SEGMENT_BYTES -= prev.body.length;
  while (SEGMENT_BYTES + result.body.length > SEGMENT_BUDGET && SEGMENT_CACHE.size) {
    const first = SEGMENT_CACHE.keys().next().value;
    SEGMENT_BYTES -= SEGMENT_CACHE.get(first).body.length;
    SEGMENT_CACHE.delete(first);
  }
  SEGMENT_CACHE.set(url, result);
  SEGMENT_BYTES += result.body.length;
  return result;
}

function cachedPlaylist(url) {
  const hit = PLAYLIST_CACHE.get(url);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    PLAYLIST_CACHE.delete(url);
    return null;
  }
  return hit.value;
}

function rememberPlaylist(url, value) {
  PLAYLIST_CACHE.set(url, { value, expires: Date.now() + PLAYLIST_TTL });
  if (PLAYLIST_CACHE.size > 300) {
    const first = PLAYLIST_CACHE.keys().next().value;
    PLAYLIST_CACHE.delete(first);
  }
}

function isMpegTs(buf) {
  return buf.length > 188 && buf[0] === 0x47 && buf[188] === 0x47;
}

function segmentResponse(body) {
  return {
    status: 200,
    body,
    headers: {
      ...CORS,
      "Content-Type": "video/mp2t",
      "Content-Length": body.length,
      "Cache-Control": "public, max-age=3600",
    },
  };
}

async function proxyHls(proxyBase, url, key, referer) {
  if (/\.m3u8(\?|$)/i.test(url)) {
    const hit = cachedPlaylist(url);
    if (hit) return hit;
    const pending = PLAYLIST_INFLIGHT.get(url);
    if (pending) return pending;
    const job = fetchPlaylist(proxyBase, url, key, referer);
    PLAYLIST_INFLIGHT.set(url, job);
    job.finally(() => PLAYLIST_INFLIGHT.delete(url));
    return job;
  }
  const hit = cachedSegment(url);
  if (hit) return hit;
  const pending = SEGMENT_INFLIGHT.get(url);
  if (pending) return pending;
  const job = fetchPlaylist(proxyBase, url, key, referer).then((result) => {
    if (result.status === 200 && result.headers?.["Content-Type"] === "video/mp2t") rememberSegment(url, result);
    return result;
  });
  SEGMENT_INFLIGHT.set(url, job);
  job.finally(() => SEGMENT_INFLIGHT.delete(url));
  return job;
}

async function fetchPlaylist(proxyBase, url, key, referer) {
  let ref = referer;
  let origin = null;
  const host = (() => { try { return new URL(url).host; } catch { return ""; } })();
  if (!ref && /flixcloud/.test(host)) {
    ref = "https://flixcloud.cc/";
    origin = "https://flixcloud.cc";
  }
  if (!ref && /krussdomi/.test(host)) {
    ref = "https://krussdomi.com/";
    origin = "https://krussdomi.com";
  }
  if (!ref && /settlar/.test(host)) {
    ref = "https://embed.settlar.io/";
    origin = "https://embed.settlar.io";
  }
  if (!ref && /nexabloom/.test(host)) {
    ref = "https://megaplay.buzz/";
    origin = "https://megaplay.buzz";
  }
  if (ref && !origin) {
    try { origin = new URL(ref).origin; } catch { origin = null; }
  }
  const headers = { "User-Agent": UA, Accept: "*/*" };
  if (ref) headers["Referer"] = ref;
  if (origin) headers["Origin"] = origin;
  const resp = await upstreamFetch(url, headers);
  if (!resp.ok) {
    return { status: resp.status, body: `upstream ${resp.status}`, headers: { ...CORS, "Content-Type": "text/plain" } };
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  const contentType = resp.headers.get("content-type") || "";
  // AniKoto/megaplay labels real MPEG-TS as .html, .js, .jpg, and so on.
  // Rejecting text/html made every eighth segment 502, so a seek sat in retries.
  if (isMpegTs(buf)) return segmentResponse(buf);
  const wrapped = isImageWrapped(buf);
  if (wrapped.isWebp || wrapped.isPng) return segmentResponse(unwrapSegment(buf).body);
  const head = buf.subarray(0, 64).toString("utf8").trim().toLowerCase();
  if (contentType.includes("text/html") || head.startsWith("<!doctype") || head.startsWith("<html")) {
    return { status: 502, body: "upstream returned HTML (likely blocked)", headers: { ...CORS, "Content-Type": "text/plain" } };
  }

  const text = buf.toString("utf8");
  let manifest = text.trim().startsWith("#EXTM3U") ? { text: text.trim(), encrypted: false } : null;
  if (!manifest && key) manifest = decryptManifest(text, key);

  if (!manifest && (contentType.includes("dash") || /<MPD[\s>]/.test(text) || /\.mpd(\?|$)/i.test(url))) {
    const rewritten = text.replace(/https?:\/\/[^"'<\s]+/g, (abs) => proxyHref(proxyBase, abs, key, ref));
    return {
      status: 200,
      body: rewritten,
      headers: { ...CORS, "Content-Type": "application/dash+xml" },
    };
  }

  if (manifest) {
    // It's a playlist — rewrite all child/segment URLs to go through the proxy.
    const base = url;
    const lines = manifest.text.split(/\r?\n/);
    const out = lines.map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (!t.startsWith("#")) {
        let abs;
        try {
          abs = new URL(t, base).toString();
        } catch {
          return line;
        }
        return proxyHref(proxyBase, abs, key, ref);
      }
      // Comment line — rewrite any URI="..." attributes (e.g. EXT-X-MEDIA audio tracks).
      return line.replace(/URI="([^"]+)"/g, (match, uri) => {
        let abs;
        try {
          abs = new URL(uri, base).toString();
        } catch {
          return match;
        }
        return `URI="${proxyHref(proxyBase, abs, key, ref)}"`;
      });
    });
    const result = {
      status: 200,
      body: out.join("\n"),
      headers: { ...CORS, "Content-Type": "application/vnd.apple.mpegurl" },
    };
    rememberPlaylist(url, result);
    // The player immediately asks for the first variant. Fetch it now so that request is a cache hit.
    const child = out.find((line) => line && !line.trim().startsWith("#") && line.includes("/proxy/hls/"));
    if (child) {
      try {
        const childUrl = new URL(child, proxyBase).searchParams.get("url");
        if (childUrl && childUrl !== url) proxyHls(proxyBase, childUrl, key, ref).catch(() => {});
      } catch {}
    }
    return result;
  }

  return {
    status: 200,
    body: buf,
    headers: {
      ...CORS,
      "Content-Type": contentType || "application/octet-stream",
      "Content-Length": buf.length,
    },
  };
}

// ---- Route handlers ----
// These routinely take 6–12s or 500. They stay available, but a healthy server should not wait on them.
const SLOW_PROVIDERS = new Set(["mkissa", "animenosub", "animeonsen", "animedunya", "animegg", "kiwi"]);

function collectSources(data, p, proxyBase) {
  let raw = Array.isArray(data?.streams) ? data.streams : [];
  if (!raw.length && Array.isArray(data?.sources)) {
    raw = data.sources.map((s) => ({
      url: s.extractedUrl || s.url,
      type: s.extractedType || s.type,
      server: s.name || s.server,
      referer: s.referer || s.headers?.Referer,
      headers: s.headers,
      key: s.key || s.playlist_key,
      playlist_key: s.playlist_key,
    }));
  }
  if (!raw.length && data?.stream_url) {
    raw = [{ url: data.stream_url, type: "hls", key: data.playlist_key || data.key || null }];
  }
  const topHeaders = data?.headers || {};
  const sources = [];
  const embeds = [];
  for (const s of raw) {
    if (!s?.url) continue;
    const looksMedia = /\.(m3u8|mpd|mp4)(\?|$)/i.test(s.url);
    if (s.type === "embed" && !looksMedia) {
      embeds.push(s.url);
      continue;
    }
    const ref = s.referer || s.headers?.Referer || topHeaders.Referer || topHeaders.Referrer || null;
    const key = s.key || s.playlist_key || null;
    const isHls = s.type === "hls" || /\.m3u8(\?|$)/i.test(s.url);
    const isDash = s.type === "dash" || /\.mpd(\?|$)/i.test(s.url);
    const isMp4 = s.type === "mp4" || /\.mp4(\?|$)/i.test(s.url);
    const needProxy = FLAKY_PROVIDERS.has(p) || isHls || isDash || looksMedia;
    const proxied = isMp4 && !isHls
      ? `${proxyBase}/proxy/hls/file.mp4?${new URLSearchParams({ url: s.url, ...(ref ? { referer: ref } : {}) })}`
      : proxyHref(proxyBase, s.url, key, ref);
    sources.push({
      url: needProxy ? proxied : s.url,
      quality: sources.length === 0 ? "default" : "backup",
      isM3U8: isHls && !isMp4,
      isDASH: isDash,
      isMP4: isMp4 && !isHls,
      provider: p,
    });
  }
  if (!sources.length) {
    for (const url of embeds) {
      sources.push({
        url,
        quality: sources.length === 0 ? "default" : "backup",
        isM3U8: false,
        isEmbed: true,
        provider: p,
      });
    }
  }
  return {
    sources,
    download: data?.download || data?.stream_url || "",
    subtitles: data?.subtitles || [],
  };
}

async function attemptWatch(p, anilistId, audio, ep, proxyBase, primary = false) {
  if (isBlocked(p) || !PROVIDERS.includes(p)) throw new Error(`${p} skipped`);
  const req = anivexa(`/watch/${p}/${anilistId}/${audio}/${p}-${ep}`);
  req.catch((e) => noteFailure(p, e));
  const limit = primary || ON_DEMAND.has(p) ? WATCH_TIMEOUT : (SLOW_PROVIDERS.has(p) ? 6000 : 8000);
  const data = await raceTimeout(req, limit);
  const built = collectSources(data, p, proxyBase);
  if (!built.sources.length) throw new Error(`${p} has no playable streams`);
  return built;
}

async function handleWatch(episodeId, proxyBase) {
  // episodeId format: {provider}-{audio}-anilist{id}-episode-{n}
  const m = episodeId.match(/^(.+?)-(sub|dub)-anilist(\d+)-episode-(\d+)$/);
  if (!m) return json({ error: "Invalid episode id" }, 400);
  const [, provider, audio, anilistId, ep] = m;

  const rest = PROVIDERS.filter((p) => p !== provider && !ON_DEMAND.has(p) && !isBlocked(p));
  const backup = rest.find((p) => !SLOW_PROVIDERS.has(p)) || rest[0];
  const order = (ON_DEMAND.has(provider) ? [provider] : [provider, backup].filter(Boolean));

  // The chosen server gets the full wait. One backup starts if it is still quiet.
  const timers = [];
  const racers = order.map((p, i) => new Promise((resolve, reject) => {
    timers.push(setTimeout(() => {
      attemptWatch(p, anilistId, audio, ep, proxyBase, i === 0).then(resolve, reject);
    }, i === 0 ? 0 : 2500));
  }));

  try {
    const hit = await Promise.any(racers);
    timers.forEach(clearTimeout);
    return json(hit);
  } catch (e) {
    timers.forEach(clearTimeout);
    const reason = e?.errors?.[0]?.message || e?.message || "unknown";
    return json({ error: "No working stream: " + reason }, 404);
  }
}

// ---- Server ----
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = u.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  const send = (r) => {
    if (Buffer.isBuffer(r.body)) {
      res.writeHead(r.status, r.headers);
      res.end(r.body);
    } else {
      res.writeHead(r.status, r.headers);
      res.end(r.body);
    }
  };

  try {
    const proxyBase = `http://${req.headers.host || `localhost:${PORT}`}`;

    if (path.startsWith("/proxy/hls")) {
      const url = u.searchParams.get("url");
      const key = u.searchParams.get("key") || "";
      const referer = u.searchParams.get("referer") || "";
      if (!url) return send(json({ error: "missing url" }, 400));
      const r = await proxyHls(proxyBase, url, key, referer);
      return send(r);
    }

    if (path === "/meta/anilist/advanced-search") {
      return send(json(await anilistPage(u.searchParams)));
    }

    if (path === "/meta/anilist/trending") {
      const sp = new URLSearchParams(u.searchParams);
      sp.set("sort", JSON.stringify(["TRENDING_DESC"]));
      return send(json(await anilistPage(sp)));
    }

    if (path === "/meta/anilist/recent-episodes") {
      const sp = new URLSearchParams(u.searchParams);
      sp.set("sort", JSON.stringify(["UPDATED_AT_DESC"]));
      sp.set("status", "RELEASING");
      return send(json(await anilistPage(sp)));
    }

    let m;
    if ((m = path.match(/^\/meta\/anilist\/data\/(\d+)\/?$/))) {
      return send(json(await anilistInfo(m[1], true)));
    }
    if ((m = path.match(/^\/meta\/anilist\/info\/(\d+)\/?$/))) {
      return send(json(await anilistInfo(m[1], true)));
    }

    if ((m = path.match(/^\/meta\/anilist\/episodes\/(\d+)\/?$/))) {
      const anilistId = m[1];
      const audio = u.searchParams.get("dub") === "true" ? "dub" : "sub";
      const requested = u.searchParams.get("provider");
      const preferred = requested && !LEGACY_PROVIDERS.has(requested) ? requested : null;
      const key = `eps:${anilistId}:${preferred || "*"}:${audio}`;
      const hit = CACHE.get(key);
      if (hit && hit.expires > Date.now()) return send(json(await hit.value));
      // Artwork rides along with the provider scan. A short cutoff used to return
      // the list before ani.zip, then cache it with empty thumbnails.
      const artPromise = anizipArtwork(anilistId).catch(() => null);
      const [{ provider, list, audio: actualAudio }, art] = await Promise.all([
        getEpisodes(anilistId, audio, preferred),
        withTimeout(artPromise, 8000, null),
      ]);
      const episodes = list.map((ep) => mapEpisode(anilistId, provider, actualAudio || audio, ep, art?.episodes));
      if (art) CACHE.set(key, { value: Promise.resolve(episodes), expires: Date.now() + TTL.episodes });
      return send(json(episodes));
    }

    if ((m = path.match(/^\/meta\/anilist\/providers\/(\d+)\/?$/))) {
      return send(json(await listProviders(m[1])));
    }

    if ((m = path.match(/^\/meta\/anilist\/watch\/(.+)$/))) {
      const episodeId = decodeURIComponent(m[1]);
      const r = await cached(`watch:${episodeId}:${proxyBase}`, TTL.watch, async () => {
        const out = await handleWatch(episodeId, proxyBase);
        if (out.status !== 200) throw new Error("not cacheable");
        return out;
      }).catch(() => handleWatch(episodeId, proxyBase));
      return send(r);
    }

    if ((m = path.match(/^\/meta\/anilist\/servers\/(.+)$/))) {
      const episodeId = decodeURIComponent(m[1]);
      const parsed = episodeId.match(/^(.+?)-(sub|dub)-anilist(\d+)-episode-(\d+)$/);
      if (!parsed) return send(json([]));
      const [, , audio, anilistId, ep] = parsed;
      const { results: available } = await listProviders(anilistId);
      return send(json(available.map((row) => ({
        name: row.name,
        url: `${row.name}-${audio}-anilist${anilistId}-episode-${ep}`,
      }))));
    }

    return send(json({ error: "Not found: " + path }, 404));
  } catch (err) {
    console.error("shim error:", err);
    return send(json({ error: err.message || String(err) }, 500));
  }
});

server.listen(PORT, () => {
  console.log(`Anivexa shim → http://localhost:${PORT}  (Anivexa: ${ANIVEXA})`);
});
