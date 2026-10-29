import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchAdvancedSearch } from '../hooks/useApi';
import { FilterSelect, type FilterOption } from '../live/FilterSelect';
import { CardGrid } from '../live/parts';
import { SEARCH_TAGS } from '../live/searchTags';

const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Hentai', 'Horror', 'Mahou Shoujo',
  'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports',
  'Supernatural', 'Thriller',
].map((name) => ({ value: name, label: name }));

const FORMATS: FilterOption[] = [
  { value: '', label: 'Any Format' },
  { value: 'TV', label: 'TV' },
  { value: 'TV_SHORT', label: 'TV Short' },
  { value: 'MOVIE', label: 'Movie' },
  { value: 'SPECIAL', label: 'Special' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
  { value: 'MUSIC', label: 'Music' },
];

const STATUSES: FilterOption[] = [
  { value: '', label: 'Any Status' },
  { value: 'RELEASING', label: 'Releasing' },
  { value: 'FINISHED', label: 'Finished' },
  { value: 'NOT_YET_RELEASED', label: 'Not Yet Released' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'HIATUS', label: 'Hiatus' },
];

const SEASONS: FilterOption[] = [
  { value: '', label: 'Any Season' },
  { value: 'WINTER', label: 'Winter' },
  { value: 'SPRING', label: 'Spring' },
  { value: 'SUMMER', label: 'Summer' },
  { value: 'FALL', label: 'Fall' },
];

const SOURCES: FilterOption[] = [
  { value: '', label: 'Any Source' },
  { value: 'ORIGINAL', label: 'Original' },
  { value: 'MANGA', label: 'Manga' },
  { value: 'LIGHT_NOVEL', label: 'Light Novel' },
  { value: 'VISUAL_NOVEL', label: 'Visual Novel' },
  { value: 'NOVEL', label: 'Novel' },
  { value: 'WEB_NOVEL', label: 'Web Novel' },
  { value: 'VIDEO_GAME', label: 'Video Game' },
  { value: 'GAME', label: 'Game' },
  { value: 'ANIME', label: 'Anime' },
  { value: 'LIVE_ACTION', label: 'Live Action' },
  { value: 'COMIC', label: 'Comic' },
  { value: 'DOUJINSHI', label: 'Doujinshi' },
  { value: 'MULTIMEDIA_PROJECT', label: 'Multimedia Project' },
  { value: 'PICTURE_BOOK', label: 'Picture Book' },
  { value: 'OTHER', label: 'Other' },
];

const COUNTRIES: FilterOption[] = [
  { value: '', label: 'Any Country' },
  { value: 'JP', label: 'Japan' },
  { value: 'KR', label: 'South Korea' },
  { value: 'CN', label: 'China' },
  { value: 'TW', label: 'Taiwan' },
];

const SORTS: FilterOption[] = [
  { value: 'POPULARITY_DESC', label: 'Popularity' },
  { value: 'SCORE_DESC', label: 'Score' },
  { value: 'TRENDING_DESC', label: 'Trending' },
  { value: 'FAVOURITES_DESC', label: 'Favorites' },
  { value: 'START_DATE_DESC', label: 'Newest' },
  { value: 'EPISODES_DESC', label: 'Episodes' },
  { value: 'TITLE_ROMAJI', label: 'Title' },
];

const TAGS = SEARCH_TAGS.map((name) => ({ value: name, label: name }));

function readList(raw: string | null) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    /* single value or comma list */
  }
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function readSort(raw: string | null) {
  if (!raw || raw === '-popularity' || raw === 'popularity') return 'POPULARITY_DESC';
  if (raw === '-score' || raw === 'score') return 'SCORE_DESC';
  if (raw === '-trending' || raw === 'trending') return 'TRENDING_DESC';
  return raw;
}

