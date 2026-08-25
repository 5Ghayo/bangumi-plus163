import { LoaderCircle, Pause, Play } from 'lucide-react';
import type { NeteaseSong } from '../types/bangumi';

export type AudioPlayerState = {
  songId: number | null;
  status: 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';
  currentTime: number;
  duration: number;
  error: string | null;
};

interface Props {
  song: NeteaseSong;
  player: AudioPlayerState;
  onToggle: (song: NeteaseSong) => void;
  onSeek: (value: number) => void;
}

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

export default function TrackPreviewControl({ song, player, onToggle, onSeek }: Props) {
  const active = player.songId === song.id;
  const loading = active && player.status === 'loading';
  const playing = active && player.status === 'playing';
  const duration = active ? player.duration || (song.duration ?? 0) / 1000 : 0;
  const progress = active ? Math.min(player.currentTime, duration || player.currentTime) : 0;

  return (
    <span className="bangumi-plus-track-control" title={active && player.error ? player.error : undefined}>
      <button
        className={`bangumi-plus-track-control__button${active && !loading ? ' bangumi-plus-track-control__button--active' : ''}`}
        type="button"
        onClick={() => onToggle(song)}
        disabled={loading}
        aria-label={loading ? '正在加载试听' : playing ? '暂停试听' : '试听'}
        title={loading ? '正在加载试听' : playing ? '暂停试听' : '试听'}
      >
        {loading ? <LoaderCircle size={13} className="bangumi-plus-track-control__spinner" aria-hidden="true" /> : playing ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
        {!active && <span>试听</span>}
      </button>
      {active && !player.error && (
        <>
          <input
            className="bangumi-plus-track-control__progress"
            type="range"
            min="0"
            max={Math.max(duration, 0.01)}
            step="0.1"
            value={progress}
            onChange={(event) => onSeek(Number(event.target.value))}
            disabled={loading || !duration}
            aria-label="试听进度"
          />
          <span className="bangumi-plus-track-control__time">
            {formatTime(player.currentTime)} / {formatTime(duration)}
          </span>
        </>
      )}
      {active && player.error && <span className="bangumi-plus-track-control__error">{player.error}</span>}
    </span>
  );
}
