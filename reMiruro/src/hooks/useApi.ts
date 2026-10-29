import axios from 'axios';
import { year, getCurrentSeason, getNextSeason } from '../index';
import { searchAnime, getAnimeData, anilistQuery } from './anilistClient';

// Utility function to ensure URL ends with a slash
function ensureUrlEndsWithSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

// Adjusting environment variables to ensure they end with a slash.
// VITE_BACKEND_URL may be a comma-separated list — the client tries each in
// order and auto-switches to the next on a server error (miruro-style fallback).
const BASE_URLS = (import.meta.env.VITE_BACKEND_URL as string)
  .split(',')
  .map((s) => ensureUrlEndsWithSlash(s.trim()))
  .filter((s) => s.length > 1);
const BASE_URL = BASE_URLS[0] || '';

// FNV-1a — used to pin each request deterministically to a backend (miruro-style
// hash routing), spreading load across the two Workers instead of always hitting A.
function fnv1a(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const SKIP_TIMES = ensureUrlEndsWithSlash(
  import.meta.env.VITE_SKIP_TIMES as string,
);
let PROXY_URL = import.meta.env.VITE_PROXY_URL; // Default to an empty string if no proxy URL is provided
// Check if the proxy URL is provided and ensure it ends with a slash
if (PROXY_URL) {
  PROXY_URL = ensureUrlEndsWithSlash(import.meta.env.VITE_PROXY_URL as string);
}

const API_KEY = import.meta.env.VITE_API_KEY as string;

// Axios instance
const axiosInstance = axios.create({
  baseURL: PROXY_URL || undefined,
  timeout: 60000,
  headers: {
    'X-API-Key': API_KEY, // Assuming your API expects the key in this header
  },
});

// Error handling function
// Function to handle errors and throw appropriately
function handleError(error: any, context: string) {
  let errorMessage = 'An error occurred';

  // Handling CORS errors (Note: This is a simplification. Real CORS errors are hard to catch in JS)
  if (error.message && error.message.includes('Access-Control-Allow-Origin')) {
    errorMessage = 'A CORS error occurred';
  }

  switch (context) {
    case 'data':
      errorMessage = 'Error fetching data';
      break;
    case 'anime episodes':
      errorMessage = 'Error fetching anime episodes';
      break;
    // Extend with other cases as needed
  }

  if (error.response) {
    // Extend with more nuanced handling based on HTTP status codes
    const status = error.response.status;
    if (status >= 500) {
      errorMessage += ': Server error';
    } else if (status >= 400) {
      errorMessage += ': Client error';
    }
    // Include server-provided error message if available
    errorMessage += `: ${error.response.data.message || 'Unknown error'}`;
  } else if (error.message) {
    errorMessage += `: ${error.message}`;
  }

  console.error(`${errorMessage}`, error);
  throw new Error(errorMessage);
}

// Cache key generator
// Function to generate cache key from arguments
function generateCacheKey(...args: string[]) {
  return args.join('-');
}

interface CacheItem {
  value: any; // Replace 'any' with a more specific type if possible
  timestamp: number;
}

// Session storage cache creation
// Function to create a cache in session storage
function createOptimizedSessionStorageCache(
  maxSize: number,
  maxAge: number,
  cacheKey: string,
) {
  const cache = new Map<string, CacheItem>(
    JSON.parse(sessionStorage.getItem(cacheKey) || '[]'),
  );
  const keys = new Set<string>(cache.keys());

  function isItemExpired(item: CacheItem) {
    return Date.now() - item.timestamp > maxAge;
  }

  function updateSessionStorage() {
    sessionStorage.setItem(
      cacheKey,
      JSON.stringify(Array.from(cache.entries())),
    );
  }

  return {
    get(key: string) {
      if (cache.has(key)) {
        const item = cache.get(key);
        if (!isItemExpired(item!)) {
          keys.delete(key);
          keys.add(key);
          return item!.value;
        }
        cache.delete(key);
        keys.delete(key);
      }
      return undefined;
    },
    set(key: string, value: any) {
      if (cache.size >= maxSize) {
        const oldestKey = keys.values().next().value;
        cache.delete(oldestKey);
        keys.delete(oldestKey);
      }
      keys.add(key);
      cache.set(key, { value, timestamp: Date.now() });
      updateSessionStorage();
    },
    delete(key: string) {
      cache.delete(key);
      keys.delete(key);
      updateSessionStorage();
    },
  };
}

// Constants for cache configuration
// Cache size and max age constants
const CACHE_SIZE = 20;
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Factory function for cache creation
// Function to create cache with given cache key
function createCache(cacheKey: string, maxAge = CACHE_MAX_AGE) {
  return createOptimizedSessionStorageCache(CACHE_SIZE, maxAge, cacheKey);
}

interface FetchOptions {
  type?: string;
  season?: string;
  format?: string;
  sort?: string[];
  genres?: string[];
  tag?: string;
  tags?: string[];
  id?: string;
  year?: string;
  status?: string;
  source?: string;
  country?: string;
  scoreMin?: string;
  scoreMax?: string;
}

// Individual caches for different types of data
// Creating caches for anime data, anime info, and video sources
const advancedSearchCache = createCache('Advanced Search v2');
const animeDataCache = createCache('Data v3');
const animeInfoCache = createCache('Info');
const animeEpisodesCache = createCache('Episodes');
const fetchAnimeEmbeddedEpisodesCache = createCache('Video Embedded Sources');
const videoSourcesCache = createCache('Video Sources v2', 90 * 1000);

// Fetch data from proxy with caching
// Function to fetch data from proxy with caching
const inflight = new Map<string, Promise<any>>();

async function fetchFromProxy(url: string, cache: any, cacheKey: string) {
  try {
    // Attempt to retrieve the cached response using the cacheKey
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      return cachedResponse; // Return the cached response if available
    }
    const pending = inflight.get(cacheKey);
    if (pending) return pending;

    const job = (async () => {
      const backends = BASE_URLS.length ? BASE_URLS : [BASE_URL];

      // Third-party absolute URLs (e.g. the AniSkip API) must never be rewritten onto
      // the shim base — only URLs that already point at a backend get path-swapped.
      const backendBase = backends.find((base) => url.startsWith(base));
      if (!backendBase && /^https?:\/\//i.test(url)) {
        const response = await axiosInstance.get(PROXY_URL ? '' : url, PROXY_URL ? { params: { url } } : {});
        cache.set(cacheKey, response.data);
        return response.data;
      }

      const path = backendBase ? url.slice(backendBase.length) : url;
      // Hash-based primary backend, then the rest as failover (mirrors miruro's
      // VITE_PROXY_A/B rotation: hash % N picks the primary, others are fallback).
      const primary = backends.length > 1 ? fnv1a(path) % backends.length : 0;
      const ordered = [...backends.slice(primary), ...backends.slice(0, primary)];
      let lastErr: any;
      for (const base of ordered) {
        try {
          const target = base + path;
          const requestConfig = PROXY_URL ? { params: { url: target } } : {};
          const response = await axiosInstance.get(PROXY_URL ? '' : target, requestConfig);
          cache.set(cacheKey, response.data);
          return response.data;
        } catch (e: any) {
          lastErr = e;
          const status = e?.response?.status;
          // 4xx = the request itself is invalid (not found, etc.) — don't fall through.
          if (status && status >= 400 && status < 500) throw e;
          // Otherwise (network / timeout / 5xx) auto-switch to the next backend.
        }
      }
      throw lastErr;
    })();
    inflight.set(cacheKey, job);
    try {
      return await job;
    } finally {
      inflight.delete(cacheKey);
    }
  } catch (error) {
    handleError(error, 'data');
    throw error; // Rethrow the error for the caller to handle
  }
}

