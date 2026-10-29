import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ic } from './Icon';
import { animeTitle, toSlug } from '../utils/paths';
import { prefetchWatch } from '../hooks/useApi';

type AnyAnime = any;

export const titleOf = (a: AnyAnime) => animeTitle(a);
export const watchHref = (a: AnyAnime, ep?: number | string) =>
  `/watch/${a.id}/${toSlug(titleOf(a))}${ep ? `?ep=${ep}` : ''}`;
export const infoHref = (a: AnyAnime) => `/info/${a.id}/${toSlug(titleOf(a))}`;

export function statusKey(status?: string) {
  const s = (status || '').toUpperCase();
  if (s.includes('ONGOING') || s.includes('RELEASING')) return 'RELEASING';
  if (s.includes('NOT YET') || s.includes('NOT_YET') || s.includes('UPCOMING'))
    return 'NOT_YET_RELEASED';
  if (s.includes('CANCEL')) return 'CANCELLED';
  if (s.includes('HIATUS')) return 'HIATUS';
  return 'FINISHED';
}

export function StatusDot({ status }: { status?: string }) {
  const key = statusKey(status);
  const cls =
    key === 'RELEASING'
      ? '_ongoing_1hbe1_10'
      : key === 'NOT_YET_RELEASED'
        ? '_notYetAired_1hbe1_22'
        : key === 'CANCELLED'
          ? '_cancelled_1hbe1_18'
          : '_completed_1hbe1_14';
  return <div title={key} className={`_indicatorDot_1hbe1_1 ${cls}`} />;
}

export function displayStatus(status?: string) {
  const key = statusKey(status);
  return key === 'RELEASING'
    ? 'Airing'
    : key === 'NOT_YET_RELEASED'
      ? 'Upcoming'
      : key === 'CANCELLED'
        ? 'Cancelled'
        : key === 'HIATUS'
          ? 'Hiatus'
          : 'Finished';
}

export function episodeCount(a: AnyAnime): number {
  const n = Number(a?.currentEpisode || a?.totalEpisodes || a?.episodes || 0);
  return Number.isFinite(n) ? n : 0;
}

export function Rail({
  sub,
  dub = 0,
  className = '',
}: {
  sub: number;
  dub?: number;
  className?: string;
}) {
  if (!sub && !dub) return null;
  if (sub && dub && sub === dub) {
    return (
      <div className={`_rail_mpnb7_1 ${className}`.trim()} aria-label='Episode availability'>
        <span className='_fact_mpnb7_12' data-track='sub-dub' aria-label={`${sub} sub and dub episodes`}>
          <Ic n='sub' />
          <Ic n='mic' />
          <strong>{sub}</strong>
        </span>
      </div>
    );
  }
  return (
    <div className={`_rail_mpnb7_1 ${className}`.trim()} aria-label='Episode availability'>
      {sub > 0 && (
        <span className='_fact_mpnb7_12' data-track='sub' aria-label={`SUB ${sub} episodes`}>
          <Ic n='sub' />
          <strong>{sub}</strong>
        </span>
      )}
      {dub > 0 && (
        <span className='_fact_mpnb7_12' data-track='dub' aria-label={`DUB ${dub} episodes`}>
          <Ic n='mic' />
          <strong>{dub}</strong>
        </span>
      )}
    </div>
  );
}

