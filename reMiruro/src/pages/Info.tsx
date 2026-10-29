import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchAnimeData } from '../hooks/useApi';
import { Ic } from '../live/Icon';
import {
  CardItem,
  displayStatus,
  episodeCount,
  GenreTag,
  Rail,
  Seasons,
  titleOf,
  watchHref,
} from '../live/parts';

const loaded = (e: React.SyntheticEvent<HTMLImageElement>) =>
  e.currentTarget.setAttribute('data-loaded', 'true');

function dateStr(d: any) {
  if (!d?.year) return '—';
  return new Date(d.year, (d.month || 1) - 1, d.day || 1).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const cap = (s?: string) => (s ? s[0] + s.slice(1).toLowerCase() : '');

function Fields({ anime }: { anime: any }) {
  const [closed, setClosed] = useState(true);
  const rows: [string, React.ReactNode][] = [
    ['Episodes', <Rail sub={episodeCount(anime)} dub={anime?.dubEpisodes || 0} className='_metadata_mpnb7_33' />],
    ['Start Date', dateStr(anime?.startDate)],
    ['End Date', dateStr(anime?.endDate)],
    ['Status', displayStatus(anime?.status)],
    ['Format', anime?.type],
    ['Duration', anime?.duration ? `${anime.duration} min` : null],
    ['Season', anime?.season ? `${cap(anime.season)} ${anime.releaseDate || anime.startDate?.year || ''}` : null],
    ['Rating', anime?.rating ? `${anime.rating}%` : null],
    ['Popularity', anime?.popularity?.toLocaleString()],
    ['Studios', anime?.studios?.join(', ')],
    ['Country', anime?.countryOfOrigin],
    ['Synonyms', anime?.synonyms?.slice(0, 3).join(', ')],
  ];
  const shown = rows.filter(([, v]) => v);
  const field = ([k, v]: [string, React.ReactNode]) => (
    <div key={k} className='_field_1di9s_4'>
      <span>{k}</span>
      <strong>{v}</strong>
    </div>
  );
  return (
    <div className='_wrapper_1di9s_28 _desktop_1di9s_71'>
      <div className='_fields_1di9s_4' {...(closed ? { 'data-closed': '' } : {})}>
        {shown.slice(0, 6).map(field)}
        {shown.length > 6 && (
          <>
            <div className='_additionalFields_1di9s_1' {...(!closed ? { 'data-open': '' } : {})} hidden={closed}>
              {shown.slice(6).map(field)}
            </div>
            <button
              type='button'
              className='_toggle_1di9s_33'
              aria-expanded={!closed}
              onClick={() => setClosed(!closed)}
            >
              <Ic n='angleDown' />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DragList({ title, items }: { title: string; items: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  if (!items?.length) return null;
  return (
    <div className='_container_1lg80_1'>
      <div className='_dragListContainer_1wvte_1'>
        <h2 className='_listTitle_1wvte_98'>{title}</h2>
        <div className='_relativeWrapper_1wvte_44'>
          <button type='button' className='_scrollButton_1wvte_48' style={{ left: 0 }} aria-label='Scroll left' onClick={() => scroll(-1)}>
            <Ic n='chevronLeft' />
          </button>
          <div className='_fadeLeft_1wvte_33 _left_nsf5q_31 _edge_nsf5q_1' />
          <div className='_dragListWrapper_1wvte_12' ref={ref}>
            <div className='_dragListContent_1wvte_22'>
              {items.map((a, i) => (
                <div key={a.id} className='_dragListItemWrapper_1wvte_28'>
                  <CardItem anime={a} index={i} />
                </div>
              ))}
            </div>
          </div>
          <div className='_fadeRight_1wvte_38 _right_nsf5q_35 _edge_nsf5q_1' />
          <button type='button' className='_scrollButton_1wvte_48' style={{ right: 0 }} aria-label='Scroll right' onClick={() => scroll(1)}>
            <Ic n='chevronRight' />
          </button>
        </div>
      </div>
    </div>
  );
}

const TABS = ['Overview', 'Characters', 'Artwork', 'Episodes'] as const;

export default function Info() {
  const { animeId = '' } = useParams();
  const [anime, setAnime] = useState<any>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  const [descOpen, setDescOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setAnime(null);
    setError(false);
    setTab('Overview');
    window.scrollTo(0, 0);
    fetchAnimeData(animeId)
      .then((a) => {
        if (!alive) return;
        setAnime(a);
        document.title = `${titleOf(a)} - Miruro`;
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [animeId]);

  if (error) return <p style={{ textAlign: 'center', padding: '4rem 0' }}>Couldn't load this anime.</p>;
  if (!anime) return <div className='_container_vh4o5_1' style={{ minHeight: '80vh' }} />;

  const title = titleOf(anime);
  const year = anime.releaseDate || anime.startDate?.year;
  const desc = (anime.description || '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '');
  const characters = anime.characters || [];
  const artwork = anime.artwork || [];

  return (
    <div className='_container_vh4o5_1'>
      <div className='_container_1emty_1 animFadeIn'>
        <div className='_content_1emty_9'>
          {(anime.cover || anime.image) && (
            <div className='_banner_1emty_71'>
              <img className='_bannerImage_1emty_71' src={anime.cover || anime.image} alt='' onLoad={loaded} />
            </div>
          )}
          <div className='_columns_1emty_15'>
            <div className='_sideColumn_1emty_27'>
              <div className='_wrapper_rmizl_1'>
                <div className='_row_rmizl_9'>
                  <div className='_coverColumn_rmizl_15'>
                    <div className='_cover_rmizl_15'>
                      <img className='_image_rmizl_22' src={anime.image} alt={title} onLoad={loaded} />
                    </div>
                    <div className='_actions_rmizl_51'>
                      <Link className='_watchNowButton_1aum1_59 _outlinedAction_1aum1_1' to={watchHref(anime)}>
                        <Ic n='play' />
                        WATCH NOW
                      </Link>
                      <button type='button' className='_addButton_1m9nu_31' aria-label='Add to list'>
                        <Ic n='plus' />
                      </button>
                    </div>
                    <div className='_links_rmizl_41'>
                      <a className='_accountLink_1ix17_1 _outlinedAction_1aum1_1' href={`https://anilist.co/anime/${anime.id}`} target='_blank' rel='noreferrer' title='AniList'>
                        <Ic n='anilist' size='1.2rem' />
                      </a>
                      {anime.malId && (
                        <a className='_accountLink_1ix17_1 _outlinedAction_1aum1_1' href={`https://myanimelist.net/anime/${anime.malId}`} target='_blank' rel='noreferrer' title='MyAnimeList'>
                          <Ic n='mal' size='1.2rem' />
                        </a>
                      )}
                    </div>
                  </div>
                  <h1 className='_title_rmizl_31'>{title}</h1>
                </div>
              </div>
            </div>
            <div className='_detailsColumn_1emty_43'>
              <Fields anime={anime} />
            </div>
            <div className='_mainColumn_1emty_35'>
              <div className='_wrapper_1u4xn_1'>
                <h1 className='_title_1u4xn_8'>
                  <span className='_titleText_1u4xn_19'>{title}</span>
                </h1>
                <div className='_summaryBadges_6p6zx_1 _tags_10cp2_1'>
                  {anime.type && <GenreTag to={`/search?format=${anime.type}`}>{anime.type}</GenreTag>}
                  {year && <GenreTag to={`/search?year=${year}`}>{year}</GenreTag>}
                  <GenreTag to={`/search?status=${anime.status}`}>{displayStatus(anime.status)}</GenreTag>
                  {anime.rating && <GenreTag to='/search?sort=SCORE_DESC'>{anime.rating} %</GenreTag>}
                  {anime.season && <GenreTag to={`/search?season=${anime.season}`}>{cap(anime.season)}</GenreTag>}
                  {(anime.genres || []).map((g: string) => (
                    <GenreTag key={g} to={`/search?genres=${encodeURIComponent(g)}`}>
                      {g}
                    </GenreTag>
                  ))}
                </div>
              </div>
              <div className='_container_13l3n_1 _panel_1vrzc_1' role='tablist'>
                {TABS.map((t) => (
                  <button
                    key={t}
                    type='button'
                    role='tab'
                    aria-selected={tab === t}
                    {...(tab === t ? { 'data-active': '' } : {})}
                    className='_sectionButton_13l3n_17'
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className='_panelContent_1emty_52'>
                {tab === 'Overview' && (
                  <div className='_container_1bd87_26'>
                    <div className='_trailerContainer_1bd87_1 _panel_1vrzc_1'>
                      {desc && (
                        <button
                          type='button'
                          className={`_description_rdjqr_1${descOpen ? '' : ' _collapsed_rdjqr_17'} _descDesktopOnly_1bd87_12`}
                          onClick={() => setDescOpen(!descOpen)}
                          style={{ whiteSpace: 'pre-line' }}
                        >
                          {desc}
                        </button>
                      )}
                      {anime.trailer?.id && (
                        <iframe
                          className='_trailer_1bd87_1'
                          src={`https://www.youtube-nocookie.com/embed/${anime.trailer.id}`}
                          title='Trailer'
                          allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
                          allowFullScreen
                        />
                      )}
                    </div>
                    <Seasons anime={anime} currentId={animeId} watch={false} />
                  </div>
                )}
                {tab === 'Characters' && (
                  <div className='_panel_1vrzc_1' style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(14rem,1fr))', gap: '0.75rem', padding: '1rem' }}>
                    {characters.length ? (
                      characters.map((c: any) => (
                        <div key={c.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <img src={c.image} alt='' style={{ width: 48, height: 64, objectFit: 'cover', borderRadius: 'var(--radius-sm, 6px)' }} />
                          <div>
                            <strong>{c.name?.full || c.name?.userPreferred || c.name}</strong>
                            <div style={{ opacity: 0.6, fontSize: '0.8rem' }}>{cap(c.role)}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <span>No characters found.</span>
                    )}
                  </div>
                )}
                {tab === 'Artwork' && (
                  <div className='_panel_1vrzc_1' style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(12rem,1fr))', gap: '0.75rem', padding: '1rem' }}>
                    {[anime.image, anime.cover, ...artwork.map((a: any) => a.img || a)]
                      .filter(Boolean)
                      .map((src: string) => (
                        <img key={src} src={src} alt='' style={{ width: '100%', borderRadius: 'var(--radius-sm, 6px)' }} />
                      ))}
                  </div>
                )}
                {tab === 'Episodes' && (
                  <div className='_panel_1vrzc_1' style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '1rem' }}>
                    {Array.from({ length: episodeCount(anime) || anime.totalEpisodes || 0 }, (_, i) => (
                      <Link key={i} className='_outlinedAction_1aum1_1' to={watchHref(anime, i + 1)}>
                        EP {i + 1}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DragList title='RECOMMENDATIONS' items={anime.recommendations || []} />
        </div>
      </div>
    </div>
  );
}