function FilterIcon() {
  return (
    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" height="20" width="20" aria-hidden="true">
      <path d="M4.25 5.61C6.27 8.2 10 13 10 13v6c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-6s3.72-4.8 5.74-7.39A.998.998 0 0 0 18.95 4H5.04c-.83 0-1.3.95-.79 1.61" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20" width="20" aria-hidden="true">
      <path d="M256 388c-72.597 0-132-59.405-132-132 0-72.601 59.403-132 132-132 36.3 0 69.299 15.4 92.406 39.601L278 234h154V80l-51.698 51.702C348.406 99.798 304.406 80 256 80c-96.797 0-176 79.203-176 176s78.094 176 176 176c81.045 0 148.287-54.134 169.401-128H378.85c-18.745 49.561-67.138 84-122.85 84z" />
    </svg>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const query = params.get('query') || '';
  const thisYear = new Date().getFullYear();
  const years: FilterOption[] = [
    { value: '', label: 'Any year' },
    ...Array.from({ length: thisYear - 1939 }, (_, index) => {
      const year = String(thisYear - index);
      return { value: year, label: year };
    }),
  ];

  const [genres, setGenres] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [year, setYear] = useState('');
  const [season, setSeason] = useState('');
  const [format, setFormat] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [country, setCountry] = useState('');
  const [sort, setSort] = useState('POPULARITY_DESC');
  const [scoreMin, setScoreMin] = useState(0);
  const [scoreMax, setScoreMax] = useState(100);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<any[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setGenres(readList(params.get('genres') || params.get('genre')));
    setTags(readList(params.get('tag')));
    setYear(params.get('year') || params.get('season_year') || '');
    setSeason(params.get('season') || '');
    setFormat(params.get('format') || '');
    setStatus(params.get('status') || '');
    setSource(params.get('source') || '');
    setCountry(params.get('country') || '');
    setSort(readSort(params.get('sort')));
    setScoreMin(Number(params.get('scoreMin') || 0));
    setScoreMax(Number(params.get('scoreMax') || 100));
    setLoading(true);
    setPage(1);
    setItems([]);
  }, [params]);

  useEffect(() => {
    document.title = query ? `Search Results for "${query}" · Miruro` : 'Search · Miruro';
  }, [query]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const appliedGenres = readList(params.get('genres') || params.get('genre'));
    const appliedTags = readList(params.get('tag'));
    fetchAdvancedSearch(query, page, 18, {
      genres: appliedGenres,
      tags: appliedTags,
      year: params.get('year') || params.get('season_year') || '',
      season: params.get('season') || '',
      format: params.get('format') || '',
      status: params.get('status') || '',
      source: params.get('source') || '',
      country: params.get('country') || '',
      scoreMin: params.get('scoreMin') || '',
      scoreMax: params.get('scoreMax') || '',
      sort: [readSort(params.get('sort'))],
    })
      .then((data: any) => {
        if (!alive) return;
        const rows = data?.results || [];
        setItems((prev) => (page === 1 ? rows : [...prev, ...rows]));
        setHasNext(!!data?.hasNextPage);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err?.message || 'Search failed');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [params, page, query]);

  const apply = () => {
    const next = new URLSearchParams();
    if (query) next.set('query', query);
    if (genres.length) next.set('genres', JSON.stringify(genres));
    if (tags.length) next.set('tag', JSON.stringify(tags));
    if (year) next.set('year', year);
    if (season) next.set('season', season);
    if (format) next.set('format', format);
    if (status) next.set('status', status);
    if (source) next.set('source', source);
    if (country) next.set('country', country);
    if (scoreMin > 0) next.set('scoreMin', String(scoreMin));
    if (scoreMax < 100) next.set('scoreMax', String(scoreMax));
    if (sort && sort !== 'POPULARITY_DESC') next.set('sort', sort);
    setPage(1);
    setItems([]);
    setParams(next);
  };

  const reset = () => {
    setGenres([]);
    setTags([]);
    setYear('');
    setSeason('');
    setFormat('');
    setStatus('');
    setSource('');
    setCountry('');
    setSort('POPULARITY_DESC');
    setScoreMin(0);
    setScoreMax(100);
    setPage(1);
    setItems([]);
    setParams(new URLSearchParams(), { replace: true });
  };

  return (
    <div className='_container_15hzj_1'>
      <h1 className='vh'>{query ? `Search Results for "${query}"` : 'Search'}</h1>
      <div className='_filterContainer_1c5y2_1'>
        <FilterSelect label="Genres" placeholder="Select Genres" options={GENRES} multiple value={genres} onChange={(value) => setGenres(value as string[])} />
        <FilterSelect label="Tags" placeholder="Select Tags" options={TAGS} multiple value={tags} onChange={(value) => setTags(value as string[])} />
        <FilterSelect label="Year" placeholder="Any year" options={years} value={year} onChange={(value) => setYear(value as string)} />
        <FilterSelect label="Status" placeholder="Any Status" options={STATUSES} value={status} onChange={(value) => setStatus(value as string)} />
        <FilterSelect label="Format" placeholder="Any Format" options={FORMATS} value={format} onChange={(value) => setFormat(value as string)} />
        <div className='_advancedFilters_1c5y2_7' {...(expanded ? { 'data-open': '' } : { 'data-closed': '' })}>
          <div className='_group_blpjc_1'>
            <label className='_label_blpjc_7'>Average Score</label>
            <div className='_filterSliderWrapper_1p8jv_1'>
              <div className='_filterScoreRange_1p8jv_72'>
                <span>Min: {scoreMin}</span>
                <span>Max: {scoreMax}</span>
              </div>
              <input aria-label="Minimum score" type="range" min={0} max={100} value={scoreMin} onChange={(event) => setScoreMin(Math.min(Number(event.target.value), scoreMax))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
              <input aria-label="Maximum score" type="range" min={0} max={100} value={scoreMax} onChange={(event) => setScoreMax(Math.max(Number(event.target.value), scoreMin))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </div>
          </div>
          <FilterSelect label="Season" placeholder="Any Season" options={SEASONS} value={season} onChange={(value) => setSeason(value as string)} />
          <FilterSelect label="Source Material" placeholder="Any Source" options={SOURCES} value={source} onChange={(value) => setSource(value as string)} />
          <FilterSelect label="Country of Origin" placeholder="Any Country" options={COUNTRIES} value={country} onChange={(value) => setCountry(value as string)} />
          <FilterSelect label="Sort By" placeholder="Popularity" options={SORTS} value={sort} onChange={(value) => setSort((value as string) || 'POPULARITY_DESC')} />
        </div>
        <div className='_group_1sidc_1 _group_blpjc_1'>
          <div className='_label_1sidc_5 _label_blpjc_7'>
            <span>Apply</span>
            <span>Reset</span>
            <span>{expanded ? 'Collapse' : 'Expand'}</span>
          </div>
          <div className='_buttons_1sidc_45'>
            <button type="button" className='_button_1sidc_18' aria-label="Apply Filters" title="Apply Filters" onClick={apply}>
              <FilterIcon />
            </button>
            <button type="button" className='_button_1sidc_18' aria-label="Reset Filters" title="Reset Filters" onClick={reset}>
              <ResetIcon />
            </button>
            <button
              type="button"
              className='_button_1sidc_18'
              aria-label={expanded ? 'Collapse Filters' : 'Expand Filters'}
              title={expanded ? 'Collapse Filters' : 'Expand Filters'}
              aria-expanded={expanded}
              onClick={() => setExpanded((state) => !state)}
            >
              <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 320 512" height="20" width="20" aria-hidden="true" style={{ transform: expanded ? undefined : 'rotate(180deg)' }}>
                <path d="M177 159.7l136 136c9.4 9.4 9.4 24.6 0 33.9l-22.6 22.6c-9.4 9.4-24.6 9.4-33.9 0L160 255.9l-96.4 96.4c-9.4 9.4-24.6 9.4-33.9 0L7 329.7c-9.4-9.4-9.4-24.6 0-33.9l136-136c9.4-9.5 24.6-9.5 34-.1z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      {error && <p>{error}</p>}
      <CardGrid items={items} />
      {!loading && !items.length && !error && <p style={{ textAlign: 'center' }}>No results</p>}
      {hasNext && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button type="button" className='_outlinedAction_1aum1_1' disabled={loading} onClick={() => setPage((current) => current + 1)}>
            {loading ? 'Loading…' : 'Show more'}
          </button>
        </div>
      )}
    </div>
  );
}