/** Start metadata, the episode list, and episode 1 before the watch page opens. */
export function prefetchWatch(animeId: string | number, episode = 1) {
  const id = String(animeId || '');
  if (!id) return;
  const dub = localStorage.getItem('miruro:watch:audio') === 'dub';
  const provider = localStorage.getItem('miruro:watch:server') || 'reanime';
  const ep = Number(episode) || 1;
  fetchAnimeData(id).catch(() => {});
  fetchAnimeEpisodes(id, provider, dub).catch(() => {});
  fetchAnimeStreamingLinks(`${provider}-${dub ? 'dub' : 'sub'}-anilist${id}-episode-${ep}`).catch(() => {});
}

// Function to fetch anime data
export async function fetchAdvancedSearch(
  searchQuery: string = '',
  page: number = 1,
  perPage: number = 20,
  options: FetchOptions = {},
) {
  const tags = options.tags && options.tags.length
    ? options.tags
    : options.tag
      ? String(options.tag).split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;
  return searchAnime({
    search: searchQuery,
    page,
    perPage,
    season: options.season,
    seasonYear: options.year ? Number(options.year) : undefined,
    format: options.format,
    status: options.status,
    genres: options.genres && options.genres.length ? options.genres : undefined,
    tags,
    source: options.source,
    country: options.country,
    scoreMin: options.scoreMin ? Number(options.scoreMin) : undefined,
    scoreMax: options.scoreMax ? Number(options.scoreMax) : undefined,
    sort: options.sort && options.sort.length ? options.sort : undefined,
  });
}

// Fetch Anime DATA Function
export async function fetchAnimeData(
  animeId: string,
  provider: string = 'gogoanime',
) {
  return getAnimeData(animeId);
}

