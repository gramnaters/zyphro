import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Player } from '../components/Watch/Video/Player';
import {
  fetchAnimeData,
  fetchAnimeEpisodes,
  fetchAnimeProviders,
  fetchAnimeStreamingLinks,
} from '../hooks/useApi';
import { Ic, type IconName } from '../live/Icon';
import { LiveSelect, type SelectOption } from '../live/Select';
import {
  displayStatus,
  episodeCount,
  formatDate,
  GenreTag,
  infoHref,
  Rail,
  Seasons,
  SideList,
  titleOf,
  watchHref,
} from '../live/parts';

type Ep = {
  id: string;
  number: number;
  title?: string;
  description?: string;
  image?: string;
  airDate?: string;
  isFiller?: boolean;
};

type ProviderInfo = { name: string; title?: string; sub: number; dub: number };

const SERVER_LABELS: Record<string, string> = {
  reanime: 'Reanime',
  aniwaves: 'AniWaves',
  anikoto: 'AniKoto',
  mkissa: 'MKissa',
  animegg: 'AnimeGG',
  animenosub: 'AnimeNoSub',
  anizone: 'AniZone',
  kaa: 'Kickassanime',
  kickassanime: 'Kickassanime',
  animedunya: 'AnimeDunya',
  animeonsen: 'AnimeOnsen',
  anipm: 'Ani.pm',
  senshi: 'Senshi',
  kiwi: 'kiwi',
};

const serverLabel = (name: string) => SERVER_LABELS[name] || name.slice(0, 4);
const DEFAULT_SERVER = 'reanime';

type EpisodeLayout = 'grid' | 'list' | 'imageList';

// Live listLayout "auto" (Seasons bundle Ar()):
// 1 episode, or still loading → image rows
// no thumbnails at all → title rows
// more than 26 episodes → number grid
// more than one distinct thumbnail → image rows
// more than one distinct title → title rows
// otherwise number grid
function autoEpisodeLayout(episodes: { image?: string | null; title?: string | null }[]): EpisodeLayout {
  if (episodes.length <= 1) return 'imageList';
  const thumbs = episodes.map((e) => e.image || '');
  if (thumbs.every((t) => !t)) return 'list';
  if (episodes.length > 26) return 'grid';
  if (new Set(thumbs.filter(Boolean)).size > 1) return 'imageList';
  if (new Set(episodes.map((e) => e.title || '')).size > 1) return 'list';
  return 'grid';
}

function nextEpisodeLayout(mode: EpisodeLayout): EpisodeLayout {
  return mode === 'grid' ? 'list' : mode === 'list' ? 'imageList' : 'grid';
}