export function EditListButton({ visible }: { visible?: boolean }) {
  return (
    <button
      type='button'
      title='Edit List'
      aria-label='Edit List'
      className={`_editListButton_1m9nu_1${visible ? ' _isVisible_1m9nu_27' : ''}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <Ic n='plus' />
    </button>
  );
}

export function CardItem({ anime, index = 0 }: { anime: AnyAnime; index?: number }) {
  const title = titleOf(anime);
  const href = watchHref(anime);
  const year = anime.releaseDate || anime.startDate?.year;
  const color = anime.color || undefined;
  return (
    <div
      title={title}
      id={`card-${anime.id}-${index}`}
      data-card-wrapper='true'
      className='_wrapper_b7dvv_1 animSlideUp'
      onPointerEnter={() => prefetchWatch(anime.id)}
    >
      <div className='_styledCardItem_1ral4_1'>
        <div className='_poster_1qjrp_3 _classic_1qjrp_24'>
          <div className='_frame_1qjrp_9 animSlideUp' data-ready='true'>
            <div
              className='_imageWrapper_1qjrp_30'
              style={color ? ({ '--card-image-hover-color': color } as any) : undefined}
            >
              <Link tabIndex={-1} className='_cardLink_b7dvv_10' to={href}>
                <img
                  loading='lazy'
                  decoding='async'
                  alt={`Play ${title}`}
                  data-loaded='true'
                  className='_image_1r2hh_1 _image_1qjrp_30'
                  data-ready='true'
                  src={anime.image}
                />
                <Ic n='play' className='_playIcon_1qjrp_84' title={`Play ${title}`} />
              </Link>
              <div className='_action_1qjrp_99'>
                <EditListButton />
              </div>
            </div>
          </div>
        </div>
        <div className='_contentColumn_1ral4_6'>
          <div className='_titleContainer_1ral4_11'>
            <StatusDot status={anime.status} />
            <h3
              className='_title_1ral4_11 _titleMedium_1ral4_56'
              title={`Title: ${title}`}
              style={color ? ({ '--card-title-hover-color': color } as any) : undefined}
            >
              <Link className='_cardLink_b7dvv_10' to={href}>
                {title}
              </Link>
            </h3>
          </div>
          <div className='_cardDetails_xz3sm_1'>
            {anime.type && <div className='_cardDetail_xz3sm_1'>{anime.type}</div>}
            {year && <div className='_cardDetail_xz3sm_1'>{year}</div>}
            <Rail sub={episodeCount(anime)} />
            {anime.rating ? (
              <div className='_cardDetail_xz3sm_1 _hideOnMobile_xz3sm_38'>
                <Ic n='star' />
                {anime.rating}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CardGrid({ items }: { items: AnyAnime[] }) {
  return (
    <div data-layout='classic' className='_grid_1loz2_1' data-size='medium'>
      {items.map((a, i) => (
        <CardItem key={`${a.id}-${i}`} anime={a} index={i} />
      ))}
    </div>
  );
}

export function SideListCard({
  anime,
  index = 0,
  noBanner,
}: {
  anime: AnyAnime;
  index?: number;
  noBanner?: boolean;
}) {
  const title = titleOf(anime);
  const year = anime.releaseDate || anime.startDate?.year;
  const upcoming = statusKey(anime.status) === 'NOT_YET_RELEASED';
  const banner = !noBanner && anime.cover && anime.cover !== anime.image ? anime.cover : null;
  const eps = episodeCount(anime);
  return (
    <Link className='_styledLink_8d6f7_145' title={title} to={watchHref(anime)} onPointerEnter={() => prefetchWatch(anime.id)}>
      <div
        className='_sideListCard_8d6f7_36 animSlideUp _card_1txbo_16'
        data-side-list-card='true'
        style={{
          animationDelay: `${index * 0.1}s`,
          ...(anime.color ? { '--side-list-accent': anime.color } : {}),
        } as any}
      >
        {banner && (
          <div className='_frame_1txbo_1 _bannerImageContainer_8d6f7_64'>
            <img loading='lazy' decoding='async' alt='' data-loaded='true' className='_image_1r2hh_1 _image_1txbo_8' src={banner} />
            <div className='_shade_1txbo_20 _gradientOverlay_8d6f7_70' />
          </div>
        )}
        <div className='_sideListCardImage_8d6f7_73' data-poster='true'>
          <img loading='lazy' decoding='async' alt={title} data-loaded='true' className='_image_1r2hh_1 _sideListCoverImage_8d6f7_84' src={anime.image} />
        </div>
        <div className='_cardContent_8d6f7_149'>
          <div className='_sideListCardTitleContainer_8d6f7_89'>
            <div>
              <StatusDot status={anime.status} />
            </div>
            <div className='_sideListCardTitle_8d6f7_89'>{title}</div>
          </div>
          <div className='_sideListCardDetails_8d6f7_105'>
            <div className='_listButtonWrapper_8d6f7_153'>
              <EditListButton visible />
            </div>
            {anime.type && <div className='_sideListCardDetail_8d6f7_105'>{anime.type}</div>}
            {year && !upcoming && (
              <div className='_sideListCardDetail_8d6f7_105'>
                <Ic n='calendar' />
                {year}
              </div>
            )}
            {upcoming ? (
              eps ? (
                <div className='_rail_mpnb7_1 _episodeTrackRail_8d6f7_126 _muted_mpnb7_29' aria-label='Episode count'>
                  <span className='_fact_mpnb7_12' aria-label={`${eps} total episodes`}>
                    <strong>{eps}</strong> EP
                  </span>
                </div>
              ) : null
            ) : (
              <Rail sub={eps} className='_episodeTrackRail_8d6f7_126 _muted_mpnb7_29' />
            )}
            {anime.rating && !upcoming ? (
              <div className='_sideListCardDetail_8d6f7_105'>
                <Ic n='star' />
                {anime.rating}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function SideList({
  title,
  items,
  icon = 'angleRight',
  iconClass,
  initial = 5,
  moreLabel,
  noBanner,
}: {
  title: string;
  items: AnyAnime[];
  icon?: 'angleRight' | 'megaphone';
  iconClass?: string;
  initial?: number;
  moreLabel?: string;
  noBanner?: boolean;
}) {
  const [count, setCount] = useState(initial);
  if (!items.length) return null;
  return (
    <div className='_sideListContainer_8d6f7_1 animSlideLeft'>
      <div className='_sideListWrapper_8d6f7_19 _panel_1vrzc_1'>
        <div className='_listHeader_8d6f7_11'>
          <Ic n={icon} className={iconClass} />
          {title}
        </div>
        <div className='_listWrapper_8d6f7_25'>
          {items.slice(0, count).map((a, i) => (
            <SideListCard key={a.id} anime={a} index={i} noBanner={noBanner} />
          ))}
          {count < items.length && (
            <button
              type='button'
              aria-label={`Show more ${moreLabel || title.toLowerCase()}`}
              className='_viewMoreButton_8d6f7_129'
              onClick={() => setCount((c) => c + 5)}
            >
              <Ic n='angleDown' size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function GenreTag({ to, children, color }: { to: string; children: React.ReactNode; color?: string }) {
  return (
    <Link className='_genreTag_1yxnh_1' to={to} style={color ? ({ '--genre-tag-bg': color } as any) : undefined}>
      {children}
    </Link>
  );
}

export function Seasons({ anime, currentId, watch = true }: { anime: AnyAnime; currentId: string; watch?: boolean }) {
  const rel = (anime?.relations || []).filter((r: AnyAnime) =>
    ['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY'].includes(r.relationType) && ['TV', 'TV_SHORT', 'ONA'].includes(r.type),
  );
  if (!rel.length) return null;
  const year = (x: AnyAnime) => x.releaseDate || x.startDate?.year || '';
  const all = [...rel, { ...anime, current: true }].sort(
    (a: AnyAnime, b: AnyAnime) => Number(year(a) || 0) - Number(year(b) || 0) || String(a.id).localeCompare(String(b.id)),
  );
  return (
    <section className='_parent_bp0sn_1 _panel_1vrzc_1' aria-label='Seasons'>
      <h2 className='_titleContainer_bp0sn_105'>
        <Ic n='seasons' className='_titleIcon_bp0sn_114' />
        SEASONS
      </h2>
      <div className='_seasonCardGrid_bp0sn_7'>
        {all.map((s: AnyAnime, i: number) => {
          const label = `Season ${i + 1}`;
          const current = String(s.id) === String(currentId);
          return (
            <Link
              key={s.id}
              className='_seasonCard_bp0sn_7'
              title={`Watch ${label}`}
              aria-label={`Watch ${label}`}
              aria-current={current ? 'page' : undefined}
              to={watch ? watchHref(s) : infoHref(s)}
            >
              <img loading='lazy' decoding='async' alt={`${label} Cover`} data-loaded='true' className='_image_1r2hh_1 _seasonCover_bp0sn_78' src={s.image} />
              {current && (
                <span className='_currentLabel_bp0sn_60' aria-hidden='true'>
                  current
                </span>
              )}
              <div className='_cardContent_bp0sn_86'>
                <div className='_seasonTitle_bp0sn_92'>{label}</div>
                <div className='_seasonSubtitle_bp0sn_97'>{year(s)}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function formatDate(d?: string | null) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}
