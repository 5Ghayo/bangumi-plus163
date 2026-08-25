import type { JsonRequester } from './neteaseResolver';

const GD_API_BASE = 'https://music-api.gdstudio.xyz/api.php';
const GD_SONG_SEARCH_COUNT = 20;
const GD_ALBUM_SEARCH_COUNT = 99;
const GD_AUDIO_BITRATE = 128;

interface GdSong {
  id: string | number;
  name: string;
  artist: string[];
  album: string;
  pic_id?: string | number;
}

interface GdAudioResponse {
  url?: string | null;
  br?: number;
  size?: number;
  from?: string;
}

function toNumberId(value: string | number): number {
  return typeof value === 'number' ? value : Number.parseInt(value, 10);
}

function isErrorPayload(data: unknown): data is { detail?: string } {
  return typeof data === 'object' && data !== null && 'detail' in data;
}

async function requestGd<T>(params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const url = new URL(GD_API_BASE);
  url.search = params.toString();
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`GD 音乐台请求失败（HTTP ${response.status}）`);

  const data: unknown = await response.json();
  if (isErrorPayload(data)) throw new Error(data.detail ?? 'GD 音乐台请求失败');
  return data as T;
}

function parseAudioSongId(rawIds: string | null): number {
  if (!rawIds) return Number.NaN;
  try {
    const ids: unknown = JSON.parse(rawIds);
    const first = Array.isArray(ids) ? ids[0] : ids;
    return typeof first === 'string' || typeof first === 'number' ? toNumberId(first) : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

/**
 * BGM 内置组件版无法读取网易云 Cookie，也不能依赖 userscript 管理器，
 * 因此把网易云接口的请求形状映射到支持 CORS 的 GD 音乐台公开接口。
 */
export function createGdstudioRequester(): JsonRequester {
  const albumIds = new Map<string, number>();
  const albumNames = new Map<number, string>();
  let nextAlbumId = 1;

  const albumIdFor = (albumName: string) => {
    if (!albumName) return 0;
    let id = albumIds.get(albumName);
    if (id === undefined) {
      id = nextAlbumId;
      nextAlbumId += 1;
      albumIds.set(albumName, id);
      albumNames.set(id, albumName);
    }
    return id;
  };

  const mapSong = (song: GdSong) => ({
    id: toNumberId(song.id),
    name: song.name,
    artists: (song.artist ?? []).map((artist) => ({ name: artist })),
    album: {
      id: albumIdFor(song.album),
      name: song.album,
      picUrl: song.pic_id ? `https://p1.music.126.net/${song.pic_id}.jpg` : undefined,
    },
  });

  const searchSongs = async (query: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({
      types: 'search',
      source: 'netease',
      name: query,
      count: String(GD_SONG_SEARCH_COUNT),
      pages: '1',
    });
    const songs = await requestGd<GdSong[]>(params, signal);
    return { code: 200, result: { songs: songs.map(mapSong) } };
  };

  const albumTracks = async (albumName: string, albumId: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({
      types: 'search',
      source: 'netease_album',
      name: albumName,
      count: String(GD_ALBUM_SEARCH_COUNT),
      pages: '1',
    });
    const songs = await requestGd<GdSong[]>(params, signal);
    const first = songs[0];
    return {
      code: 200,
      album: {
        id: albumId,
        name: albumName,
        picUrl: first?.pic_id ? `https://p1.music.126.net/${first.pic_id}.jpg` : undefined,
        songs: songs.map(mapSong),
      },
    };
  };

  const songAudio = async (songId: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({
      types: 'url',
      source: 'netease',
      id: String(songId),
      br: String(GD_AUDIO_BITRATE),
    });
    const audio = await requestGd<GdAudioResponse>(params, signal);
    const url = audio.url?.trim();
    if (!url) return { code: 200, data: [{ id: songId, url: null, code: -110 }] };
    return { code: 200, data: [{ id: songId, url: url.replace(/^http:/, 'https:'), code: 200 }] };
  };

  return async <T>(url: string, signal?: AbortSignal): Promise<T> => {
    const parsed = new URL(url, window.location.origin);

    if (parsed.pathname.includes('/api/search/get/web')) {
      const query = parsed.searchParams.get('s') ?? '';
      return (await searchSongs(query, signal)) as unknown as T;
    }

    if (parsed.pathname.includes('/api/album')) {
      const match = parsed.pathname.match(/\/api\/album\/(\d+)$/);
      const albumId = match ? Number(match[1]) : 0;
      const albumName = albumId ? albumNames.get(albumId) : undefined;
      if (!albumName) return { code: 200, album: { id: albumId, name: '', songs: [] } } as unknown as T;
      return (await albumTracks(albumName, albumId, signal)) as unknown as T;
    }

    if (parsed.pathname.includes('/api/song/enhance/player/url/v1')) {
      const songId = parseAudioSongId(parsed.searchParams.get('ids'));
      if (!Number.isFinite(songId)) throw new Error('GD 音乐台无法解析音频请求');
      return (await songAudio(songId, signal)) as unknown as T;
    }

    if (parsed.pathname.includes('/api/nuser/account/get')) {
      return { profile: null } as unknown as T;
    }

    throw new Error(`GD 音乐台不支持该请求：${parsed.pathname}`);
  };
}