// Fetch Anime INFO Function
export async function fetchAnimeInfo(
  animeId: string,
  provider: string = 'gogoanime',
) {
  return getAnimeData(animeId);
}

// Function to fetch list of anime based on type (TopRated, Trending, Popular)
async function fetchList(
  type: string,
  page: number = 1,
  perPage: number = 16,
  options: FetchOptions = {},
) {
  let sort = ['TRENDING_DESC'];
  let season: string | undefined;
  let seasonYear: number | undefined;
  let status: string | undefined;

  if (type === 'TopRated') sort = ['SCORE_DESC'];
  else if (type === 'Popular') sort = ['POPULARITY_DESC'];
  else if (type === 'Upcoming') {
    season = getNextSeason();
    seasonYear = season === 'WINTER' ? year + 1 : year;
    status = 'NOT_YET_RELEASED';
    sort = ['POPULARITY_DESC'];
  } else if (type === 'TopAiring') {
    season = getCurrentSeason();
    seasonYear = year;
    status = 'RELEASING';
    sort = ['POPULARITY_DESC'];
  }

  return searchAnime({ page, perPage, sort, season, seasonYear, status });
}

// Functions to fetch top, trending, and popular anime
export const fetchTopAnime = (page: number, perPage: number) =>
  fetchList('TopRated', page, perPage);
export const fetchTrendingAnime = (page: number, perPage: number) =>
  fetchList('Trending', page, perPage);
export const fetchPopularAnime = (page: number, perPage: number) =>
  fetchList('Popular', page, perPage);
export const fetchTopAiringAnime = (page: number, perPage: number) =>
  fetchList('TopAiring', page, perPage);
export const fetchUpcomingSeasons = (page: number, perPage: number) =>
  fetchList('Upcoming', page, perPage);
const NEWEST_QUERY = `
  query ($page: Int, $perPage: Int, $now: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage lastPage }
      airingSchedules(airingAt_lesser: $now, sort: TIME_DESC) {
        episode
        media {
          id idMal format status seasonYear averageScore episodes duration isAdult
          countryOfOrigin color: coverImage { color }
          title { romaji english native userPreferred }
          coverImage { extraLarge large }
          bannerImage
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  }
`;

export async function fetchNewestAnime(page: number, perPage: number) {
  const cache = createCache('NewestAnime');
  const cacheKey = generateCacheKey('newest', String(page), String(perPage));
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const json = await anilistQuery(NEWEST_QUERY, { page, perPage: perPage * 2, now: Math.floor(Date.now() / 1000) });
  const pageData = json?.Page;
  const seen = new Set<number>();
  const results = (pageData?.airingSchedules || [])
    .filter((s: any) => s.media && !s.media.isAdult && !seen.has(s.media.id) && seen.add(s.media.id))
    .slice(0, perPage)
    .map((s: any) => {
      const m = s.media;
      return {
        id: String(m.id),
        malId: m.idMal ? String(m.idMal) : '',
        title: m.title,
        image: m.coverImage?.extraLarge || m.coverImage?.large,
        cover: m.bannerImage || null,
        color: m.color?.color || null,
        type: m.format,
        status: m.status,
        releaseDate: m.seasonYear,
        rating: m.averageScore,
        totalEpisodes: m.episodes,
        currentEpisode: s.episode,
        duration: m.duration,
        nextAiringEpisode: m.nextAiringEpisode,
      };
    });
  const data = {
    currentPage: page,
    hasNextPage: !!pageData?.pageInfo?.hasNextPage,
    totalPages: 5,
    results,
  };
  cache.set(cacheKey, data);
  return data;
}
export const fetchTopMovies = (page: number, perPage: number) =>
  fetchAdvancedSearch('', page, perPage, {
    format: 'MOVIE',
    sort: ['POPULARITY_DESC'],
  });
export const fetchJustFinished = (page: number, perPage: number) =>
  fetchAdvancedSearch('', page, perPage, {
    status: 'FINISHED',
    sort: ['END_DATE_DESC'],
  });

export async function fetchAiringSchedule(from: number, to: number) {
  const query = `
    query ($from: Int, $to: Int, $page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo { hasNextPage }
        airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
          id
          episode
          airingAt
          media {
            id
            format
            status
            title { romaji english userPreferred }
            coverImage { extraLarge large medium }
          }
        }
      }
    }
  `;
  const cacheKey = generateCacheKey(
    'airingSchedule',
    String(from),
    String(to),
  );
  const cache = createCache('AiringSchedule');
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // A single Page caps at 50 airings, which for a full week only covers the first
  // day or two (leaving later days empty). Paginate until the window is exhausted.
  const all: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const data = await anilistQuery(query, { from, to, page });
    const pageData = data?.Page;
    const rows = pageData?.airingSchedules || [];
    all.push(...rows);
    if (rows.length < 50 || !pageData?.pageInfo?.hasNextPage) break;
  }
  cache.set(cacheKey, all);
  return all;
}

