import type {
  NeteaseAudioSource,
  NeteaseResolveMode,
  NeteaseResolvedResult,
  NeteaseSong,
} from '../types/bangumi';

interface SearchSong {
  id: number;
  name: string;
  duration?: number;
  dt?: number;
  artists?: Array<{ name?: string }>;
  album?: { id?: number; name?: string; picUrl?: string };
  ar?: Array<{ name?: string }>;
  al?: { id?: number; name?: string; picUrl?: string };
}

interface SearchResponse {
  code?: number;
  result?: { songs?: SearchSong[] };
}

interface AlbumResponse {
  code?: number;
  album?: {
    id?: number;
    name?: string;
    picUrl?: string;
    songs?: SearchSong[];
  };
  resource?: {
    songs?: SearchSong[];
  };
}

export type JsonRequester = <T>(url: string, signal?: AbortSignal) => Promise<T>;

export interface ResolveNeteaseTracksOptions {
  query: string;
  mode?: NeteaseResolveMode;
  endpoint?: string;
  albumEndpoint?: string;
  signal?: AbortSignal;
  requestJson?: JsonRequester;
}

export interface ResolveNeteaseAudioOptions {
  songId: number;
  endpoint?: string;
  signal?: AbortSignal;
  requestJson?: JsonRequester;
}

interface AudioResponse {
  code?: number;
  data?: NeteaseAudioSource[];
}

export async function resolveNeteaseAudioUrl({ songId, endpoint = '/api/netease/song/enhance/player/url/v1', signal, requestJson }: ResolveNeteaseAudioOptions): Promise<string> {
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set('ids', JSON.stringify([songId]));
  url.searchParams.set('level', 'standard');
  url.searchParams.set('encodeType', 'mp3');

  let data: AudioResponse;
  if (requestJson) {
    data = await requestJson<AudioResponse>(url.toString(), signal);
  } else {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`网易云音频加载失败（HTTP ${response.status}）`);
    data = (await response.json()) as AudioResponse;
  }
  if (data.code !== undefined && data.code !== 200) throw new Error(`网易云音频加载失败（${data.code}）`);

  const source = data.data?.find((item) => item.id === songId) ?? data.data?.[0];
  if (!source?.url) throw new Error(source?.code === -110 ? '该曲目暂不可试听' : '该曲目没有可用的试听音源');
  return source.url.replace(/^http:/, 'https:');
}

function mapSong(song: SearchSong, album?: AlbumResponse['album']): NeteaseSong {
  const songAlbum = song.album ?? song.al;
  return {
    id: song.id,
    name: song.name,
    artist: (song.artists ?? song.ar ?? []).map((artist) => artist.name).filter(Boolean).join(' / '),
    duration: song.duration ?? song.dt,
    albumName: songAlbum?.name ?? album?.name,
    albumId: songAlbum?.id ?? album?.id,
    coverUrl: songAlbum?.picUrl ?? album?.picUrl,
  };
}

function uniqueSongs(songs: NeteaseSong[]) {
  return [...new Map(songs.map((song) => [song.id, song])).values()];
}

async function requestJson<T>(url: URL, signal: AbortSignal | undefined, requester?: JsonRequester): Promise<T> {
  if (requester) return requester<T>(url.toString(), signal);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`网易云请求失败（HTTP ${response.status}）`);
  return (await response.json()) as T;
}

async function searchSongs(query: string, endpoint: string, signal: AbortSignal | undefined, requester?: JsonRequester) {
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set('csrf_token', '');
  url.searchParams.set('s', query);
  url.searchParams.set('type', '1');
  url.searchParams.set('offset', '0');
  url.searchParams.set('total', 'true');
  url.searchParams.set('limit', '100');
  const data = await requestJson<SearchResponse>(url, signal, requester);
  if (data.code !== undefined && data.code !== 200) throw new Error(`网易云搜索失败（${data.code}）`);
  return (data.result?.songs ?? []).map((song) => mapSong(song));
}

