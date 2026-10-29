import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdvancedSearch } from '../hooks/useApi';
import { Ic } from '../live/Icon';
import { EditListButton, Rail, StatusDot, titleOf, watchHref } from '../live/parts';
import { prefetchWatch } from '../hooks/useApi';

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;
const PER_PAGE = 21;

function currentSeason(d = new Date()) {
  return SEASONS[Math.floor(d.getMonth() / 3)];
}

function compact(n?: number | null) {
  if (!n) return null;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

const loaded = (e: React.SyntheticEvent<HTMLImageElement>) =>
  e.currentTarget.setAttribute('data-loaded', 'true');

function ChartCard({ anime, index }: { anime: any; index: number }) {
  const title = titleOf(anime);
  const native = anime?.title?.native;
  const year = anime.releaseDate || anime.startDate?.year;
  const desc = (anime.description || '').replace(/<[^>]+>/g, '');
  const pop = compact(anime.popularity);
  const eps = anime.totalEpisodes || anime.currentEpisode || 0;
  const color = anime.color || undefined;
  return (
    <div
      title={title}
      aria-label={title}
      data-card-wrapper='true'
      className='_wrapper_b7dvv_1 animSlideUp _wrapper_1pdgb_1 _panel_1vrzc_1'
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      onPointerEnter={() => prefetchWatch(anime.id)}
    >
      {(anime.cover || anime.image) && (
        <img
          loading='lazy'
          decoding='async'
          alt=''
          className='_image_1r2hh_1 _backdrop_1pdgb_13'
          src={anime.cover || anime.image}
          onLoad={loaded}
        />
      )}
      <div className='_imageColumn_1pdgb_26'>
        <div className='_poster_1qjrp_3 _anichart_1qjrp_69'>
          <div className='_frame_1qjrp_9 animSlideUp' data-ready='true'>
            <div
              className='_imageWrapper_1qjrp_30'
              data-poster='true'
              style={color ? ({ '--card-image-hover-color': color } as any) : undefined}
            >
              <Link tabIndex={-1} className='_cardLink_b7dvv_10' to={watchHref(anime)}>
                <img
                  loading='lazy'
                  decoding='async'
                  alt={`Play ${title}`}
                  className='_image_1r2hh_1 _image_1qjrp_30'
                  data-ready='true'
                  src={anime.image}
                  onLoad={loaded}
                />
              </Link>
              <div className='_action_1qjrp_99'>
                <EditListButton />
              </div>
            </div>
          </div>
        </div>
        <div className='_linkRow_1pdgb_30'>
          <a
            className='_accountLink_1ix17_1 _outlinedAction_1aum1_1'
            href={`https://anilist.co/anime/${anime.id}`}
            target='_blank'
            rel='noreferrer'
            title='AniList'
          >
            <Ic n='anilist' />
          </a>
          {anime.malId && (
            <a
              className='_accountLink_1ix17_1 _outlinedAction_1aum1_1'
              href={`https://myanimelist.net/anime/${anime.malId}`}
              target='_blank'
              rel='noreferrer'
              title='MyAnimeList'
            >
              <Ic n='mal' />
            </a>
          )}
        </div>
      </div>
      <div className='_content_1pdgb_27'>
        <div className='_textGroup_1pdgb_28'>
          <h3 className='_titleSection_1pdgb_57'>
            <Link className='_cardLink_b7dvv_10' to={watchHref(anime)}>
              {title}
            </Link>
          </h3>
          {native && native !== title && (
            <i className='_subtitle_1pdgb_66' style={color ? { color } : undefined}>
              {native}
            </i>
          )}
          {desc && <p className='_desc_1pdgb_75'>{desc}</p>}
        </div>
        <div className='_metaGroup_1pdgb_29'>
          <div role='group' aria-label='Anime metadata' className='_cardDetails_xz3sm_1'>
            <StatusDot status={anime.status} />
            {anime.type && <div className='_cardDetail_xz3sm_1'>{anime.type}</div>}
            {year && <div className='_cardDetail_xz3sm_1'>{year}</div>}
            {pop && (
              <div className='_cardDetail_xz3sm_1 _hideOnMobile_xz3sm_38'>
                <Ic n='eye' />
                {pop}
              </div>
            )}
            {anime.rating ? (
              <div className='_cardDetail_xz3sm_1'>
                <Ic n='star' />
                {anime.rating}
              </div>
            ) : null}
            <Rail sub={eps} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Trending() {
  const now = new Date().getFullYear();
  const [season, setSeason] = useState<(typeof SEASONS)[number]>(currentSeason());
  const [year, setYear] = useState(now);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const years = Array.from({ length: now - 1979 + 1 }, (_, i) => now - i);
  const label = season[0] + season.slice(1).toLowerCase();

  useEffect(() => {
    document.title = `Trending Anime ${label} ${year} · Miruro`;
  }, [label, year]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchAdvancedSearch('', page, PER_PAGE, {
      season,
      year: String(year),
      sort: ['POPULARITY_DESC'],
    })
      .then((data: any) => {
        if (!alive) return;
        setItems(data?.results || []);
        setHasNext(!!data?.hasNextPage);
        setTotal(data?.totalResults || 0);
      })
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [season, year, page]);

  const from = items.length ? (page - 1) * PER_PAGE + 1 : 0;
  const to = (page - 1) * PER_PAGE + items.length;

  return (
    <div className='_exploreWrapper_u21mx_1 animFadeIn'>
      <h1 className='vh'>
        Trending Anime {label} {year}
      </h1>
      <div className='_trendingFilters_u21mx_12'>
        <div className='_trendingSeasonWrapper_u21mx_29'>
          {SEASONS.map((s, i) => (
            <span key={s} style={{ display: 'contents' }}>
              {i > 0 && <span className='_seasonDivider_u21mx_65'>/</span>}
              <button
                type='button'
                className='_seasonButton_u21mx_43'
                {...(s === season ? { 'data-checked': '' } : {})}
                onClick={() => {
                  setSeason(s);
                  setPage(1);
                }}
              >
                {s[0] + s.slice(1).toLowerCase()}
              </button>
            </span>
          ))}
        </div>
      </div>
      <div className='_yearSelectWrapper_u21mx_71' style={{ flexWrap: 'wrap', gap: '0.35rem 0.75rem' }}>
        {years.map((y) => (
          <button
            key={y}
            type='button'
            className='_seasonButton_u21mx_43'
            style={{ fontSize: '1rem', margin: 0 }}
            {...(y === year ? { 'data-checked': '' } : {})}
            onClick={() => {
              setYear(y);
              setPage(1);
            }}
          >
            {y}
          </button>
        ))}
      </div>
      <div className='_contentColumn_u21mx_76'>
        <div className='_cardGrid_u21mx_82'>
          {loading && !items.length
            ? Array.from({ length: 6 }, (_, i) => (
                <div key={i} className='_wrapper_1pdgb_1 _panel_1vrzc_1 _pulse_1xqvg_5' style={{ minHeight: '9rem' }} />
              ))
            : items.map((a, i) => <ChartCard key={a.id} anime={a} index={i} />)}
        </div>
      </div>
      <div className='_paginationContainer_u21mx_100'>
        <span>
          {total ? `Showing ${from} to ${to} out of ${total} results` : loading ? 'Loading…' : 'No results'}
        </span>
        <div className='_paginationControls_u21mx_108' style={{ display: 'flex', gap: '0.5rem' }}>
          <button type='button' className='_outlinedAction_1aum1_1' disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </button>
          <span>{page}</span>
          <button type='button' className='_outlinedAction_1aum1_1' disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
