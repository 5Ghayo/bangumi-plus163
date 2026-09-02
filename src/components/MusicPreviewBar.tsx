import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, ChevronUp, LoaderCircle, LogIn, Minus, Play, Plus, X } from 'lucide-react';
import TrackPreviewControl, { type AudioPlayerState } from './TrackPreviewControl';
import { useNeteaseTracks } from '../hooks/useNeteaseTracks';
import { findBangumiTrackRows, getBangumiArtistNames, getBangumiTrackTitle } from '../integration/bangumiPage';
import { resolveNeteaseAudioUrl } from '../lib/neteaseResolver';
import type { JsonRequester } from '../lib/neteaseResolver';
import type { BangumiSubject, NeteaseResolveMode, NeteaseSong } from '../types/bangumi';
import trackControlStyles from '../styles/trackControl.css?inline';

interface Props {
  subject: BangumiSubject;
  endpoint: string;
  albumEndpoint: string;
  audioEndpoint: string;
  accountEndpoint: string;
  requestJson: JsonRequester;
  mode?: NeteaseResolveMode;
  sourceLabel?: string;
  autoFillAlbumOnFirstMatch?: boolean;
}

interface NeteaseAccountResponse {
  profile?: {
    userId?: number;
  } | null;
  data?: {
    profile?: {
      userId?: number;
    } | null;
  };
}

interface RowBinding {
  host: HTMLSpanElement;
  song: NeteaseSong;
}

function createRowBindingStore() {
  let bindings: RowBinding[] = [];
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => bindings,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    replace(nextBindings: RowBinding[]) {
      bindings = nextBindings;
      listeners.forEach((listener) => listener());
    },
  };
}

const EMPTY_PLAYER: AudioPlayerState = {
  songId: null,
  status: 'idle',
  currentTime: 0,
  duration: 0,
  error: null,
};

const VOLUME_STORAGE_KEY = 'bangumi-plus-music-volume';
const ALBUM_AUTO_FILL_MIN_MATCHES = 3;

function readStoredVolume() {
  try {
    const value = Number(window.localStorage.getItem(VOLUME_STORAGE_KEY));
    if (Number.isFinite(value)) return Math.min(1, Math.max(0, value));
  } catch {
    // localStorage may be unavailable in restrictive embeds; fall through.
  }
  return 0.75;
}

function normalizeTrackTitle(title: string) {
  return title
    .normalize('NFKC')
    .replace(/^\s*\d+\s*[.、:：)）-]?\s*/, '')
    .replace(/[-‐‑‒–—―]/g, '')
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/[\s　]+/g, '')
    .toLocaleLowerCase();
}

function artistOverlapScore(song: NeteaseSong, expectedArtists: string[]) {
  if (!expectedArtists.length || !song.artist.trim()) return 0;
  const artists = [song.artist, ...(song.artistAliases ?? [])]
    .flatMap((artist) => artist.split(/\s*\/\s*/))
    .map((artist) => normalizeTrackTitle(artist));
  return expectedArtists.reduce((score, expected) => {
    const normalizedExpected = normalizeTrackTitle(expected);
    const best = artists.reduce((artistScore, artist) => {
      if (!artist || !normalizedExpected) return artistScore;
      if (artist === normalizedExpected) return Math.max(artistScore, 1);
      if (artist.includes(normalizedExpected) || normalizedExpected.includes(artist)) return Math.max(artistScore, 0.6);
      return artistScore;
    }, 0);
    return score + best;
  }, 0);
}

function matchSong(title: string, songs: NeteaseSong[], expectedArtists: string[] = []) {
  const normalizedTitle = normalizeTrackTitle(title);
  if (!normalizedTitle) return null;

  const candidates = songs
    .map((song, index) => {
      const name = normalizeTrackTitle(song.name);
      const isExact = name === normalizedTitle;
      const titleScore = isExact ? 1000
        : name.includes(normalizedTitle) || normalizedTitle.includes(name) ? -Math.abs(name.length - normalizedTitle.length)
          : -Infinity;
      return { song, name, titleScore, artistScore: artistOverlapScore(song, expectedArtists), index };
    })
    .filter(({ name: normalizedSongName }) => normalizedSongName.length > 2 && (normalizedSongName.includes(normalizedTitle) || normalizedTitle.includes(normalizedSongName)))
    .sort((a, b) => a.index - b.index);

  const exactCandidates = candidates.filter(({ titleScore }) => titleScore === 1000);
  const usableCandidates = exactCandidates.length > 0 ? exactCandidates : candidates;
  return [...usableCandidates]
    .sort((a, b) => b.artistScore - a.artistScore)[0]?.song ?? null;
}

