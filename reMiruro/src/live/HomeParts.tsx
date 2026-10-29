import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, EffectFade } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import { Ic } from './Icon';
import { infoHref, titleOf, watchHref } from './parts';
import { prefetchWatch } from '../hooks/useApi';
import { fetchAiringSchedule } from '../hooks/useApi';
import { toSlug } from '../utils/paths';

type AnyAnime = any;

const stripHtml = (s?: string) =>
  (s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function countdownLabel(airingAt: number) {
  const diff = airingAt * 1000 - Date.now();
  if (diff <= 0) return '';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return d > 0 ? `${d}D ${h}H` : h > 0 ? `${h}H ${m}M` : `${m}M`;
}

export function HomeCarousel({ items }: { items: AnyAnime[] }) {
  const swiperRef = useRef<SwiperType | null>(null);
  const [active, setActive] = useState(0);
  const slides = useMemo(() => items.filter((a) => a.cover || a.image), [items]);
  if (!slides.length) return null;
  const current = slides[Math.min(active, slides.length - 1)];
  const title = titleOf(current);
  const next = current.nextAiringEpisode;
  const airing = next?.airingAt || next?.airingTime;

  return (
    <div className='_carouselWrapper_opdb2_1 animFadeIn'>
      <Swiper
        className='_swiperFullHeight_opdb2_15'
        modules={[EffectFade, Autoplay]}
        effect='fade'
        fadeEffect={{ crossFade: true }}
        loop
        watchSlidesProgress
        autoplay={{ delay: 5000, disableOnInteraction: false }}
        onSwiper={(s) => (swiperRef.current = s)}
        onSlideChange={(s) => setActive(s.realIndex)}
      >
        {slides.map((a, i) => (
          <SwiperSlide key={a.id}>
            <div className='_slide_6lruc_1'>
              <img
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding='async'
                alt={titleOf(a)}
                data-loaded='true'
                className='_image_1r2hh_1 _image_6lruc_8'
                src={a.cover || a.image}
              />
              <div className='_shade_6lruc_18' />
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
      <div
        className='_content_6lruc_30'
        style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}
      >
        <div
          className='_details_7c57o_1'
          data-position='active'
          style={current.color ? ({ '--home-carousel-title-color': current.color } as any) : undefined}
        >
          <div className='_facts_7c57o_97'>
            {current.type && <div className='_fact_7c57o_97'>{current.type}</div>}
            {current.totalEpisodes ? (
              <div className='_fact_7c57o_97' aria-label={`${current.totalEpisodes} total episodes`}>
                <Ic n='ccBox' />
                {current.totalEpisodes}
              </div>
            ) : null}
            {current.duration ? (
              <div className='_fact_7c57o_97'>
                <Ic n='clock' />
                {current.duration} mins
              </div>
            ) : null}
            {current.rating ? (
              <div className='_fact_7c57o_97'>
                <Ic n='star' />
                {current.rating}
              </div>
            ) : null}
          </div>
          <div
            className='_title_7c57o_52'
            data-colored={current.color ? 'true' : 'false'}
            style={{ WebkitTextFillColor: current.color || '#fff', color: current.color || '#fff', background: 'none' }}
          >
            {title}
          </div>
          <p
            className='_description_7c57o_67'
            style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', color: '#e8e8e8', overflow: 'hidden' }}
          >
            {stripHtml(current.description)}
          </p>
        </div>
      </div>
      <div className='_actions_19efs_1'>
        <Link className='_action_19efs_1 _control_19nlx_1' title={`Details ${title}`} to={infoHref(current)}>
          <Ic n='info' size={20} />
          <span>DETAILS</span>
        </Link>
        <Link className='_action_19efs_1 _control_19nlx_1' title={`Watch ${title}`} to={watchHref(current)} onPointerEnter={() => prefetchWatch(current?.id)}>
          <Ic n='playCircle' size={18} />
          <span>WATCH NOW</span>
        </Link>
      </div>
      {airing && countdownLabel(airing) ? (
        <div className='_airing_100r2_1'>
          <div className='_badge_100r2_12 _control_19nlx_1' title={`EP ${next.episode} ${countdownLabel(airing)}`}>
            <Ic n='clock' size={14} />
            <span>
              EP {next.episode} {countdownLabel(airing)}
            </span>
          </div>
        </div>
      ) : null}
      <div className='_navigation_urvye_1'>
        <button type='button' aria-label='Previous slide' className='_button_urvye_29 _control_19nlx_1' onClick={() => swiperRef.current?.slidePrev()}>
          <Ic n='angleLeft' size={20} />
        </button>
        <div className='home-carousel__fraction _fraction_urvye_11 _control_19nlx_1 swiper-pagination-fraction swiper-pagination-horizontal' aria-label='Carousel position'>
          <span className='swiper-pagination-current'>{active + 1}</span> / <span className='swiper-pagination-total'>{slides.length}</span>
        </div>
        <button type='button' aria-label='Next slide' className='_button_urvye_29 _control_19nlx_1' onClick={() => swiperRef.current?.slideNext()}>
          <Ic n='angleRight' size={20} />
        </button>
      </div>
    </div>
  );
}

export const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music',
  'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
];

export function GenreSlider() {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  };
  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const by = (dir: number) => ref.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });
  const overflow = {
    'data-has-overflow-x': '',
    ...(edge.start ? {} : { 'data-overflow-x-start': '' }),
    ...(edge.end ? {} : { 'data-overflow-x-end': '' }),
  };
  return (
    <div role='presentation' className='_slider_1uwb5_1 animFadeIn _root_14jew_8' {...overflow}>
      {!edge.start && (
        <button type='button' data-side='left' aria-label='Scroll genres left' className='_scrollButton_1uwb5_61 animFadeIn' onClick={() => by(-1)}>
          <Ic n='chevronCircleLeft' />
        </button>
      )}
      <div
        ref={ref}
        tabIndex={0}
        className='_scrollableContainer_1uwb5_12 _viewport_14jew_1 base-ui-disable-scrollbar'
        role='region'
        aria-label='Scrollable genres list'
        onScroll={update}
        style={{ overflow: 'auto hidden' }}
        {...overflow}
      >
        <div role='presentation' className='_innerContainer_1uwb5_20' {...overflow}>
          <div className='_container_1uwb5_24' role='list'>
            {GENRES.map((g) => (
              <Link key={g} className='_genreButton_1uwb5_33' role='listitem' to={`/search?genres=${encodeURIComponent(g)}&sort=POPULARITY_DESC`}>
                {g}
              </Link>
            ))}
          </div>
        </div>
      </div>
      {!edge.end && (
        <button type='button' data-side='right' aria-label='Scroll genres right' className='_scrollButton_1uwb5_61 animFadeIn' onClick={() => by(1)}>
          <Ic n='chevronCircleRight' />
        </button>
      )}
    </div>
  );
}

