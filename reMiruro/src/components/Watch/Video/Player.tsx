import { useEffect, useRef, useState } from 'react';
import './PlayerStyles.css';
import {
  isHLSProvider,
  MediaPlayer,
  MediaProvider,
  Poster,
  Track,
  SeekButton,
  PIPButton,
  Tooltip,
  type MediaProviderAdapter,
  type MediaPlayerInstance,
} from '@vidstack/react';
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from '@vidstack/react/player/layouts/default';
import {
  CameraIcon,
  DownloadIcon,
  NextIcon,
  PictureInPictureExitIcon,
  PictureInPictureIcon,
  SeekBackward10Icon,
  SeekForward10Icon,
  TheatreModeExitIcon,
  TheatreModeIcon,
} from '@vidstack/react/icons';
import { fetchSkipTimes, fetchAnimeStreamingLinks, dropAnimeStreamingLinks } from '../../../hooks/useApi';
import { Loader } from '../../../live/Loader';

const ERROR_POSTER = '/assets/cons-Bs1ZRFQf.webp';

type PlayerProps = {
  episodeId: string;
  episodeNumber: number | string;
  banner?: string;
  logo?: string | null;
  malId?: string;
  animeTitle?: string;
  autoPlay: boolean;
  autoSkip: boolean;
  autoNext: boolean;
  theater: boolean;
  hasNext: boolean;
  className?: string;
  onTheater: () => void;
  onNext: () => void;
  onEnded: () => void;
  onDownloadLink?: (link: string) => void;
  onError?: () => void;
};

type SkipTime = { interval: { startTime: number; endTime: number }; skipType: string };

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type='button' className='vds-button' aria-label={label} onClick={onClick}>
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content className='vds-tooltip-content' placement='top'>
        {label}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

// Live shows the show's TVDB clear logo wiping in (dimmed copy underneath) while a
// source loads, or a white ring loader when there is no logo. Hidden on can-play.
function LoadingOverlay({ logo, error }: { logo?: string | null; error: boolean }) {
  if (error) {
    return (
      <div className='_loadingOverlay_ncfvu_40'>
        <img className='_errorPoster_4l2h5_61' src={ERROR_POSTER} alt='' draggable={false} />
        <div className='_errorContainer_4l2h5_51'>
          <div className='_errorMessage_4l2h5_70'>PLAYER UNAVAILABLE</div>
        </div>
      </div>
    );
  }
  return (
    <div className='_loadingOverlay_ncfvu_40' aria-label='Loading video' aria-live='polite'>
      <div className='_loadingContainer_4l2h5_1'>
        {logo ? (
          <>
            <img src={logo} className='_dimmedLogo_4l2h5_10' alt='TVDB Logo' data-loading-logo='dimmed' draggable={false} />
            <img src={logo} className='_animatedLogo_4l2h5_11' alt='TVDB Logo' data-loading-logo='animated' draggable={false} />
          </>
        ) : (
          <div className='_loaderFallback_4l2h5_42'>
            <Loader loaderType='ring' color='white' />
          </div>
        )}
      </div>
    </div>
  );
}

