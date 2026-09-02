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
  artists?: Array<{ name?: string; alias?: string[]; trans?: string[] }>;
  album?: { id?: number; name?: string; picUrl?: string };
  ar?: Array<{ name?: string; alias?: string[]; trans?: string[] }>;
  al?: { id?: number; name?: string; picUrl?: string };
}

interface SearchResponse {
  code?: number;
  result?: { songs?: SearchSong[] };
}

interface AlbumResponse {
  code?: number;
  songs?: SearchSong[];
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
  expectedAlbum?: string;
  trackTitle?: string;
  expectedArtists?: string[];
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

function getSongArtists(song: SearchSong) {
  const songArtists = song.artists ?? song.ar ?? [];
  return songArtists.map((artist) => artist.name).filter(Boolean);
}

function getSongArtistAliases(song: SearchSong) {
  const songArtists = song.artists ?? song.ar ?? [];
  return songArtists.flatMap((artist) => [...artist.alias ?? [], ...artist.trans ?? []]).filter(Boolean);
}

function mapSong(song: SearchSong, album?: AlbumResponse['album']): NeteaseSong {
  const songAlbum = song.album ?? song.al;
  return {
    id: song.id,
    name: song.name,
    artist: getSongArtists(song).join(' / '),
    artistAliases: getSongArtistAliases(song),
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
  const songs = data.album?.songs ?? data.songs ?? data.resource?.songs ?? [];
  return songs.map((song) => mapSong(song, data.album));
}

function normalize(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[-‐‑‒–—―]/g, '')
    .replace(/[\p{P}\p{S}\s　]/gu, '')
    .toLocaleLowerCase();
}

function normalizeArtist(value: string) {
  return normalize(value.replace(/\s+/g, ' '));
}

function artistOverlapScore(song: NeteaseSong, expectedArtists?: string[]) {
  if (!expectedArtists?.length || !song.artist.trim()) return 0;
  const songArtists = [song.artist, ...(song.artistAliases ?? [])]
    .flatMap((artist) => artist.split(/\s*\/\s*/))
    .map(normalizeArtist)
    .filter(Boolean);
  const expectedValues = expectedArtists.map(normalizeArtist).filter(Boolean);

  return expectedValues.reduce((score, expected) => {
    const best = songArtists.reduce((artistScore, artist) => {
      if (artist === expected) return Math.max(artistScore, 1);
      if (artist.includes(expected) || expected.includes(artist)) return Math.max(artistScore, 0.6);
      return artistScore;
    }, 0);
    return score + best;
  }, 0);
}

function getSearchQueries(query: string, trackTitle?: string) {
  const trimmed = query.trim();
  const track = trackTitle?.trim();
  const trackWithAlbum = track ? `${track} ${trimmed}` : '';
  const tokens = trimmed.split(/\s+/).filter((token) => token.length > 1);
  return [...new Set([trackWithAlbum, trimmed, ...tokens])].filter(Boolean).slice(0, 4);
}

function albumNameMatches(albumName: string | undefined, expectedAlbum: string) {
  if (!expectedAlbum.trim()) return true;
  if (!albumName?.trim()) return false;

  const album = normalize(albumName);
  const expected = normalize(expectedAlbum);
  if (!album || !expected) return false;
  if (album === expected || album.includes(expected) || expected.includes(album)) return true;

  const albumTokens = albumName.split(/\s+/).map(normalize).filter((token) => token.length > 1);
  const expectedTokens = expectedAlbum.split(/\s+/).map(normalize).filter((token) => token.length > 1);
  return expectedTokens.some((expectedToken) => albumTokens.some((albumToken) => {
    return albumToken === expectedToken || albumToken.includes(expectedToken) || expectedToken.includes(albumToken);
  }));
}

function chooseAlbumCandidates(songs: NeteaseSong[], query: string, expectedArtists?: string[]) {
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
      const artistScore = Math.max(...group.map((song) => artistOverlapScore(song, expectedArtists)), 0);
      return exact + tokens.filter((token) => album.includes(token)).length * 100 + artistScore * 500 + group.length;
    };
    return score(b) - score(a);
  });
}

function chooseSingleSong(songs: NeteaseSong[], trackTitle: string | undefined, expectedAlbum: string | undefined, expectedArtists?: string[]) {
  const normalizedTrack = normalize(trackTitle ?? '');
  const normalizedAlbum = normalize(expectedAlbum ?? '');

  const candidates = songs.map((song, index) => {
    const title = normalize(song.name);
    const titleScore = !normalizedTrack ? 0
      : title === normalizedTrack ? 1000
        : title.includes(normalizedTrack) || normalizedTrack.includes(title) ? 700 - Math.abs(title.length - normalizedTrack.length)
          : 0;
    const albumScore = normalizedAlbum && song.albumName && normalize(song.albumName).includes(normalizedAlbum) ? 300 : 0;
    const artistScore = artistOverlapScore(song, expectedArtists) * 500;
    return { song, titleScore, score: titleScore + albumScore + artistScore - index / songs.length };
  });
  const exactCandidates = normalizedTrack
    ? candidates.filter(({ titleScore }) => titleScore === 1000)
    : [];
  const usableCandidates = exactCandidates.length > 0 ? exactCandidates : candidates;

  return [...usableCandidates].sort((a, b) => b.score - a.score)[0]?.song ?? songs[0];
}

async function loadMatchingAlbum(candidates: NeteaseSong[][], expectedAlbum: string, endpoint: string, signal: AbortSignal | undefined, requester?: JsonRequester) {
  const matchingCandidates = expectedAlbum.trim()
    ? candidates.filter((candidate) => albumNameMatches(candidate[0]?.albumName, expectedAlbum))
    : candidates;

  for (const candidate of matchingCandidates) {
    if (!candidate[0]?.albumId) continue;
    try {
      const complete = await getAlbumSongs(candidate[0].albumId, endpoint, signal, requester);
      if (complete.length > 0 && albumNameMatches(complete[0].albumName, expectedAlbum)) return complete;
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') throw reason;
    }
  }

  return null;
}

export async function resolveNeteaseTracks({
  query,
  expectedAlbum,
  trackTitle,
  expectedArtists,
  mode = 'auto',
  endpoint = '/api/netease/search/get/web',
  albumEndpoint = '/api/netease/album',
  signal,
  requestJson: requester,
}: ResolveNeteaseTracksOptions): Promise<NeteaseResolvedResult> {
  const results = await Promise.allSettled(getSearchQueries(query, trackTitle).map((searchQuery) => searchSongs(searchQuery, endpoint, signal, requester)));
  const successful = results.filter((result): result is PromiseFulfilledResult<NeteaseSong[]> => result.status === 'fulfilled').flatMap((result) => result.value);
  if (successful.length === 0) {
    const reason = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
    throw reason instanceof Error ? reason : new Error('网易云搜索失败');
  }

  const songs = uniqueSongs(successful);
  if (songs.length === 0) return { mode: 'single', songs: [] };
  if (mode === 'single') return { mode: 'single', songs: [chooseSingleSong(songs, trackTitle, expectedAlbum, expectedArtists)] };

  const candidates = chooseAlbumCandidates(songs, query, expectedArtists);
  const collection = await loadMatchingAlbum(candidates, expectedAlbum?.trim() || query, albumEndpoint, signal, requester);
  const resolved = collection?.length ? collection : [chooseSingleSong(songs, trackTitle, expectedAlbum, expectedArtists)];
  return { mode: resolved.length > 1 ? 'album' : 'single', songs: resolved, albumName: resolved[0].albumName, albumId: resolved[0].albumId };
}