const SUBTEXTS = ['Share it With your Friends!', 'Add it to your Bookmarks!', 'Join our Subreddit'];

export function NoticeSection() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SUBTEXTS.length), 3000);
    return () => clearInterval(t);
  }, []);
  const img = new Date().getUTCMonth() === 9 ? '/assets/creepyegg-CYGjjnAR.webp' : '/assets/wotah-CPaFDXZ8.webp';
  return (
    <section className='_noticeSection_gfso3_1 _panel_1vrzc_1 animFadeIn'>
      <div className='_noticeRow_gfso3_11'>
        <div className='_noticeImageWrapper_gfso3_19'>
          <img loading='lazy' decoding='async' alt='' data-loaded='true' className='_image_1r2hh_1 _noticeImage_gfso3_19' src={img} />
        </div>
        <div className='_noticeContent_gfso3_39'>
          <div className='_noticeTextContainer_gfso3_48'>
            <p className='_noticeText_gfso3_48'>Love the Site?</p>
            <div className='_noticeSubTextContainer_gfso3_62'>
              {SUBTEXTS.map((s, i) => (
                <p key={s} className='_noticeSubText_gfso3_62' data-active={i === idx ? 'true' : 'false'}>
                  {s}
                </p>
              ))}
            </div>
          </div>
          <div className='_socialLinksContainer_gfso3_85'>
            <a className='_socialLink_gfso3_85' href='https://www.reddit.com/r/miruro' target='_blank' rel='noopener noreferrer' aria-label='Miruro on Reddit'>
              <Ic n='reddit' />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CompactPagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page]);
  const commit = () => {
    const n = Math.max(1, Math.min(total, parseInt(draft, 10) || page));
    setDraft(String(n));
    if (n !== page) onChange(n);
  };
  const prevDisabled = page <= 1;
  const nextDisabled = page >= total;
  return (
    <div className='_compactWrapper_ggvi1_10'>
      <button
        type='button'
        {...(prevDisabled ? { 'data-disabled': '' } : {})}
        disabled={prevDisabled}
        title='Previous Page'
        className='_button_ggvi1_20 _compactButton_ggvi1_28'
        onClick={() => onChange(page - 1)}
      >
        <Ic n='chevronLeft' />
      </button>
      <div className='_entry_ggvi1_41'>
        <input
          inputMode='numeric'
          autoComplete='off'
          autoCorrect='off'
          spellCheck={false}
          aria-roledescription='Number field'
          aria-label='Go to page'
          title='Go to page'
          className='_input_ggvi1_45'
          type='text'
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
      </div>
      <button
        type='button'
        {...(nextDisabled ? { 'data-disabled': '' } : {})}
        disabled={nextDisabled}
        title='Next Page'
        className='_button_ggvi1_20 _compactButton_ggvi1_28'
        onClick={() => onChange(page + 1)}
      >
        <Ic n='chevronRight' />
      </button>
    </div>
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ScheduleSlot() {
  const today = new Date().getDay();
  const [day, setDay] = useState(today);
  const [rows, setRows] = useState<any[]>([]);
  const count = 10;

  useEffect(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + (day - today));
    const from = Math.floor(start.getTime() / 1000);
    const to = from + 86400;
    let alive = true;
    fetchAiringSchedule(from - 1, to)
      .then((r: any[]) => alive && setRows(r || []))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [day, today]);

  const now = Date.now() / 1000;
  const aired = rows.filter((r) => r.airingAt <= now).length;

  return (
    <div className='_scheduleSlot_c41l9_89'>
      <section className='_section_texzj_1'>
        <div className='_titleBlock_texzj_7'>
          <span className='_subtitle_texzj_11'>Estimated</span>
          <Link className='_header_texzj_20' to='/schedule'>
            Airing Schedule
          </Link>
        </div>
        <div className='_scroll_hjkgw_1'>
          <div role='radiogroup' aria-label='Schedule day' className='_wrapper_hjkgw_17'>
            {DAYS.map((d, i) => (
              <span key={d} style={{ display: 'contents' }}>
                <div className='_dayItem_hjkgw_31'>
                  <button
                    className='_weekDay_hjkgw_38'
                    type='button'
                    {...(i === day ? { 'data-checked': '' } : { 'data-unchecked': '' })}
                    role='radio'
                    aria-checked={i === day}
                    tabIndex={i === day ? 0 : -1}
                    onClick={() => setDay(i)}
                  >
                    {d}
                  </button>
                </div>
                {i < DAYS.length - 1 && (
                  <span className='_weekDay_hjkgw_38 _separator_hjkgw_70' aria-hidden='true'>
                    /
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
        <div className='_list_texzj_39 _panel_1vrzc_1'>
          <div
            {...(aired < rows.length ? { 'data-progressing': '' } : { 'data-complete': '' })}
            aria-valuemax={rows.length}
            aria-valuemin={0}
            aria-valuenow={aired}
            aria-valuetext={`${aired} of ${rows.length} episodes aired`}
            role='progressbar'
            aria-label='Aired episodes on the selected day'
            className='_progress_texzj_47'
          >
            <div className='_progressTrack_texzj_57'>
              <div className='_progressIndicator_texzj_61' style={{ width: `${rows.length ? (aired / rows.length) * 100 : 0}%` }} />
            </div>
          </div>
          {rows.length === 0 && <div className='_empty_texzj_176'>No episodes scheduled.</div>}
          {rows.slice(0, count).map((r) => {
            const t = r.media?.title || {};
            const title = t.english || t.romaji || t.userPreferred || '';
            const time = new Date(r.airingAt * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            return (
              <Link
                key={r.id}
                className='_row_texzj_67'
                {...(r.airingAt <= now ? { 'data-aired': '' } : {})}
                to={`/watch/${r.media?.id}/${toSlug(title)}?ep=${r.episode}`}
              >
                <span className='_time_texzj_96'>{time}</span>
                <span className='_title_texzj_7'>{title}</span>
                <span className='_episode_texzj_98'>EP {r.episode}</span>
              </Link>
            );
          })}
          <Link className='_viewMore_texzj_160' to='/schedule'>
            View More
          </Link>
        </div>
      </section>
    </div>
  );
}