async function getAlbumSongs(albumId: number, endpoint: string, signal: AbortSignal | undefined, requester?: JsonRequester) {
  const url = new URL(endpoint, window.location.origin);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${albumId}`;
  const data = await requestJson<AlbumResponse>(url, signal, requester);
  if (data.code !== undefined && data.code !== 200) throw new Error(`网易云专辑加载失败（${data.code}）`);
  const songs = data.album?.songs ?? data.resource?.songs ?? [];
  return songs.map((song) => mapSong(song, data.album));
}

function normalize(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[-‐‑‒–—―]/g, '')
    .replace(/[\p{P}\p{S}\s　]/gu, '')
    .toLocaleLowerCase();
}

function getSearchQueries(query: string) {
  const trimmed = query.trim();
  const tokens = trimmed.split(/\s+/).filter((token) => token.length > 1);
  return [...new Set([trimmed, ...tokens])].slice(0, 4);
}

function chooseAlbum(songs: NeteaseSong[], query: string) {
  const queryValue = normalize(query);
  const tokens = query.split(/\s+/).map(normalize).filter((token) => token.length > 1);
  const groups = new Map<number, NeteaseSong[]>();
  for (const song of songs) {
    if (!song.albumId) continue;
    groups.set(song.albumId, [...(groups.get(song.albumId) ?? []), song]);
  }
  return [...groups.values()].sort((a, b) => {
    const score = (group: NeteaseSong[]) => {
      const album = normalize(group[0].albumName ?? '');
      const exact = queryValue && (album.includes(queryValue) || queryValue.includes(album)) ? 1000 : 0;
      return exact + tokens.filter((token) => album.includes(token)).length * 100 + group.length;
    };
    return score(b) - score(a);
  })[0] ?? null;
}

async function completeAlbum(candidate: NeteaseSong[] | null, mode: NeteaseResolveMode, query: string, endpoint: string, signal: AbortSignal | undefined, requester?: JsonRequester) {
  if (!candidate?.[0]?.albumId) return candidate;
  const album = normalize(candidate[0].albumName ?? '');
  const queryValue = normalize(query);
  const queryTokens = query.split(/\s+/).map(normalize).filter((token) => token.length > 1);
  const likelyAlbum = candidate.length > 1 || Boolean(
    album && (
      album.includes(queryValue)
      || queryValue.includes(album)
      || queryTokens.some((token) => album.includes(token) || token.includes(album))
    ),
  );
  if (mode !== 'album' && !likelyAlbum) return candidate;
  try {
    const complete = await getAlbumSongs(candidate[0].albumId, endpoint, signal, requester);
    return complete.length > 0 ? complete : candidate;
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') throw reason;
    return candidate;
  }
}

export async function resolveNeteaseTracks({ query, mode = 'auto', endpoint = '/api/netease/search/get/web', albumEndpoint = '/api/netease/album', signal, requestJson: requester }: ResolveNeteaseTracksOptions): Promise<NeteaseResolvedResult> {
  const results = await Promise.allSettled(getSearchQueries(query).map((searchQuery) => searchSongs(searchQuery, endpoint, signal, requester)));
  const successful = results.filter((result): result is PromiseFulfilledResult<NeteaseSong[]> => result.status === 'fulfilled').flatMap((result) => result.value);
  if (successful.length === 0) {
    const reason = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
    throw reason instanceof Error ? reason : new Error('网易云搜索失败');
  }

  const songs = uniqueSongs(successful);
  if (songs.length === 0) return { mode: 'single', songs: [] };
  if (mode === 'single') return { mode: 'single', songs: [songs[0]] };

  const candidate = chooseAlbum(songs, query);
  const collection = await completeAlbum(candidate, mode, query, albumEndpoint, signal, requester);
  const resolved = collection?.length ? collection : [songs[0]];
  return { mode: resolved.length > 1 ? 'album' : 'single', songs: resolved, albumName: resolved[0].albumName, albumId: resolved[0].albumId };
}
