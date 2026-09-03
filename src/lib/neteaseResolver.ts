import type {
  NeteaseAudioSource,
  NeteaseResolveMode,
  NeteaseResolvedResult,
  NeteaseSong,
} from '../types/bangumi';
import {
  SIMILAR_TITLE_THRESHOLD,
  cleanTrackTitle,
  textSimilarity,
} from './titleMatch';

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
  expectedTracks?: string[];
  expectedArtists?: string[];
  expectedTrackCount?: number;
  autoFillAlbumOnFirstMatch?: boolean;
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
  const songs = [data.album?.songs, data.songs, data.resource?.songs]
    .find((candidate) => candidate?.length) ?? [];
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

function getSearchQueries(query: string, trackTitles: string[]) {
  const trimmed = query.trim();
  const anchors = trackTitles.slice(0, 3).map(cleanTrackTitle).filter(Boolean);
  const trackWithAlbumQueries = anchors.map((track) => `${track} ${trimmed}`);
  const tokens = trimmed.split(/\s+/).filter((token) => token.length > 1);
  // Album names can make NCM cloudsearch miss the actual soundtrack, so the
  // exact track titles are always searched too.
  return [...new Set([...trackWithAlbumQueries, trimmed, ...anchors, ...tokens])]
    .filter(Boolean)
    .slice(0, 7);
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
  if (textSimilarity(albumName, expectedAlbum) >= 0.82) return true;
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

function albumMatchScore(song: NeteaseSong, expectedAlbum: string | undefined) {
  const normalizedAlbum = normalize(expectedAlbum ?? '');
  if (!normalizedAlbum || !song.albumName || !expectedAlbum) return 0;
  const album = normalize(song.albumName);
  if (album === normalizedAlbum) return 400;
  if (album.includes(normalizedAlbum) || normalizedAlbum.includes(album)) return 300;
  if (textSimilarity(expectedAlbum, song.albumName) >= 0.82) return 250;
  return 0;
}

function isTrackTitleMatch(expectedTitle: string, songTitle: string) {
  const expected = cleanTrackTitle(expectedTitle);
  if (!expected || !songTitle.trim()) return false;
  return textSimilarity(expected, songTitle) >= SIMILAR_TITLE_THRESHOLD;
}

function countAlbumMatches(
  collection: NeteaseSong[],
  expectedTracks: string[],
  expectedArtists?: string[],
) {
  const usedSongIds = new Set<number>();
  let matchedCount = 0;

  for (const expectedTitle of expectedTracks) {
    const availableSongs = collection.filter((song) => !usedSongIds.has(song.id));
    const song = getFirstMatchCandidates(
      availableSongs,
      expectedTitle,
      collection[0]?.albumName,
      expectedArtists,
    )[0];
    if (!song || !isTrackTitleMatch(expectedTitle, song.name)) continue;
    usedSongIds.add(song.id);
    matchedCount += 1;
  }

  return matchedCount;
}

function getRequiredAlbumMatchCount(expectedTracks: string[]) {
  return Math.min(3, expectedTracks.length);
}

function getAlbumAnchorCandidates(
  songs: NeteaseSong[],
  expectedTracks: string[],
  expectedAlbum: string | undefined,
  expectedArtists?: string[],
) {
  const anchors: NeteaseSong[] = [];
  const seenSongIds = new Set<number>();

  // If the first song accidentally points at a cover/special edition, later
  // Bangumi rows provide independent album anchors.
  for (const trackTitle of expectedTracks.slice(0, 4)) {
    for (const song of getFirstMatchCandidates(songs, trackTitle, expectedAlbum, expectedArtists).slice(0, 2)) {
      if (!song.albumId || seenSongIds.has(song.id)) continue;
      seenSongIds.add(song.id);
      anchors.push(song);
    }
  }

  return anchors;
}

function chooseSingleSong(songs: NeteaseSong[], trackTitle: string | undefined, expectedAlbum: string | undefined, expectedArtists?: string[]) {
  return getFirstMatchCandidates(songs, trackTitle, expectedAlbum, expectedArtists)[0] ?? songs[0];
}

function getFirstMatchCandidates(songs: NeteaseSong[], trackTitle: string | undefined, expectedAlbum: string | undefined, expectedArtists?: string[]) {
  const expectedTitle = cleanTrackTitle(trackTitle);

  const candidates = songs.map((song, index) => {
    const titleSimilarity = expectedTitle ? textSimilarity(expectedTitle, song.name) : 0;
    const titleScore = titleSimilarity * 1000;
    const albumScore = albumMatchScore(song, expectedAlbum);
    const artistScore = artistOverlapScore(song, expectedArtists) * 500;
    return { song, titleScore, titleSimilarity, score: titleScore + albumScore + artistScore - index / songs.length };
  });
  const exactCandidates = expectedTitle
    ? candidates.filter(({ titleSimilarity }) => titleSimilarity >= 0.999)
    : candidates;
  const similarCandidates = expectedTitle
    ? candidates.filter(({ titleSimilarity }) => titleSimilarity >= SIMILAR_TITLE_THRESHOLD)
    : candidates;
  const usableCandidates = exactCandidates.length > 0
    ? exactCandidates
    : similarCandidates.length > 0 ? similarCandidates : candidates;

  return [...usableCandidates]
    .sort((a, b) => b.score - a.score)
    .map(({ song }) => song);
}

async function loadMatchingAlbum(
  candidates: NeteaseSong[][],
  expectedAlbum: string,
  endpoint: string,
  signal: AbortSignal | undefined,
  requester?: JsonRequester,
  expectedTracks: string[] = [],
  expectedArtists?: string[],
  expectedTrackCount?: number,
) {
  const matchingCandidates = expectedAlbum.trim()
    ? candidates.filter((candidate) => albumNameMatches(candidate[0]?.albumName, expectedAlbum))
    : candidates;

  for (const candidate of matchingCandidates) {
    if (!candidate[0]?.albumId) continue;
    try {
      const complete = await getAlbumSongs(candidate[0].albumId, endpoint, signal, requester);
      if (!complete.length || !albumNameMatches(complete[0].albumName, expectedAlbum)) continue;
      if (expectedTrackCount && Math.abs(complete.length - expectedTrackCount) > 1) continue;
      if (expectedTracks.length && countAlbumMatches(complete, expectedTracks, expectedArtists) < getRequiredAlbumMatchCount(expectedTracks)) continue;
      return complete;
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') throw reason;
    }
  }

  return null;
}

async function loadAlbumForAnchor(
  song: NeteaseSong,
  endpoint: string,
  signal: AbortSignal | undefined,
  requester?: JsonRequester,
) {
  if (!song.albumId) return null;
  const complete = await getAlbumSongs(song.albumId, endpoint, signal, requester);
  if (!complete.some((track) => track.id === song.id)) return null;
  return complete;
}

async function loadAlbumUsingTrackAnchors({
  songs,
  expectedAlbum,
  expectedTracks,
  expectedArtists,
  expectedTrackCount,
  endpoint,
  signal,
  requester,
}: {
  songs: NeteaseSong[];
  expectedAlbum: string | undefined;
  expectedTracks: string[];
  expectedArtists?: string[];
  expectedTrackCount?: number;
  endpoint: string;
  signal: AbortSignal | undefined;
  requester?: JsonRequester;
}): Promise<NeteaseResolvedResult | null> {
  const anchorCandidates = getAlbumAnchorCandidates(songs, expectedTracks, expectedAlbum, expectedArtists);
  const requiredMatches = getRequiredAlbumMatchCount(expectedTracks);
  const triedAlbumIds = new Set<number>();
  let fallback: { collection: NeteaseSong[]; score: number } | null = null;

  for (const anchor of anchorCandidates) {
    if (anchor.albumId === undefined) continue;
    if (triedAlbumIds.has(anchor.albumId)) continue;
    triedAlbumIds.add(anchor.albumId);

    try {
      const collection = await loadAlbumForAnchor(anchor, endpoint, signal, requester);
      if (!collection || collection.length <= 1) continue;

      const matchedCount = countAlbumMatches(collection, expectedTracks, expectedArtists);
      const countDelta = expectedTrackCount ? Math.abs(collection.length - expectedTrackCount) : 0;
      if (matchedCount >= requiredMatches && (!expectedTrackCount || countDelta <= 1)) {
        return {
          mode: 'album',
          songs: collection,
          albumName: collection[0].albumName,
          albumId: collection[0].albumId,
        };
      }

      const score = matchedCount * 100 - countDelta;
      if (!fallback || score > fallback.score) fallback = { collection, score };
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') throw reason;
    }
  }

  if (!fallback) return null;
  return {
    mode: 'album',
    songs: fallback.collection,
    albumName: fallback.collection[0].albumName,
    albumId: fallback.collection[0].albumId,
  };
}

export async function resolveNeteaseTracks({
  query,
  expectedAlbum,
  trackTitle,
  expectedTracks: expectedTrackList,
  expectedArtists,
  expectedTrackCount,
  autoFillAlbumOnFirstMatch = false,
  mode = 'auto',
  endpoint = '/api/netease/search/get/web',
  albumEndpoint = '/api/netease/album',
  signal,
  requestJson: requester,
}: ResolveNeteaseTracksOptions): Promise<NeteaseResolvedResult> {
  const expectedTracks = expectedTrackList?.length ? expectedTrackList : trackTitle ? [trackTitle] : [];
  const results = await Promise.allSettled(getSearchQueries(query, expectedTracks).map((searchQuery) => searchSongs(searchQuery, endpoint, signal, requester)));
  const successful = results.filter((result): result is PromiseFulfilledResult<NeteaseSong[]> => result.status === 'fulfilled').flatMap((result) => result.value);
  if (successful.length === 0) {
    const reason = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
    throw reason instanceof Error ? reason : new Error('网易云搜索失败');
  }

  const songs = uniqueSongs(successful);
  if (songs.length === 0) return { mode: 'single', songs: [] };
  if (mode === 'single') return { mode: 'single', songs: [chooseSingleSong(songs, trackTitle, expectedAlbum, expectedArtists)] };

  if (autoFillAlbumOnFirstMatch) {
    const anchoredAlbum = await loadAlbumUsingTrackAnchors({
      songs,
      expectedAlbum,
      expectedTracks,
      expectedArtists,
      expectedTrackCount,
      endpoint: albumEndpoint,
      signal,
      requester,
    });
    if (anchoredAlbum) return anchoredAlbum;
  }

  const candidates = chooseAlbumCandidates(songs, query, expectedArtists);
  const collection = await loadMatchingAlbum(
    candidates,
    expectedAlbum?.trim() || query,
    albumEndpoint,
    signal,
    requester,
    expectedTracks,
    expectedArtists,
    expectedTrackCount,
  );
  const resolved = collection?.length ? collection : [chooseSingleSong(songs, trackTitle, expectedAlbum, expectedArtists)];
  return { mode: resolved.length > 1 ? 'album' : 'single', songs: resolved, albumName: resolved[0].albumName, albumId: resolved[0].albumId };
}
