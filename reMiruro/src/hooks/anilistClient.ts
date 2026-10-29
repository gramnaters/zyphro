// Client-side AniList GraphQL — the shim can't reach AniList (Cloudflare Workers are
// blocked by AniList), so the browser does these queries directly (AniList is CORS-open).
const ANILIST = "https://graphql.anilist.co";

const STATUS_MAP: Record<string, string> = {
  FINISHED: "Completed",
  RELEASING: "Ongoing",
  NOT_YET_RELEASED: "Not yet aired",
  CANCELLED: "Cancelled",
  HIATUS: "Hiatus",
};

function stripHtml(html?: string | null) {
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

function mapTitle(m: any) {
  const t = m?.title || {};
  return {
    romaji: t.romaji || null,
    english: t.english || null,
    native: t.native || null,
    userPreferred: t.userPreferred || t.romaji || t.english || null,
  };
}
function coverOf(m: any) {
  return m?.coverImage?.extraLarge || m?.coverImage?.large || null;
}

function mapCard(node: any, relationType: string | null = null) {
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

function mapMedia(media: any, { extras = false } = {}) {
  const anime: any = {
    id: String(media.id),
    malId: media.idMal ? String(media.idMal) : null,
    title: mapTitle(media),
    trailer: media.trailer
      ? { id: media.trailer.id || null, site: media.trailer.site || null, thumbnail: media.trailer.thumbnail || null, thumbnailHash: null }
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
    currentEpisode: media.status === "RELEASING" ? (media.nextAiringEpisode?.episode ? media.nextAiringEpisode.episode - 1 : 0) : media.episodes ?? 0,
    rating: media.averageScore ?? null,
    duration: media.duration ?? null,
    genres: media.genres || [],
    studios: media.studios?.edges?.map((e: any) => e.node?.name).filter(Boolean) || [],
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
    anime.recommendations = (media.recommendations?.edges || []).map((e: any) => mapCard(e.node?.mediaRecommendation)).filter(Boolean);
    anime.relations = (media.relations?.edges || []).map((e: any) => mapCard(e.node, e.relationType)).filter(Boolean);
    anime.characters = (media.characters?.edges || []).map((e: any) => ({ id: e.node?.id, role: e.role || null, name: e.node?.name || null, image: e.node?.image?.large || null })).filter((c: any) => c.id);
  }
  return anime;
}

// ---- AniList request queue ----
// AniList rate-limits per IP (~90/min, and it 429s on bursts). The homepage fires
// several queries at once, so we serialize them and retry on 429 to avoid empty rails.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const inFlight = new Map<string, Promise<any>>();
let queue: Promise<any> = Promise.resolve();

async function anilistFetch(query: string, variables: any, retries = 3) {
  const res = await fetch(ANILIST, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429 && retries > 0) {
    // AniList's window is per-minute, so back off generously before retrying.
    await sleep(2000 * (4 - retries)); // 2s, 4s, 6s
    return anilistFetch(query, variables, retries - 1);
  }
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

// Shared entrypoint: dedupes identical in-flight queries and serializes so requests
// never burst AniList. Used by search/info here and by the schedule/newest fetchers.
export async function anilistQuery(query: string, variables: any): Promise<any> {
  const key = JSON.stringify({ query, variables });
  const pending = inFlight.get(key);
  if (pending) return pending;
  const task = queue.then(() => anilistFetch(query, variables));
  queue = task.catch(() => {});
  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}

async function graphql(query: string, variables: any) {
  return anilistQuery(query, variables);
}

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

function readTags(raw?: string) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) { const t = parsed.map((x: any) => String(x).trim()).filter(Boolean); return t.length ? t : undefined; }
    if (parsed) return [String(parsed)];
  } catch {}
  const t = raw.split(",").map((x) => x.trim()).filter(Boolean);
  return t.length ? t : undefined;
}

export interface SearchOptions {
  search?: string;
  page?: number;
  perPage?: number;
  season?: string;
  seasonYear?: number;
  format?: string;
  status?: string;
  genres?: string[];
  tags?: string[];
  source?: string;
  country?: string;
  scoreMin?: number;
  scoreMax?: number;
  sort?: string[];
}

export async function searchAnime(opts: SearchOptions = {}) {
  const page = Math.max(1, opts.page || 1);
  const perPage = Math.min(50, opts.perPage || 20);
  const query = `query ($page: Int, $perPage: Int, $search: String, $type: MediaType, $season: MediaSeason, $seasonYear: Int, $format: MediaFormat, $status: MediaStatus, $genre: [String], $tags: [String], $source: MediaSource, $country: CountryCode, $scoreGreater: Int, $scoreLesser: Int, $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total perPage currentPage lastPage hasNextPage }
      media(search: $search, type: $type, season: $season, seasonYear: $seasonYear, format: $format, status: $status, genre_in: $genre, tag_in: $tags, source: $source, countryOfOrigin: $country, averageScore_greater: $scoreGreater, averageScore_lesser: $scoreLesser, sort: $sort, isAdult: false) { ${MEDIA_FRAGMENT} }
    }
  }`;
  const data = await graphql(query, {
    page,
    perPage,
    search: opts.search || undefined,
    type: "ANIME",
    season: opts.season || undefined,
    seasonYear: opts.seasonYear || undefined,
    format: opts.format || undefined,
    status: opts.status || undefined,
    genre: opts.genres?.length ? opts.genres : undefined,
    tags: opts.tags?.length ? opts.tags : undefined,
    source: opts.source || undefined,
    country: opts.country || undefined,
    scoreGreater: opts.scoreMin != null ? opts.scoreMin : undefined,
    scoreLesser: opts.scoreMax != null ? opts.scoreMax : undefined,
    sort: opts.sort?.length ? opts.sort : ["TRENDING_DESC"],
  });
  const info = data.Page.pageInfo;
  return {
    currentPage: info.currentPage,
    hasNextPage: info.hasNextPage,
    totalPages: info.lastPage || 1,
    totalResults: info.total,
    results: data.Page.media.map((m: any) => mapMedia(m)),
  };
}

export async function getAnimeData(id: string | number) {
  const query = `query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FRAGMENT} ${EXTRAS_FRAGMENT} } }`;
  const data = await graphql(query, { id: Number(id) });
  if (!data.Media) throw new Error("Anime not found");
  return mapMedia(data.Media, { extras: true });
}

export { readTags };