function stripHtml(value?: string | null) {
  return (value || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function slugTitle(slug?: string) {
  if (!slug) return '';
  return decodeURIComponent(slug)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const readBool = (k: string, d: boolean) => {
  const v = localStorage.getItem(k);
  return v === null ? d : v === 'true';
};

function timeUntil(sec: number) {
  let s = Math.max(0, sec - Date.now() / 1000);
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function airingDate(sec: number) {
  const d = new Date(sec * 1000);
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${mon} ${d.getDate()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function useMediaQuery(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const fn = () => setM(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [q]);
  return m;
}

function ToolbarToggle({
  label,
  title,
  on,
  onClick,
  accent,
  hideOnMobile,
  icon,
}: {
  label: string;
  title?: string;
  on: boolean;
  onClick: () => void;
  accent?: boolean;
  hideOnMobile?: boolean;
  icon?: IconName;
}) {
  // Live: Autoplay/Auto Skip/Auto Next are aria-pressed toggles with a square (off) or
  // check (on) glyph; Shortcuts and Lights Off carry their own icon and no pressed state.
  return (
    <button
      type='button'
      className={`_playerMenuButton_ncfvu_1${hideOnMobile ? ' _hideOnMobile_ncfvu_60' : ''}`}
      {...(icon ? {} : { 'aria-pressed': on })}
      title={title}
      {...(on ? { 'data-pressed': '' } : {})}
      {...(accent ? { 'data-accent': 'true' } : {})}
      onClick={onClick}
    >
      <Ic n={icon || (on ? 'check' : 'square')} />
      {label}
    </button>
  );
}

// Live skeletons shown before the player / episode list have data.
function PlayerSkeleton({ theater }: { theater: boolean }) {
  return (
    <div className='_skeletonContainer_1crhh_5'>
      <div className={`_playerSkeletonContainer_1crhh_10 _pulse_1xqvg_5${theater ? ' _theaterMode_1crhh_18' : ''}`} />
      <div className='_playerButtonsContainer_1crhh_21' />
    </div>
  );
}

function EpisodeListSkeleton({ grid }: { grid: boolean }) {
  return (
    <div className={`_container_3xcbe_5${grid ? ' _gridMode_3xcbe_22' : ''}`} aria-hidden='true'>
      {Array.from({ length: grid ? 24 : 6 }, (_, i) => (
        <div key={i} className='_item_3xcbe_10' style={{ animationDelay: `0s, ${i * 40}ms` }}>
          {!grid && <div className='_imageWrapper_3xcbe_25' />}
          {!grid && (
            <div className='_textWrapper_3xcbe_32 _imageListTextWrapper_3xcbe_40'>
              <div className='_imageListTextLoader_3xcbe_47' />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EpisodeList({
  episodes,
  current,
  anime,
  dub,
  loading,
  onSelect,
}: {
  episodes: Ep[];
  current?: Ep;
  anime: any;
  dub: boolean;
  loading: boolean;
  onSelect: (e: Ep) => void;
}) {
  const [filter, setFilter] = useState('');
  // Stored value is the old "show spoilers" flag. Missing means show the thumbnail, which is the official default.
  const [hideSpoilerSetting, setHideSpoilerSetting] = useState(() => {
    const raw = localStorage.getItem('miruro:episodes:spoilers');
    return raw != null && raw !== 'true';
  });
  const [picked, setPicked] = useState<{ id: string; mode: EpisodeLayout } | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());
  const animeKey = String(anime?.id || '');
  const mode: EpisodeLayout =
    picked && picked.id === animeKey ? picked.mode : episodes.length ? autoEpisodeLayout(episodes) : 'imageList';
  const [range, setRange] = useState(0);
  const watched = useMemo(() => JSON.parse(localStorage.getItem('all_episode_times') || '{}'), [current?.id]);

  const PAGE = 100;
  const ranges = Math.ceil(episodes.length / PAGE);
  const visible = episodes
    .filter((e) => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      return String(e.number).includes(q) || (e.title || '').toLowerCase().includes(q);
    })
    .slice(filter ? 0 : range * PAGE, filter ? undefined : (range + 1) * PAGE);

  useEffect(() => {
    if (current) setRange(Math.floor(episodes.indexOf(current) / PAGE) || 0);
  }, [current?.id, episodes.length]);

  useEffect(() => {
    // Scroll only the list's own viewport, never the page.
    const list = document.getElementById('episodes-list-container');
    const el = list?.querySelector<HTMLElement>(`[data-episode-number="${current?.number}"]`);
    if (!list || !el) return;
    const top = el.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: Math.max(0, top - list.clientHeight / 2 + el.offsetHeight / 2) });
    }
  }, [current?.id, episodes.length]);

  const first = episodes[range * PAGE]?.number ?? 0;
  const last = episodes[Math.min(episodes.length, (range + 1) * PAGE) - 1]?.number ?? 0;
  const next = anime?.nextAiringEpisode;
  const layoutClass = mode === 'grid' ? '_gridLayout_g5y00_28' : '_rowLayout_g5y00_25';
  const layoutIcon = mode === 'grid' ? 'th' : mode === 'list' ? 'list' : 'image';

  return (
    <div className='_listContainer_g5y00_1 _panel_1vrzc_1'>
      <div className='_container_og7xl_1'>
        {ranges > 1 ? (
          <select
            className='_intervalLabel_og7xl_19 _interval_og7xl_8'
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
          >
            {Array.from({ length: ranges }, (_, i) => (
              <option key={i} value={i}>
                {episodes[i * PAGE].number} - {episodes[Math.min(episodes.length, (i + 1) * PAGE) - 1].number}
              </option>
            ))}
          </select>
        ) : (
          <div className='_intervalLabel_og7xl_19 _interval_og7xl_8'>
            {episodes.length ? `${first} - ${last}` : '–'}
          </div>
        )}
        <div className='_filterContainer_og7xl_29'>
          <span className='_icon_og7xl_57'>
            <Ic n='searchSolid' />
          </span>
          <input
            className='_filterInput_og7xl_47'
            type='text'
            placeholder='Filter episodes...'
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <button
          type='button'
          className='_filledAction_1aum1_22 _buttonBase_og7xl_23'
          title='Toggle Spoilers'
          aria-label='Hide episode spoilers'
          aria-pressed={hideSpoilerSetting}
          onClick={() => {
            const next = !hideSpoilerSetting;
            localStorage.setItem('miruro:episodes:spoilers', String(!next));
            setHideSpoilerSetting(next);
          }}
        >
          <Ic n='eye' />
        </button>
        <button
          type='button'
          className='_filledAction_1aum1_22 _buttonBase_og7xl_23'
          title='Switch episode layout'
          aria-label='Switch episode layout'
          onClick={() => setPicked({ id: animeKey, mode: nextEpisodeLayout(mode) })}
        >
          <Ic n={layoutIcon} />
        </button>
      </div>
      <div className={`_episodeGrid_g5y00_16 ${layoutClass}`} id='episodes-list-container'>
        {loading && !episodes.length && <EpisodeListSkeleton grid={mode === 'grid'} />}
        {!loading && !episodes.length && (
          <div style={{ padding: '1rem', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
            No episodes available on this server.
          </div>
        )}
        {visible.map((ep) => {
          const sel = ep.id === current?.id;
          const isWatched = !!watched[ep.id] && watched[ep.id].playbackPercentage > 85;
          const title = ep.title && !/^episode \d+$/i.test(ep.title) ? ep.title : `Episode ${ep.number}`;
          const hideSpoiler = hideSpoilerSetting && !sel && !isWatched;
          if (mode === 'list') {
            const label = `EP ${ep.number}: ${title}`;
            return (
              <button
                key={ep.id}
                type='button'
                className='_root_ikggb_1 animFadeIn _rowLayout_ikggb_61'
                data-episode-number={ep.number}
                data-layout='list'
                data-selected={sel}
                data-watched={isWatched}
                data-filler={!!ep.isFiller}
                title={label}
                aria-label={label}
                onClick={() => onSelect(ep)}
              >
                <div className='_link_ikggb_82'>
                  <div className='_listContent_ikggb_91'>
                    <div className='_listTitleGroup_ikggb_119'>
                      <div>
                        {sel ? (
                          <Ic n='play' />
                        ) : (
                          <span className='_episodeNumber_ikggb_189 _episodeNumberStrong_ikggb_197'>{ep.number}.</span>
                        )}
                      </div>
                      <span className='_episodeNumber_ikggb_189'>{title}</span>
                    </div>
                    <span className='_metaIcons_ikggb_89'>
                      <Ic n='sub' />
                      {dub && <Ic n='mic' />}
                    </span>
                  </div>
                </div>
              </button>
            );
          }
          if (mode === 'grid') {
            const label = `EP ${ep.number}: ${title}`;
            return (
              <button
                key={ep.id}
                type='button'
                className='_root_ikggb_1 animFadeIn'
                data-episode-number={ep.number}
                data-layout='grid'
                data-selected={sel}
                data-watched={isWatched}
                data-filler={!!ep.isFiller}
                title={label}
                aria-label={label}
                onClick={() => onSelect(ep)}
              >
                <div className='_link_ikggb_82'>
                  <div className='_gridContent_ikggb_90'>
                    {sel ? <Ic n='play' /> : <span className='_episodeNumber_ikggb_189'>{ep.number}</span>}
                  </div>
                </div>
              </button>
            );
          }
          return (
            <button
              key={ep.id}
              type='button'
              className='_root_ikggb_1 animFadeIn _rowLayout_ikggb_61'
              data-episode-number={ep.number}
              data-layout='imageList'
              data-selected={sel}
              data-watched={isWatched}
              data-filler={!!ep.isFiller}
              onClick={() => onSelect(ep)}
            >
              <div className='_link_ikggb_82'>
                <div className='_imageListContent_ikggb_87'>
                  <div className='_imageWrapper_ikggb_124'>
                    {ep.image && !brokenImages.has(ep.id) ? (
                      <img
                        className={`_image_1r2hh_1 _image_ikggb_87${hideSpoiler ? ' _spoilerHidden_ikggb_156' : ''}`}
                        src={ep.image}
                        alt={hideSpoiler ? `EP ${ep.number}` : `EP ${ep.number} titled '${title}'`}
                        loading='lazy'
                        decoding='async'
                        referrerPolicy='no-referrer'
                        onLoad={(e) => e.currentTarget.setAttribute('data-loaded', 'true')}
                        onError={() => setBrokenImages((prev) => {
                          const next = new Set(prev);
                          next.add(ep.id);
                          return next;
                        })}
                      />
                    ) : (
                      <div className='_imageFallback_ikggb_146'>{ep.number}</div>
                    )}
                    {ep.image && !brokenImages.has(ep.id) && (
                      <div className={`_spoilerOverlay_ikggb_159${hideSpoiler ? ' _isVisible_ikggb_174' : ''}`}>HIDDEN SPOILER</div>
                    )}
                    <span className='_label_ikggb_177'>EP {ep.number}</span>
                  </div>
                  <div className='_descriptionWrapper_ikggb_200'>
                    <div className='_imageListHeader_ikggb_88'>
                      <span className='_episodeNumber_ikggb_189 _episodeNumberStrong_ikggb_197'>{title}</span>
                    </div>
                    {ep.description && !hideSpoiler && (
                      <div className='_description_ikggb_200'>{stripHtml(ep.description)}</div>
                    )}
                    <div className='_imageListFooter_ikggb_224'>
                      <span className='_metaIcons_ikggb_89'>
                        <Ic n='sub' />
                        {dub && <Ic n='mic' />}
                      </span>
                      {ep.airDate && <span className='_airDate_ikggb_230'>{formatDate(ep.airDate)}</span>}
                    </div>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {next?.airingTime && (
        <div className='_listFooter_g5y00_31'>
          <div className='_airingText_b0esg_1'>
            <Ic n='bell' className='_inlineIcon_b0esg_19' />
            <strong>Episode {next.episode}</strong> in <strong>{timeUntil(next.airingTime)}</strong>{' '}
            <span className='_airingDate_b0esg_5'>· {airingDate(next.airingTime)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <strong>
      <Link className='_animeStatsLink_1ix17_15' to={to}>
        {children}
      </Link>
    </strong>
  );
}

function DetailsCard({ anime }: { anime: any }) {
  const [closed, setClosed] = useState(true);
  const title = titleOf(anime);
  const romaji = anime?.title?.romaji;
  const status = displayStatus(anime?.status);
  const start = anime?.startDate;
  const end = anime?.endDate;
  const dateStr = (d: any) =>
    d?.year
      ? new Date(d.year, (d.month || 1) - 1, d.day || 1).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : '—';
  const season = anime?.season ? `${anime.season[0]}${anime.season.slice(1).toLowerCase()} ${anime.releaseDate || start?.year || ''}` : '';
  const trailer = anime?.trailer?.id;
  const desc = (anime?.description || '').replace(/<[^>]+>/g, '');

  return (
    <div className='_root_q5van_1 animFadeIn'>
      <div className='_detailsCard_q5van_9 _panel_1vrzc_1' {...(closed ? { 'data-closed': '' } : {})}>
        <div className='_coverContainer_1k9i7_68'>
          <div className='_coverWrapper_1k9i7_74'>
            <div className='_coverImageContainer_1k9i7_79'>
              <Link className='_infoLink_1k9i7_31' to={infoHref(anime)}>
                <img
                  className='_coverImg_1k9i7_9'
                  src={anime?.image}
                  alt={title}
                  onLoad={(e) => e.currentTarget.setAttribute('data-loaded', 'true')}
                />
                <Ic n='expand' className='_hoverIcon_1k9i7_50' />
              </Link>
            </div>
            <div className='_actionsRow_1k9i7_26'>
              {trailer && (
                <a
                  className='_outlinedAction_1aum1_1 _trailerButton_1k9i7_1'
                  href={`https://www.youtube.com/watch?v=${trailer}`}
                  target='_blank'
                  rel='noreferrer'
                >
                  TRAILER
                </a>
              )}
              <button type='button' className='_addButton_1m9nu_31' aria-label='Add to list'>
                <Ic n='plus' />
              </button>
            </div>
            <div className='_externalLinksContainer_1k9i7_82'>
              <a
                className='_accountLink_1ix17_1 _outlinedAction_1aum1_1'
                href={`https://anilist.co/anime/${anime?.id}`}
                target='_blank'
                rel='noreferrer'
                title='AniList'
              >
                <Ic n='anilist' size='1.2rem' />
              </a>
              {anime?.malId && (
                <a
                  className='_accountLink_1ix17_1 _outlinedAction_1aum1_1'
                  href={`https://myanimelist.net/anime/${anime.malId}`}
                  target='_blank'
                  rel='noreferrer'
                  title='MyAnimeList'
                >
                  <Ic n='mal' size='1.2rem' />
                </a>
              )}
            </div>
          </div>
        </div>
        <div className='_txtWrap_1g50l_1'>
          <h1 className='_title_1g50l_9'>
            <Link className='_infoLink_1g50l_35' to={infoHref(anime)}>
              {title}
            </Link>
          </h1>
          {romaji && romaji !== title && (
            <p className='_romajiTitle_1g50l_56' style={{ '--romaji-color': anime?.color } as any}>
              {romaji}
            </p>
          )}
          <div className='_genreContainer_1g50l_48'>
            {(anime?.genres || []).map((g: string) => (
              <GenreTag key={g} to={`/search?genres=${encodeURIComponent(g)}`}>
                {g}
              </GenreTag>
            ))}
          </div>
          {desc && (
            <p className='_description_1g50l_19' onClick={() => setClosed(!closed)}>
              <span className='_moreBtn_1g50l_22'>{desc}</span>
            </p>
          )}
          <div className='_statsGrid_iipjt_7'>
            <div className='_statsColumn_iipjt_1'>
              {anime?.type && (
                <div className='_statRow_iipjt_11'>
                  Format: <StatLink to={`/search?format=${anime.type}&sort=-popularity`}>{anime.type}</StatLink>
                </div>
              )}
              <div className='_statRow_iipjt_11'>
                Status: <StatLink to={`/search?status=${anime?.status}&sort=-popularity`}>{status}</StatLink>
              </div>
              <div className='_statRow_iipjt_11'>
                Episodes: <strong>{anime?.totalEpisodes || episodeCount(anime) || '?'}</strong>
              </div>
              {anime?.rating && (
                <div className='_statRow_iipjt_11'>
                  Rating: <strong>{anime.rating}</strong>/100
                </div>
              )}
              {anime?.duration && (
                <div className='_statRow_iipjt_11 _statRowDesktopOnly_iipjt_28'>
                  Duration: <strong>{anime.duration} min</strong>
                </div>
              )}
              {season && (
                <div className='_statRow_iipjt_11 _statRowDesktopOnly_iipjt_28'>
                  Season:{' '}
                  <StatLink to={`/search?season=${anime.season}&season_year=${anime.releaseDate || start?.year}`}>
                    {season}
                  </StatLink>
                </div>
              )}
            </div>
            <div className='_statsColumn_iipjt_1'>
              <div className='_statRow_iipjt_11'>
                Start Date: <strong>{dateStr(start)}</strong>
              </div>
              <div className='_statRow_iipjt_11'>
                End Date: <strong>{dateStr(end)}</strong>
              </div>
              {anime?.countryOfOrigin && (
                <div className='_statRow_iipjt_11'>
                  Country: <strong>{anime.countryOfOrigin}</strong>
                </div>
              )}
              <div className='_statRow_iipjt_11'>
                Adult: <strong>{anime?.isAdult ? 'Yes' : 'No'}</strong>
              </div>
              {anime?.studios?.length > 0 && (
                <div className='_statRow_iipjt_11'>
                  Studios: <strong>{anime.studios.join(', ')}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Watch() {
  const { animeId = '', episodeNumber: pathEpisode, slug, animeTitle: titleSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const epParam = searchParams.get('ep') || pathEpisode;

  const [anime, setAnime] = useState<any>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [dub, setDub] = useState(() => localStorage.getItem('miruro:watch:audio') === 'dub');
  const [provider, setProvider] = useState(() => {
    const saved = localStorage.getItem('miruro:watch:server') || DEFAULT_SERVER;
    if (saved === 'bun') return 'anikoto';
    if (saved === 'cog') return 'animegg';
    return saved;
  });
  const [episodes, setEpisodes] = useState<Ep[]>([]);
  const [loadingEps, setLoadingEps] = useState(true);
  const [autoPlay, setAutoPlay] = useState(() => readBool('autoPlay', true));
  const [autoSkip, setAutoSkip] = useState(() => readBool('autoSkip', false));
  const [autoNext, setAutoNext] = useState(() => readBool('autoNext', true));
  const [lightsOff, setLightsOff] = useState(false);
  const [theater, setTheater] = useState(false);
  const [download, setDownload] = useState('');
  const [shortcuts, setShortcuts] = useState(false);

  const toggle = (key: string, v: boolean, set: (b: boolean) => void) => {
    localStorage.setItem(key, String(!v));
    set(!v);
  };

  const [providersLoaded, setProvidersLoaded] = useState(false);
  const syncingProvider = useRef(false);
  const narrow = useMediaQuery('(max-width: 999px)');

  // Everything fires in parallel on page entry (like live): metadata, the provider scan,
  // and the episode list for the remembered server. Nothing waits on the provider scan.
  useEffect(() => {
    let alive = true;
    setAnime(null);
    setProviders([]);
    setProvidersLoaded(false);
    setEpisodes([]);
    const saved = localStorage.getItem('miruro:watch:server') || DEFAULT_SERVER;
    setProvider(saved === 'bun' ? 'anikoto' : saved === 'cog' ? 'animegg' : saved);
    window.scrollTo(0, 0);
    fetchAnimeData(animeId).then((a) => alive && setAnime(a)).catch(() => {});
    fetchAnimeProviders(animeId)
      .then(async (res: any) => {
        if (!alive) return;
        const list: ProviderInfo[] = res?.results || [];
        setProviders(list);
        if (!res?.partial) return;
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!alive) return;
        const again = await fetchAnimeProviders(animeId).catch(() => null);
        if (alive && Array.isArray(again?.results)) setProviders(again.results);
      })
      .catch(() => {})
      .finally(() => alive && setProvidersLoaded(true));
    return () => {
      alive = false;
    };
  }, [animeId]);

  const available = providers.filter((p) => (dub ? p.dub : p.sub) > 0);

  // True once the provider scan finished and no scraper carries this title at all.
  const noServers = providersLoaded && !providers.length;

  // Once the scan is in, only move off the current server if it has no episodes for this audio.
  useEffect(() => {
    if (!providersLoaded || loadingEps) return;
    if (episodes.length && (!providers.length || available.some((p) => p.name === provider))) return;
    if (episodes.length && !available.length) return;
    const pick = available.find((p) => p.name !== provider) || available[0];
    if (pick && pick.name !== provider) setProvider(pick.name);
    else if (!episodes.length && dub && providers.some((p) => p.sub > 0)) setDub(false);
  }, [providersLoaded, loadingEps, episodes.length, dub]);

  useEffect(() => {
    if (!provider) return;
    if (syncingProvider.current) {
      syncingProvider.current = false;
      return;
    }
    let alive = true;
    setLoadingEps(true);
    fetchAnimeEpisodes(animeId, provider, dub)
      .then((res: any) => {
        if (!alive) return;
        const list: Ep[] = (Array.isArray(res) ? res : res?.episodes || []).sort(
          (a: Ep, b: Ep) => a.number - b.number,
        );
        setEpisodes(list);
        // The shim falls back to another provider when the requested one has nothing;
        // the episode id carries the provider that actually answered.
        const actual = list[0]?.id?.match(/^(.+?)-(sub|dub)-anilist/)?.[1];
        if (actual && actual !== provider) {
          syncingProvider.current = true;
          setProvider(actual);
        }
      })
      .catch(() => alive && setEpisodes([]))
      .finally(() => alive && setLoadingEps(false));
    return () => {
      alive = false;
    };
  }, [animeId, provider, dub]);

  const current = useMemo(() => {
    if (!episodes.length) return undefined;
    return episodes.find((e) => String(e.number) === String(epParam)) || episodes[0];
  }, [episodes, epParam]);

  const idx = current ? episodes.indexOf(current) : -1;
  const prev = idx > 0 ? episodes[idx - 1] : undefined;
  const next = idx >= 0 && idx < episodes.length - 1 ? episodes[idx + 1] : undefined;

  const select = (ep?: Ep) => {
    if (!ep) return;
    const p = new URLSearchParams(searchParams);
    p.set('ep', String(ep.number));
    setSearchParams(p, { replace: false });
  };

  useEffect(() => {
    if (!current || !anime) return;
    const t = titleOf(anime);
    document.title = `Watch ${t} Episode ${current.number} - Miruro`;
    const hist = JSON.parse(localStorage.getItem('miruro:history') || '[]').filter((h: any) => h.id !== anime.id);
    hist.unshift({ id: anime.id, title: anime.title, image: anime.image, episode: current.number, at: Date.now() });
    localStorage.setItem('miruro:history', JSON.stringify(hist.slice(0, 100)));
  }, [current?.id, anime?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea')) return;
      if (e.shiftKey && e.key.toLowerCase() === 'n') select(next);
      if (e.shiftKey && e.key.toLowerCase() === 'p') select(prev);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  const audioOptions: SelectOption[] = [
    { value: 'sub', label: 'Sub' },
    ...(providers.some((p) => p.dub > 0) ? [{ value: 'dub', label: 'Dub' }] : []),
  ];

  const serverOptions: SelectOption[] = available.map((p) => ({
    value: p.name,
    label: serverLabel(p.name),
    tags: [dub ? { text: 'dub' } : { text: 'sub' }],
  }));

  const currentProvider = providers.find((p) => p.name === provider);

  const share = () => {
    const url = window.location.href;
    if (navigator.share) navigator.share({ title: document.title, url }).catch(() => {});
    else navigator.clipboard?.writeText(url);
  };

  // Episode ids are deterministic, so the player can start before the episode list returns.
  const epNum = Number(epParam) || 1;
  // Stay on the server the viewer picked. The list's id can name a fallback provider,
  // and swapping it remounts the player after the first stream has already started.
  const playId = provider
    ? `${provider}-${dub ? 'dub' : 'sub'}-anilist${animeId}-episode-${epNum}`
    : '';
  const playNumber = current?.number || epNum;
  const isMovie = String(anime?.type || '').toUpperCase() === 'MOVIE';
  const movieTitle = anime ? titleOf(anime) : '';
  const epTitle = isMovie
    ? movieTitle
    : current?.title && !/^episode \d+$/i.test(current.title) ? current.title : `Episode ${playNumber}`;
  const showEpisodePanel = !isMovie && (!!anime || episodes.length > 1);

  useEffect(() => {
    if (playId) fetchAnimeStreamingLinks(playId).catch(() => {});
  }, [playId]);

  const showPlayerSkeleton = !playId;

  // Live renders this column under the player on narrow screens (≤999px) and in the
  // data area next to the details card on wider ones.
  const infoColumn = (
    <div className='_container_1xi8j_1'>
      <div className='_infoColumn_1xi8j_7 _panel_1vrzc_1 animFadeIn'>
        <div className='_titleRow_1bozs_1'>
          <div className='_titleContainer_1bozs_10'>
            {!loadingEps && !episodes.length ? (
              <span>No episodes</span>
            ) : (
              <>
                <span className='_episodeNumber_1bozs_15'>{playNumber}.&nbsp;</span>
                <span>{epTitle}</span>
              </>
            )}
          </div>
          {providers.length > 0 && (
            <div className='_dropdownStack_1bozs_29'>
              <div className='_dropdownLabels_1bozs_36'>
                <span className='_dropdownLabel_1bozs_36'>
                  <span className='_dropdownLabelIcon_1bozs_57'>
                    <Ic n='headphones' />
                  </span>
                  AUDIO
                </span>
                <span className='_dropdownLabel_1bozs_36'>
                  <span className='_dropdownLabelIcon_1bozs_57'>
                    <Ic n='server' />
                  </span>
                  SERVER ({serverOptions.length})
                </span>
              </div>
              <div className='_dropdownGroup_1bozs_61'>
                <LiveSelect
                  label='Language'
                  icon={dub ? 'mic' : 'sub'}
                  value={dub ? 'dub' : 'sub'}
                  options={audioOptions}
                  onChange={(v) => {
                    localStorage.setItem('miruro:watch:audio', v);
                    setDub(v === 'dub');
                  }}
                />
                <div className='_divider_1bozs_71' />
                <LiveSelect
                  label='Server'
                  icon='bolt'
                  value={provider}
                  options={serverOptions}
                  onChange={(v) => {
                    localStorage.setItem('miruro:watch:server', v);
                    setProvider(v);
                  }}
                />
              </div>
            </div>
          )}
        </div>
        <div className='_tagRowGroup_1bozs_18'>
          <div className='_tagRow_1bozs_18'>
            {current?.airDate && (
              <time className='_linkButton_1bozs_76 _dateButton_1bozs_100 date' dateTime={current.airDate}>
                <Ic n='calendar' />
                {formatDate(current.airDate)}
              </time>
            )}
            {currentProvider && (
              <Rail
                sub={currentProvider.sub}
                dub={currentProvider.dub}
                className='_episodeTrackRail_1bozs_132 _outlined_mpnb7_39'
              />
            )}
          </div>
          <div className='_tagRow_1bozs_18 _alignEnd_1bozs_148'>
            <button
              type='button'
              className='_linkButton_1bozs_76'
              disabled={!download}
              style={download ? undefined : { opacity: 0.4, cursor: 'default' }}
              onClick={() => download && window.open(download, '_blank', 'noopener')}
            >
              <Ic n='download' />
              Download
            </button>
            <button type='button' className='_linkButton_1bozs_76' onClick={share}>
              <Ic n='share' />
              Share
            </button>
          </div>
        </div>
        {current?.description && (
          <>
            <hr className='_descriptionDivider_1bozs_141' />
            <div className='_description_1bozs_135'>{stripHtml(current.description)}</div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className='_watchContainer_1r1p2_1'>
      <div className='_watchWrapper_1r1p2_7' data-theater-mode={theater}>
        <div className='_playerContainer_1r1p2_41' id='player-container'>
          {showPlayerSkeleton ? (
            <PlayerSkeleton theater={theater} />
          ) : (
          <div className={`_wrapper_1fg54_1 _wrapper_3rsvh_1${lightsOff ? ' _dimmed_1fg54_5' : ''}`}>
            {lightsOff && <div className='_overlay_1fg54_22' onClick={() => setLightsOff(false)} />}
            <div className='_stage_1fg54_42 _ratio_3rsvh_6' data-theater-mode={theater}>
              {playId && !noServers ? (
                <Player
                  key={playId}
                  className='_frame_1fg54_17'
                  episodeId={playId}
                  episodeNumber={playNumber}
                  banner={current?.image || anime?.cover}
                  logo={anime?.logo}
                  malId={anime?.malId ? String(anime.malId) : undefined}
                  animeTitle={anime ? titleOf(anime) : slugTitle(slug || titleSlug)}
                  autoPlay={autoPlay}
                  autoSkip={autoSkip}
                  autoNext={autoNext}
                  theater={theater}
                  hasNext={!!next}
                  onTheater={() => setTheater(!theater)}
                  onNext={() => select(next)}
                  onEnded={() => select(next)}
                  onDownloadLink={setDownload}
                />
              ) : (
                <div className='_frame_1fg54_17 _loadingOverlay_ncfvu_40' style={{ position: 'relative' }}>
                  <div className='_errorContainer_4l2h5_51'>
                    <div className='_errorMessage_4l2h5_70'>NO EPISODES AVAILABLE</div>
                  </div>
                </div>
              )}
            </div>
            <div
              role='toolbar'
              aria-label='Playback controls'
              aria-orientation='horizontal'
              data-orientation='horizontal'
              className='_playerMenu_ncfvu_1 _panel_1vrzc_1'
            >
              <ToolbarToggle label='Autoplay' title='Self Explanatory' on={autoPlay} onClick={() => toggle('autoPlay', autoPlay, setAutoPlay)} />
              <ToolbarToggle label='Auto Skip' on={autoSkip} accent onClick={() => toggle('autoSkip', autoSkip, setAutoSkip)} />
              <ToolbarToggle label='Auto Next' on={autoNext} onClick={() => toggle('autoNext', autoNext, setAutoNext)} />
              <ToolbarToggle label='Shortcuts' icon='cmd' on={shortcuts} hideOnMobile onClick={() => setShortcuts(!shortcuts)} />
              <ToolbarToggle label='Lights Off' icon='bulb' on={lightsOff} hideOnMobile onClick={() => setLightsOff(!lightsOff)} />
              <button
                type='button'
                className='_playerMenuButton_ncfvu_1 _epNav_jfqap_1'
                disabled={!prev}
                {...(!prev ? { 'data-disabled': '' } : {})}
                onClick={() => select(prev)}
              >
                <Ic n='prev' />
                {prev ? (
                  <>
                    <span className='_epShort_jfqap_4'>EP {prev.number}</span>
                    <span className='_epLong_jfqap_7'>Episode {prev.number}</span>
                  </>
                ) : (
                  'Prev'
                )}
              </button>
              <button
                type='button'
                className='_playerMenuButton_ncfvu_1 _epNav_jfqap_1'
                disabled={!next}
                {...(!next ? { 'data-disabled': '' } : {})}
                onClick={() => select(next)}
              >
                {next ? (
                  <>
                    <span className='_epShort_jfqap_4'>EP {next.number}</span>
                    <span className='_epLong_jfqap_7'>Episode {next.number}</span>
                  </>
                ) : (
                  'Next'
                )}
                <Ic n='next' />
              </button>
            </div>
            {shortcuts && (
              <div className='_panel_1vrzc_1' style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', lineHeight: 1.7 }}>
                <strong>Space</strong> play/pause · <strong>←/→</strong> seek · <strong>↑/↓</strong> volume · <strong>F</strong> fullscreen · <strong>M</strong> mute · <strong>C</strong> captions · <strong>Shift+N</strong> next · <strong>Shift+P</strong> previous
              </div>
            )}
          </div>
          )}
        </div>

        {narrow && infoColumn}

        {showEpisodePanel && (
        <div className='_epListContainer_1r1p2_48' data-episode-list=''>
          <EpisodeList
            episodes={episodes}
            current={current}
            anime={anime}
            dub={dub}
            loading={loadingEps}
            onSelect={select}
          />
        </div>
        )}
      </div>

      <div className='_dataWrapper_1r1p2_17'>
        <div className='_sourceAndData_1r1p2_28 animFadeIn'>
          {!narrow && infoColumn}
          {anime && <DetailsCard anime={anime} />}
        </div>
        <aside className='_sideSourceAndData_1r1p2_35'>
          {anime && <Seasons anime={anime} currentId={animeId} />}
          {anime?.recommendations?.length > 0 && (
            <SideList title='RECOMMENDATIONS' items={anime.recommendations} />
          )}
        </aside>
      </div>
      {!anime && !loadingEps && !providers.length && (
        <p style={{ textAlign: 'center' }}>
          Couldn't load this anime. <button onClick={() => navigate(0)}>Retry</button>
        </p>
      )}
    </div>
  );
}

export { watchHref };