export function Player({
  episodeId,
  episodeNumber,
  banner,
  logo,
  malId,
  animeTitle,
  autoPlay,
  autoSkip,
  autoNext,
  theater,
  hasNext,
  className,
  onTheater,
  onNext,
  onEnded,
  onDownloadLink,
  onError,
}: PlayerProps) {
  const player = useRef<MediaPlayerInstance>(null);
  const sources = useRef<any[]>([]);
  const sourceIndex = useRef(0);
  const lastSave = useRef(0);
  const [src, setSrc] = useState<string | { src: string; type: string }>('');
  const [embed, setEmbed] = useState('');
  const [subtitles, setSubtitles] = useState<{ url: string; lang: string }[]>([]);
  const [download, setDownload] = useState('');
  const [skipTimes, setSkipTimes] = useState<SkipTime[]>([]);
  const [chapters, setChapters] = useState('');
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const reloads = useRef(0);

  const fail = () => {
    setPhase('error');
    onError?.();
  };

  // If the chosen server has nothing playable, ask the next one. The shim also races
  // providers internally; this covers a transient miss on the whole request.
  const PROVIDER_FALLBACKS = ['anikoto', 'mkissa', 'animegg', 'reanime'];
  function episodeCandidates(id: string) {
    const list = [id];
    const m = id.match(/^(.+?)-(sub|dub)-(anilist\d+-episode-\d+)$/);
    if (m) {
      for (const p of PROVIDER_FALLBACKS) {
        const alt = `${p}-${m[2]}-${m[3]}`;
        if (!list.includes(alt)) list.push(alt);
      }
    }
    return list;
  }

  useEffect(() => {
    reloads.current = 0;
  }, [episodeId]);

  useEffect(() => {
    let alive = true;
    setSrc('');
    setEmbed('');
    setSubtitles([]);
    setPhase('loading');

    const candidates = episodeCandidates(episodeId);

    const apply = (res: any) => {
      const list = Array.isArray(res?.sources) ? res.sources : [];
      const preferred = list.findIndex((s: any) => s.quality === 'default');
      const order = preferred > 0
        ? [list[preferred], ...list.filter((_: any, i: number) => i !== preferred)]
        : list;
      const source = order[0];
      if (!source?.url) return false;
      sources.current = order;
      sourceIndex.current = 0;
      const url: string = source.url;
      if (source.isEmbed) {
        setEmbed(url);
        setPhase('ready');
        return true;
      }
      if (source.isMP4) {
        setSrc({ src: url, type: 'video/mp4' });
      } else if (source.isDASH || /\.mpd(\?|$)/i.test(url)) {
        setSrc({ src: url, type: 'application/dash+xml' });
      } else if (source.isM3U8 || /\.m3u8(\?|$)/i.test(url) || url.includes('/proxy/hls/')) {
        setSrc({ src: url, type: 'application/vnd.apple.mpegurl' });
      } else {
        setSrc(url);
      }
      const subs = (res?.subtitles || [])
        .filter((s: any) => s?.url && /\.(vtt|srt)(\?|$)/i.test(s.url) && !/thumbnails/i.test(s.lang || ''))
        .map((s: any) => ({ url: s.url, lang: s.lang || 'Unknown' }));
      setSubtitles(subs);
      const link = res?.download || url;
      setDownload(link);
      onDownloadLink?.(link);
      return true;
    };

    (async () => {
      for (let i = 0; i < candidates.length && alive; i++) {
        const id = candidates[i];
        try {
          const res = await fetchAnimeStreamingLinks(id);
          if (!alive) return;
          if (apply(res)) return;
          dropAnimeStreamingLinks(id);
        } catch {
          dropAnimeStreamingLinks(id);
        }
        if (i < candidates.length - 1) await new Promise((r) => setTimeout(r, 250 * (i + 1)));
      }
      if (alive) fail();
    })();

    return () => {
      alive = false;
    };
  }, [episodeId, reloadKey]);

  useEffect(() => {
    let alive = true;
    setSkipTimes([]);
    setChapters('');
    if (!malId) return;
    fetchSkipTimes({ malId: String(malId), episodeNumber: String(episodeNumber) })
      .then((res: any) => {
        if (!alive) return;
        const list: SkipTime[] = (res?.results || [])
          .filter((r: SkipTime) => r.skipType === 'op' || r.skipType === 'ed')
          .sort((a: SkipTime, b: SkipTime) => a.interval.startTime - b.interval.startTime);
        setSkipTimes(list);
        if (!list.length) return;
        let vtt = 'WEBVTT\n\n';
        let prev = 0;
        list.forEach(({ interval, skipType }) => {
          if (prev < interval.startTime) vtt += `${fmt(prev)} --> ${fmt(interval.startTime)}\nEpisode ${episodeNumber}\n\n`;
          vtt += `${fmt(interval.startTime)} --> ${fmt(interval.endTime)}\n${skipType === 'op' ? 'Opening' : 'Outro'}\n\n`;
          prev = interval.endTime;
        });
        setChapters(URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [malId, episodeNumber]);

  function onProviderChange(provider: MediaProviderAdapter | null) {
    if (isHLSProvider(provider)) {
      provider.config = {
        startFragPrefetch: true,
        maxBufferLength: 12,
        backBufferLength: 30,
      };
    }
  }

  function mediaKind(source: any) {
    const url: string = source?.url || '';
    if (source?.isMP4) return { src: url, type: 'video/mp4' };
    if (source?.isDASH || /\.mpd(\?|$)/i.test(url)) return { src: url, type: 'application/dash+xml' };
    if (source?.isM3U8 || /\.m3u8(\?|$)/i.test(url) || url.includes('/proxy/hls/')) {
      return { src: url, type: 'application/vnd.apple.mpegurl' };
    }
    return url;
  }

  function nextSource() {
    const list = sources.current;
    const next = sourceIndex.current + 1;
    const source = list[next];
    if (!source?.url) {
      // Every source failed — re-fetch once or twice (the shim rotates providers)
      // before declaring the player unavailable.
      if (reloads.current < 2) {
        reloads.current += 1;
        setPhase('loading');
        setReloadKey((k) => k + 1);
        return;
      }
      dropAnimeStreamingLinks(episodeId);
      fail();
      return;
    }
    sourceIndex.current = next;
    if (source.isEmbed) {
      setEmbed(source.url);
      setSrc('');
      setPhase('ready');
      return;
    }
    setEmbed('');
    setPhase('loading');
    setSrc(mediaKind(source));
  }

  function onTimeUpdate() {
    const p = player.current;
    if (!p) return;
    const t = p.currentTime;
    const now = Date.now();
    if (now - lastSave.current > 4000) {
      lastSave.current = now;
      const all = JSON.parse(localStorage.getItem('all_episode_times') || '{}');
      all[episodeId] = { currentTime: t, playbackPercentage: (t / (p.duration || 1)) * 100 };
      localStorage.setItem('all_episode_times', JSON.stringify(all));
    }
    if (autoSkip && skipTimes.length) {
      const hit = skipTimes.find(({ interval }) => t >= interval.startTime && t < interval.endTime);
      if (hit) p.currentTime = hit.interval.endTime;
    }
  }

  function screenshot() {
    const video = player.current?.el?.querySelector('video');
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${animeTitle || 'episode'}-ep${episodeNumber}.png`;
      a.click();
    });
  }

  const rightControls = (
    <>
      <div className='vds-controls-spacer' />
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <SeekButton className='vds-button' seconds={-10}>
            <SeekBackward10Icon className='vds-icon' />
          </SeekButton>
        </Tooltip.Trigger>
        <Tooltip.Content className='vds-tooltip-content' placement='top'>
          Rewind 10s
        </Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <SeekButton className='vds-button' seconds={10}>
            <SeekForward10Icon className='vds-icon' />
          </SeekButton>
        </Tooltip.Trigger>
        <Tooltip.Content className='vds-tooltip-content' placement='top'>
          Forward 10s
        </Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <PIPButton className='vds-button vds-pip-button'>
            <PictureInPictureIcon className='vds-icon vds-pip-enter-icon' />
            <PictureInPictureExitIcon className='vds-icon vds-pip-exit-icon' />
          </PIPButton>
        </Tooltip.Trigger>
        <Tooltip.Content className='vds-tooltip-content' placement='top'>
          PiP
        </Tooltip.Content>
      </Tooltip.Root>
      <IconButton label='Screenshot' onClick={screenshot}>
        <CameraIcon className='vds-icon' />
      </IconButton>
      {download && (
        <IconButton label='Download' onClick={() => window.open(download, '_blank', 'noopener')}>
          <DownloadIcon className='vds-icon' />
        </IconButton>
      )}
    </>
  );

  if (embed) {
    return (
      <div className={`player ${className || ''}`.trim()} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000' }}>
        <iframe
          title={`${animeTitle || ''} episode ${episodeNumber}`}
          src={embed}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
      </div>
    );
  }

  return (
    <MediaPlayer
      ref={player}
      className={`player ${className || ''}`.trim()}
      title={`${animeTitle || ''} - Episode ${episodeNumber}`}
      src={src as any}
      autoPlay={autoPlay}
      crossOrigin
      playsInline
      aspectRatio='16/9'
      load='eager'
      posterLoad='eager'
      streamType='on-demand'
      storage='miruro-player'
      keyTarget='document'
      onProviderChange={onProviderChange}
      onTimeUpdate={onTimeUpdate}
      onCanPlay={() => setPhase('ready')}
      onError={() => phase !== 'ready' && nextSource()}
      onHlsError={(e: any) => e?.fatal && phase !== 'ready' && nextSource()}
      onEnded={() => autoNext && onEnded()}
    >
      <MediaProvider>
        {banner && <Poster className='vds-poster' src={banner} alt='' />}
        {subtitles.map((s, i) => (
          <Track key={s.url} kind='subtitles' src={s.url} label={s.lang} lang={s.lang.slice(0, 2).toLowerCase()} default={i === 0 || /english/i.test(s.lang)} />
        ))}
        {chapters && <Track kind='chapters' src={chapters} default label='Skip Times' />}
      </MediaProvider>
      <DefaultVideoLayout
        icons={defaultLayoutIcons}
        slots={{
          afterPlayButton: hasNext ? (
            <IconButton label='Next Episode' onClick={onNext}>
              <NextIcon className='vds-icon' />
            </IconButton>
          ) : null,
          chapterTitle: rightControls,
          airPlayButton: null,
          downloadButton: null,
          pipButton: null,
          beforeGoogleCastButton: (
            <IconButton label={theater ? 'Exit Theater' : 'Theater Mode'} onClick={onTheater}>
              {theater ? <TheatreModeExitIcon className='vds-icon' /> : <TheatreModeIcon className='vds-icon' />}
            </IconButton>
          ),
        }}
      />
      {phase !== 'ready' && <LoadingOverlay key={episodeId} logo={logo} error={phase === 'error'} />}
    </MediaPlayer>
  );
}