export async function fetchRandomAnimeId() {
  const page = Math.floor(Math.random() * 20) + 1;
  const data = await fetchAdvancedSearch('', page, 20, {
    sort: ['POPULARITY_DESC'],
  });
  const results = data?.results || [];
  if (!results.length) return null;
  return results[Math.floor(Math.random() * results.length)];
}

const animeProvidersCache = createCache('AnimeProviders v3');

// The shim answers within a bounded time and flags `partial: true` when slow upstreams
// were still scanning. Partial lists are returned but never cached, so a follow-up call
// (see Watch) can pick up the completed scan.
export async function fetchAnimeProviders(animeId: string) {
  const url = `${BASE_URL}meta/anilist/providers/${animeId}`;
  const cacheKey = generateCacheKey('animeProviders', animeId);
  const hit = animeProvidersCache.get(cacheKey);
  if (hit) return hit;
  const response = await axiosInstance.get(
    PROXY_URL ? '' : url,
    PROXY_URL ? { params: { url } } : {},
  );
  const data = response.data;
  if (data && !data.partial) animeProvidersCache.set(cacheKey, data);
  return data;
}

// Fetch Anime Episodes Function
export async function fetchAnimeEpisodes(
  animeId: string,
  provider: string = 'gogoanime',
  dub: boolean = false,
) {
  const params = new URLSearchParams({ provider, dub: dub ? 'true' : 'false' });
  const url = `${BASE_URL}meta/anilist/episodes/${animeId}?${params.toString()}`;
  const cacheKey = generateCacheKey(
    'animeEpisodes',
    animeId,
    provider,
    dub ? 'dub' : 'sub',
  );

  return fetchFromProxy(url, animeEpisodesCache, cacheKey);
}

// Fetch Embedded Anime Episodes Servers
export async function fetchAnimeEmbeddedEpisodes(episodeId: string) {
  const url = `${BASE_URL}meta/anilist/servers/${episodeId}`;
  const cacheKey = generateCacheKey('animeEmbeddedServers', episodeId);

  return fetchFromProxy(url, fetchAnimeEmbeddedEpisodesCache, cacheKey);
}

// Function to fetch anime streaming links
export async function fetchAnimeStreamingLinks(episodeId: string) {
  const url = `${BASE_URL}meta/anilist/watch/${episodeId}`;
  const cacheKey = generateCacheKey('animeStreamingLinks', episodeId);

  return fetchFromProxy(url, videoSourcesCache, cacheKey);
}

export function dropAnimeStreamingLinks(episodeId: string) {
  videoSourcesCache.delete(generateCacheKey('animeStreamingLinks', episodeId));
}

// Function to fetch skip times for an anime episode
interface FetchSkipTimesParams {
  malId: string;
  episodeNumber: string;
  episodeLength?: string;
}

// Function to fetch skip times for an anime episode
export async function fetchSkipTimes({
  malId,
  episodeNumber,
  episodeLength = '0',
}: FetchSkipTimesParams) {
  // Constructing the URL with query parameters
  const types = ['ed', 'mixed-ed', 'mixed-op', 'op', 'recap'];
  const url = new URL(`${SKIP_TIMES}v2/skip-times/${malId}/${episodeNumber}`);
  url.searchParams.append('episodeLength', episodeLength.toString());
  types.forEach((type) => url.searchParams.append('types[]', type));

  const cacheKey = generateCacheKey(
    'skipTimes',
    malId,
    episodeNumber,
    episodeLength || '',
  );

  // Use the fetchFromProxy function to make the request and handle caching
  return fetchFromProxy(url.toString(), createCache('SkipTimes'), cacheKey);
}

// Fetch Recent Anime Episodes Function
export async function fetchRecentEpisodes(
  page: number = 1,
  perPage: number = 18,
  provider: string = 'gogoanime',
) {
  // Construct the URL with query parameters for fetching recent episodes
  const params = new URLSearchParams({
    page: page.toString(),
    perPage: perPage.toString(),
    provider: provider, // Default to 'gogoanime' if no provider is specified
  });

  // Using the BASE_URL defined at the top of your file
  const url = `${BASE_URL}meta/anilist/recent-episodes?${params.toString()}`;
  const cacheKey = generateCacheKey(
    'recentEpisodes',
    page.toString(),
    perPage.toString(),
    provider,
  );

  // Utilize the existing fetchFromProxy function to handle the request and caching logic
  return fetchFromProxy(url, createCache('RecentEpisodes'), cacheKey);
}
