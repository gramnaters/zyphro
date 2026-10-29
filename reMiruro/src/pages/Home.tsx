import { useEffect, useState } from 'react';
import {
  fetchTrendingAnime,
  fetchPopularAnime,
  fetchTopAnime,
  fetchTopAiringAnime,
  fetchUpcomingSeasons,
  fetchNewestAnime,
  fetchTopMovies,
  fetchJustFinished,
} from '../hooks/useApi';
import { CardGrid, SideList } from '../live/parts';
import { EpisodeCard } from '../components/Home/EpisodeCard';
import {
  CompactPagination,
  GenreSlider,
  HomeCarousel,
  NoticeSection,
  ScheduleSlot,
} from '../live/HomeParts';

type Tab = 'newest' | 'popular' | 'topRated';
const TABS: { id: Tab; label: string; title: string }[] = [
  { id: 'newest', label: 'NEWEST', title: 'Newest Tab' },
  { id: 'popular', label: 'POPULAR', title: 'Popular Tab' },
  { id: 'topRated', label: 'TOP RATED', title: 'Top Rated Tab' },
];
const PER_PAGE = 18;
const FETCHERS: Record<Tab, (p: number, n: number) => Promise<any>> = {
  newest: fetchNewestAnime,
  popular: fetchPopularAnime,
  topRated: fetchTopAnime,
};

const results = (r: any) => (Array.isArray(r?.results) ? r.results : []);

const Home = () => {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('home tab');
    return saved === 'popular' || saved === 'topRated' ? saved : 'newest';
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(5);
  const [grid, setGrid] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [side, setSide] = useState({
    finished: [] as any[],
    movies: [] as any[],
    airing: [] as any[],
    upcoming: [] as any[],
  });

  useEffect(() => {
    document.title = 'Miruro · Watch Anime Online Free · Stream Sub & Dub in HD';
    fetchTrendingAnime(1, 11).then((r) => setTrending(results(r))).catch(() => {});
    Promise.allSettled([
      fetchJustFinished(1, 15),
      fetchTopMovies(1, 15),
      fetchTopAiringAnime(1, 15),
      fetchUpcomingSeasons(1, 15),
    ]).then(([f, m, a, u]) =>
      setSide({
        finished: f.status === 'fulfilled' ? results(f.value) : [],
        movies: m.status === 'fulfilled' ? results(m.value) : [],
        airing: a.status === 'fulfilled' ? results(a.value) : [],
        upcoming: u.status === 'fulfilled' ? results(u.value) : [],
      }),
    );
  }, []);

  useEffect(() => {
    localStorage.setItem('home tab', tab);
    let alive = true;
    FETCHERS[tab](page, PER_PAGE)
      .then((r) => {
        if (!alive) return;
        setGrid(results(r).slice(0, PER_PAGE));
        setTotalPages(Math.max(1, Math.min(5, r?.totalPages || 5)));
      })
      .catch(() => alive && setGrid([]));
    return () => {
      alive = false;
    };
  }, [tab, page]);

  return (
    <>
      <h1 className='vh'>Miruro - Watch Anime Online Free</h1>
      <div className='_simpleLayout_c41l9_6'>
        <HomeCarousel items={trending} />
        <GenreSlider />
        <EpisodeCard />
        <div className='_contentSidebarLayout_c41l9_15'>
          <div className='_mainContent_c41l9_41'>
            <div data-orientation='horizontal' data-activation-direction='none' className='_root_mo3dn_1'>
              <NoticeSection />
              <div className='_tabsAndPaginationContainer_1iejq_1'>
                <div role='presentation' className='_tabScrollArea_1iejq_8 _root_14jew_8'>
                  <div tabIndex={-1} className='_scrollableTabContainer_1iejq_14 _viewport_14jew_1 base-ui-disable-scrollbar' style={{ overflow: 'auto hidden' }}>
                    <div role='presentation'>
                      <div data-orientation='horizontal' role='tablist' aria-label='Catalog lists' className='_tabContainer_1iejq_18'>
                        {TABS.map((t) => (
                          <button
                            key={t.id}
                            type='button'
                            {...(tab === t.id ? { 'data-active': '' } : {})}
                            data-orientation='horizontal'
                            role='tab'
                            aria-selected={tab === t.id}
                            tabIndex={tab === t.id ? 0 : -1}
                            title={t.title}
                            className='_tab_1iejq_1'
                            onClick={() => {
                              setTab(t.id);
                              setPage(1);
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <CompactPagination page={page} total={totalPages} onChange={setPage} />
              </div>
              <div data-orientation='horizontal' role='tabpanel' tabIndex={-1}>
                <section className='_section_154pc_1'>
                  <CardGrid items={grid} />
                </section>
              </div>
            </div>
            <div className='_sidelistRow_c41l9_49'>
              <SideList title='JUST FINISHED' items={side.finished} />
              <SideList title='TOP MOVIES' items={side.movies} />
            </div>
          </div>
          <aside className='_side_c41l9_49'>
            <SideList title='TOP AIRING' items={side.airing} />
            <SideList title='UPCOMING' icon='megaphone' iconClass='_megaPhone_c41l9_1' items={side.upcoming} noBanner />
            <ScheduleSlot />
          </aside>
        </div>
      </div>
    </>
  );
};

export default Home;
