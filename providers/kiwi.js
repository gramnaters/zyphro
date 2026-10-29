import { getMedia } from "../core/anilist.js";
import { buildTitles, episodeMeta, json } from "../core/new-provider-utils.js";
import { get, set, isFresh, SHOW_IDENTITY_TTL } from "../core/smartcache.js";
import { wreqFetch } from "../core/wreq.js";

const ORIGIN = "https://animepahe.pw";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function norm(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function absolute(url, base = ORIGIN) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return new URL(url, base).toString();
}

async function paheText(url, { json = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await wreqFetch(url, {
      session: "kiwi",
      browser: "chrome_149",
      os: "windows",
      signal: controller.signal,
      headers: {
        Accept: json ? "application/json, text/plain, */*" : "text/html,application/xhtml+xml",
        Referer: `${ORIGIN}/`,
        "User-Agent": UA,
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    const text = await res.text();
    if (res.status === 403 || /Just a moment|cf-browser-verification|challenge-platform/i.test(text)) {
      throw new Error("AnimePahe is behind a Cloudflare check from this server");
    }
    if (!res.ok) throw new Error(`AnimePahe HTTP ${res.status}`);
    return text;
  } catch (err) {
    if (err?.name === "AbortError") throw new Error("AnimePahe timed out");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function paheJson(url) {
  const text = await paheText(url, { json: true });
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("AnimePahe returned a page instead of JSON");
  }
}

function scoreHit(hit, titles, year) {
  const name = norm(hit?.title);
  if (!name) return 0;
  let best = 0;
  for (const title of titles) {
    const query = norm(title);
    if (!query) continue;
    if (name === query) best = Math.max(best, 1);
    else if (name.includes(query) || query.includes(name)) best = Math.max(best, 0.82);
  }
  if (year && Number(hit.year) === Number(year)) best += 0.04;
  return best;
}

async function resolveShow(anilistId, ctx) {
  const key = `kiwi:show:${anilistId}`;
  const cached = get(key);
  if (isFresh(cached)) return cached.data;

  const media = ctx.media ?? await getMedia(anilistId);
  const titles = buildTitles(media, ctx.anizip);
  if (!titles.length) throw new Error(`No titles for AniList ${anilistId}`);
  const year = media?.seasonYear || media?.startDate?.year || null;
  let best = null;
  for (const title of titles.slice(0, 4)) {
    const data = await paheJson(`${ORIGIN}/api?m=search&q=${encodeURIComponent(title)}`);
    for (const hit of data?.data || []) {
      const score = scoreHit(hit, titles, year);
      if (!best || score > best.score) best = { ...hit, score };
    }
    if (best?.score >= 1) break;
  }
  if (!best?.session || best.score < 0.82) throw new Error(`AnimePahe match not found for AniList ${anilistId}`);
  const show = {
    session: best.session,
    title: best.title,
    score: best.score,
    year: best.year || null,
  };
  set(key, show, SHOW_IDENTITY_TTL);
  return show;
}

async function releasePages(session) {
  const episodes = [];
  let page = 1;
  let last = 1;
  do {
    const data = await paheJson(`${ORIGIN}/api?m=release&id=${encodeURIComponent(session)}&sort=episode_asc&page=${page}`);
    last = Number(data?.last_page) || 1;
    for (const row of data?.data || []) episodes.push(row);
    page += 1;
  } while (page <= last && page <= 30);
  return episodes;
}

function playButtons(html) {
  const buttons = [];
  for (const tag of html.match(/<button\b[^>]*data-src=["'][^"']+["'][^>]*>/gi) || []) {
    const src = tag.match(/data-src=["']([^"']+)["']/i)?.[1];
    const resolution = tag.match(/data-resolution=["']([^"']+)["']/i)?.[1] || "";
    const audio = (tag.match(/data-audio=["']([^"']+)["']/i)?.[1] || "jpn").toLowerCase();
    if (!src) continue;
    buttons.push({
      url: absolute(src),
      quality: resolution ? `${resolution}p` : "default",
      audio: /eng|dub/.test(audio) ? "dub" : "sub",
    });
  }
  return buttons;
}

function encodeRadix(n, radix) {
  if (n < radix) return ALPHABET[n] || "0";
  let out = "";
  while (n > 0) {
    out = (ALPHABET[n % radix] || "0") + out;
    n = Math.floor(n / radix);
  }
  return out;
}

function unpackPacked(html) {
  const start = html.indexOf("eval(function(p,a,c,k,e,d)");
  if (start < 0) return "";
  const args = html.slice(start).match(/}\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/);
  if (!args) return "";
  let payload = args[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  const radix = Number(args[2]);
  let count = Number(args[3]);
  const dict = args[4].split("|");
  while (count--) {
    if (!dict[count]) continue;
    payload = payload.replace(new RegExp(`\\b${encodeRadix(count, radix)}\\b`, "g"), dict[count]);
  }
  return payload;
}

function fileFromHtml(html) {
  const unpacked = unpackPacked(html);
  const blob = `${unpacked}\n${html}`.replace(/\\\//g, "/");
  const file = blob.match(/https?:\/\/[^"'\\\s<>]+?\.(?:m3u8|mp4)[^"'\\\s<>]*/i)?.[0];
  return file ? file.replace(/&amp;/g, "&") : "";
}

async function resolveButton(button) {
  const page = await paheText(button.url);
  const direct = fileFromHtml(page);
  if (direct) {
    return {
      url: direct,
      type: direct.includes(".m3u8") ? "hls" : "mp4",
      quality: button.quality,
      audio: button.audio,
      server: "kiwi",
      referer: `${new URL(button.url).origin}/`,
    };
  }
  const token = page.match(/name=["']_token["'][^>]*value=["']([^"']+)["']/i)?.[1]
    || page.match(/value=["']([^"']+)["'][^>]*name=["']_token["']/i)?.[1];
  const action = page.match(/<form[^>]*action=["']([^"']+)["']/i)?.[1];
  if (!token || !action) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await wreqFetch(absolute(action, button.url), {
      session: "kiwi",
      browser: "chrome_149",
      os: "windows",
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: button.url,
        Origin: new URL(button.url).origin,
        "User-Agent": UA,
      },
      body: `_token=${encodeURIComponent(token)}`,
    });
    const location = res.headers.get("location");
    if (!location) return null;
    const url = absolute(location, button.url);
    return {
      url,
      type: /\.m3u8(\?|$)/i.test(url) ? "hls" : "mp4",
      quality: button.quality,
      audio: button.audio,
      server: "kiwi",
      referer: `${new URL(button.url).origin}/`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function getEpisodes(anilistId, ctx = {}) {
  const media = ctx.media ?? await getMedia(anilistId);
  const localCtx = { ...ctx, media };
  const show = await resolveShow(anilistId, localCtx);
  const rows = await releasePages(show.session);
  const sub = [];
  const dub = [];
  for (const row of rows) {
    const number = Number(row.episode ?? row.episode2 ?? row.number);
    if (!Number.isFinite(number) || number < 1) continue;
    const meta = episodeMeta(number, localCtx);
    const audio = /eng|dub/i.test(String(row.audio || "")) ? "dub" : "sub";
    const item = {
      id: `watch/kiwi/${anilistId}/${audio}/kiwi-${number}`,
      number,
      title: meta.title || row.title || `Episode ${number}`,
      duration: meta.duration,
      filler: meta.filler ?? false,
      uncensored: false,
      description: meta.description,
      image: row.snapshot ? absolute(row.snapshot) : meta.image,
      airDate: meta.airDate,
      audio,
      session: row.session,
    };
    (audio === "dub" ? dub : sub).push(item);
  }
  sub.sort((a, b) => a.number - b.number);
  dub.sort((a, b) => a.number - b.number);

  if (sub[0]?.session && !dub.length) {
    try {
      const html = await paheText(`${ORIGIN}/play/${show.session}/${sub[0].session}`);
      if (playButtons(html).some((button) => button.audio === "dub")) {
        for (const ep of sub) {
          dub.push({ ...ep, audio: "dub", id: `watch/kiwi/${anilistId}/dub/kiwi-${ep.number}` });
        }
      }
    } catch {}
  }

  if (!sub.length && !dub.length) throw new Error(`AnimePahe has no episodes for ${show.title}`);
  return {
    meta: {
      id: show.session,
      title: show.title,
      source: "kiwi",
      matchScore: Number(show.score.toFixed(3)),
    },
    episodes: { sub, dub },
  };
}

async function handleWatch(anilistId, audio, epNum, ctx = {}) {
  const show = await resolveShow(anilistId, ctx);
  const rows = await releasePages(show.session);
  const row = rows.find((item) => Number(item.episode ?? item.number) === Number(epNum));
  if (!row?.session) return json({ error: `Kiwi episode ${epNum} not found` }, 404);
  const html = await paheText(`${ORIGIN}/play/${show.session}/${row.session}`);
  const wanted = audio === "dub" ? "dub" : "sub";
  let buttons = playButtons(html).filter((button) => button.audio === wanted);
  if (!buttons.length && wanted === "sub") buttons = playButtons(html);
  const resolved = await Promise.all(buttons.slice(0, 4).map((button) => resolveButton(button).catch(() => null)));
  const streams = resolved.filter(Boolean);
  streams.sort((a, b) => (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0));
  if (!streams.length) return json({ error: `Kiwi has no file for episode ${epNum}` }, 404);
  return json({
    anilistId: Number(anilistId),
    episode: Number(epNum),
    audio,
    provider: "kiwi",
    title: show.title,
    streams,
    headers: { Referer: `${ORIGIN}/`, "User-Agent": UA },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }
    try {
      const m = url.pathname.match(/^\/watch\/kiwi\/(\d+)\/(sub|dub)\/kiwi-(\d+)\/?$/);
      if (m) return await handleWatch(m[1], m[2], m[3]);
      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },
};