function matchRowsWithSongs(
  rows: HTMLElement[],
  songs: NeteaseSong[],
  resultMode: 'single' | 'album',
  expectedArtists: string[],
  autoFillOnFirstMatch: boolean,
) {
  const usedSongIds = new Set<number>();
  const matches = rows.map((row) => {
    const title = getBangumiTrackTitle(row).replace(/\s*[／/].*$/, '');
    const availableSongs = songs.filter((song) => !usedSongIds.has(song.id));
    const song = matchSong(title, availableSongs, expectedArtists);
    if (song) usedSongIds.add(song.id);
    return song;
  });

  const unusedSongs = songs.filter((song) => !usedSongIds.has(song.id));
  let unusedIndex = 0;
  if (resultMode !== 'album') return matches;
  const matchedCount = matches.filter(Boolean).length;
  if (autoFillOnFirstMatch ? !matches[0] : matchedCount < ALBUM_AUTO_FILL_MIN_MATCHES) return matches;

  return matches.map((song) => song ?? unusedSongs[unusedIndex++]);
}

export default function MusicPreviewBar({
  subject,
  endpoint,
  albumEndpoint,
  audioEndpoint,
  accountEndpoint,
  requestJson,
  mode = 'auto',
  sourceLabel = '网易云音乐',
  autoFillAlbumOnFirstMatch = false,
}: Props) {
  const [opened, setOpened] = useState(false);
  const [searchSession, setSearchSession] = useState(0);
  const [player, setPlayer] = useState<AudioPlayerState>(EMPTY_PLAYER);
  const [volume, setVolume] = useState(readStoredVolume);
  const [accountStatus, setAccountStatus] = useState<'checking' | 'logged-in' | 'logged-out'>('checking');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const currentSongIdRef = useRef<number | null>(null);
  const [rowBindingStore] = useState(createRowBindingStore);
  const rowBindings = useSyncExternalStore(
    rowBindingStore.subscribe,
    rowBindingStore.getSnapshot,
    rowBindingStore.getSnapshot,
  );

  const displayName = subject.name_cn || subject.name;
  const query = subject.name_cn && subject.name !== subject.name_cn ? `${subject.name_cn} ${subject.name}` : displayName;
  const trackTitle = useMemo(() => {
    if (!opened) return '';
    return findBangumiTrackRows()
      .map((row) => getBangumiTrackTitle(row).replace(/\s*[／/].*$/, ''))
      .find(Boolean) ?? '';
  }, [opened]);
  const expectedArtists = useMemo(() => {
    if (!opened) return [];
    return getBangumiArtistNames();
  }, [opened]);
  const { result, loading, error } = useNeteaseTracks({
    query,
    expectedAlbum: displayName,
    trackTitle,
    expectedArtists,
    mode,
    endpoint,
    albumEndpoint,
    requestJson,
    enabled: opened,
    cacheKey: searchSession,
  });
  const songs = useMemo(() => result?.songs ?? [], [result]);

  useEffect(() => {
    if (!document.head.querySelector('[data-bangumi-plus-track-control-style]')) {
      const style = document.createElement('style');
      style.setAttribute('data-bangumi-plus-track-control-style', 'true');
      style.textContent = trackControlStyles;
      document.head.append(style);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshAccountStatus = async () => {
      setAccountStatus('checking');
      try {
        const account = await requestJson<NeteaseAccountResponse>(accountEndpoint);
        const profile = account.profile ?? account.data?.profile;
        if (!cancelled) setAccountStatus(profile?.userId ? 'logged-in' : 'logged-out');
      } catch {
        // Treat an unavailable account endpoint as logged out so users can still log in.
        if (!cancelled) setAccountStatus('logged-out');
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshAccountStatus();
    };

    void refreshAccountStatus();
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [accountEndpoint, requestJson]);

  useEffect(() => {
    if (!opened || !result || songs.length === 0) {
      return;
    }

    const bindings: RowBinding[] = [];
    const rows = findBangumiTrackRows();
    const rowMatches = matchRowsWithSongs(rows, songs, result.mode, expectedArtists, autoFillAlbumOnFirstMatch);
    for (const [index, song] of rowMatches.entries()) {
      const row = rows[index];
      const heading = row.querySelector<HTMLElement>('h6');
      if (!song || !heading) continue;

      const host = document.createElement('span');
      host.dataset.bangumiPlusTrackControl = 'true';
      heading.append(host);
      bindings.push({ host, song });
    }
    rowBindingStore.replace(bindings);

    return () => {
      for (const binding of bindings) binding.host.remove();
      rowBindingStore.replace([]);
    };
  }, [autoFillAlbumOnFirstMatch, expectedArtists, opened, result, rowBindingStore, songs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setPlayer((current) => current.songId === currentSongIdRef.current ? {
      ...current,
      currentTime: audio.currentTime,
      duration: Number.isFinite(audio.duration) ? audio.duration : current.duration,
    } : current);
    const markPlaying = () => setPlayer((current) => current.songId === currentSongIdRef.current ? { ...current, status: 'playing' } : current);
    const markPaused = () => setPlayer((current) => current.songId === currentSongIdRef.current ? { ...current, status: 'paused' } : current);
    const markLoading = () => setPlayer((current) => current.songId === currentSongIdRef.current ? { ...current, status: 'loading' } : current);
    const markReady = () => setPlayer((current) => current.songId === currentSongIdRef.current ? { ...current, status: audio.paused ? 'ready' : 'playing', duration: audio.duration || current.duration } : current);
    const markEnded = () => setPlayer((current) => current.songId === currentSongIdRef.current ? { ...current, status: 'ready', currentTime: audio.duration || current.currentTime, duration: audio.duration || current.duration } : current);
    const markError = () => setPlayer((current) => current.songId === currentSongIdRef.current ? { ...current, status: 'error', error: '音频加载失败' } : current);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateTime);
    audio.addEventListener('play', markPlaying);
    audio.addEventListener('pause', markPaused);
    audio.addEventListener('waiting', markLoading);
    audio.addEventListener('canplay', markReady);
    audio.addEventListener('ended', markEnded);
    audio.addEventListener('error', markError);
    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateTime);
      audio.removeEventListener('play', markPlaying);
      audio.removeEventListener('pause', markPaused);
      audio.removeEventListener('waiting', markLoading);
      audio.removeEventListener('canplay', markReady);
      audio.removeEventListener('ended', markEnded);
      audio.removeEventListener('error', markError);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    try {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, volume.toString());
    } catch {
      // Saving is best-effort; playback still works with the in-memory value.
    }
  }, [volume]);

  useEffect(() => () => {
    requestControllerRef.current?.abort();
    audioRef.current?.pause();
    audioRef.current?.removeAttribute('src');
    audioRef.current?.load();
  }, []);

  const toggleSong = async (song: NeteaseSong) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentSongIdRef.current === song.id) {
      if (player.status === 'loading') return;
      if (player.status === 'error' && !audio.src) {
        currentSongIdRef.current = null;
      } else if (player.status === 'error') {
        try {
          setPlayer((current) => ({ ...current, status: 'loading', error: null }));
          await audio.play();
        } catch {
          setPlayer((current) => ({ ...current, status: 'error', error: '浏览器阻止了播放' }));
        }
        return;
      }
    }

    if (currentSongIdRef.current === song.id) {
      if (audio.paused) {
        try {
          if (audio.ended || (audio.duration > 0 && audio.currentTime >= audio.duration)) {
            audio.currentTime = 0;
          }
          await audio.play();
        } catch {
          setPlayer((current) => ({ ...current, status: 'error', error: '浏览器阻止了播放' }));
        }
      } else {
        audio.pause();
      }
      return;
    }

    requestControllerRef.current?.abort();
    currentSongIdRef.current = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    currentSongIdRef.current = song.id;
    setPlayer({ songId: song.id, status: 'loading', currentTime: 0, duration: (song.duration ?? 0) / 1000, error: null });
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const url = await resolveNeteaseAudioUrl({ songId: song.id, endpoint: audioEndpoint, requestJson, signal: controller.signal });
      if (controller.signal.aborted || currentSongIdRef.current !== song.id) return;
      audio.src = url;
      audio.load();
      await audio.play();
      if (currentSongIdRef.current === song.id) setPlayer((current) => ({ ...current, status: 'playing' }));
    } catch (reason: unknown) {
      if (controller.signal.aborted || currentSongIdRef.current !== song.id) return;
      setPlayer((current) => ({ ...current, status: 'error', error: reason instanceof Error ? reason.message : '试听加载失败' }));
    }
  };

  const seek = (value: number) => {
    if (!audioRef.current || currentSongIdRef.current === null) return;
    audioRef.current.currentTime = value;
    setPlayer((current) => ({ ...current, currentTime: value }));
  };

  const changeVolume = (delta: number) => {
    setVolume((current) => Math.min(1, Math.max(0, Number((current + delta).toFixed(2)))));
  };

  const open = () => {
    setSearchSession((current) => current + 1);
    setOpened(true);
  };

  const close = () => {
    requestControllerRef.current?.abort();
    audioRef.current?.pause();
    audioRef.current?.removeAttribute('src');
    audioRef.current?.load();
    currentSongIdRef.current = null;
    setOpened(false);
    rowBindingStore.replace([]);
    setPlayer(EMPTY_PLAYER);
  };

  const openNeteaseLogin = () => {
    const loginWindow = window.open('https://music.163.com/#/login', '_blank', 'noopener,noreferrer');
    if (loginWindow) loginWindow.opener = null;
  };

  const loginButtonLabel = accountStatus === 'logged-in' ? '已登录' : '登录';
  const loginButtonTitle = accountStatus === 'logged-in' ? '网易云音乐账号已登录' : '登录网易云音乐账号';

  return (
    <section className={`music-preview${opened ? ' music-preview--open' : ''}`}>
      <div className="music-preview__toolbar">
        <div className="music-preview__toolbar-actions">
          <button className="music-preview__toggle" type="button" onClick={() => (opened ? close() : open())} aria-expanded={opened}>
            {loading ? <LoaderCircle size={14} className="music-preview__spinner" aria-hidden="true" /> : opened ? <ChevronUp size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            <span>{opened ? '收起试听' : '试听'}</span>
            <span className="music-preview__source">{sourceLabel}</span>
          </button>
          <button className={`music-preview__login${accountStatus === 'logged-in' ? ' music-preview__login--active' : ''}`} type="button" onClick={openNeteaseLogin} title={loginButtonTitle} aria-label={loginButtonTitle}>
            {accountStatus === 'checking' ? <LoaderCircle size={13} className="music-preview__spinner" aria-hidden="true" /> : accountStatus === 'logged-in' ? <Check size={13} aria-hidden="true" /> : <LogIn size={13} aria-hidden="true" />}
            <span>{loginButtonLabel}</span>
          </button>
        </div>
        {opened && <button className="music-preview__close" type="button" onClick={close} aria-label="关闭试听列表" title="关闭试听列表"><X size={14} aria-hidden="true" /></button>}
      </div>
      {opened && (
        <div className="music-preview__body">
          <div className="music-preview__volume">
            <button className="music-preview__volume-button" type="button" onClick={() => changeVolume(-0.05)} aria-label="减小音量" title="减小音量">
              <Minus size={13} aria-hidden="true" />
            </button>
            <input
              className="music-preview__volume-range"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              aria-label="试听音量"
            />
            <button className="music-preview__volume-button" type="button" onClick={() => changeVolume(0.05)} aria-label="增大音量" title="增大音量">
              <Plus size={13} aria-hidden="true" />
            </button>
            <span className="music-preview__volume-value">{Math.round(volume * 100)}%</span>
          </div>
          {loading && <p className="music-preview__status"><LoaderCircle size={14} className="music-preview__spinner" aria-hidden="true" />正在匹配曲目...</p>}
          {!loading && error && <p className="music-preview__status music-preview__status--error">{error}</p>}
          {!loading && !error && result && songs.length === 0 && <p className="music-preview__status">没有找到匹配的{sourceLabel}曲目</p>}
          {!loading && !error && songs.length > 0 && <p className="music-preview__status">已匹配 {songs.length} 首，点击原生曲目右侧的试听按钮播放</p>}
        </div>
      )}
      <audio ref={audioRef} preload="none" aria-hidden="true" style={{ display: 'none' }} />
      {rowBindings.map(({ host, song }) => createPortal(<TrackPreviewControl key={song.id} song={song} player={player} onToggle={toggleSong} onSeek={seek} />, host))}
    </section>
  );
}
