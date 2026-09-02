import { useEffect, useState } from 'react';
import { resolveNeteaseTracks } from '../lib/neteaseResolver';
import type { JsonRequester } from '../lib/neteaseResolver';
import type {
  NeteaseResolveMode,
  NeteaseResolvedResult,
} from '../types/bangumi';

interface Options {
  query: string;
  expectedAlbum?: string;
  trackTitle?: string;
  expectedArtists?: string[];
  autoFillAlbumOnFirstMatch?: boolean;
  mode?: NeteaseResolveMode;
  endpoint?: string;
  albumEndpoint?: string;
  enabled?: boolean;
  requestJson?: JsonRequester;
  cacheKey?: string | number;
}

export function useNeteaseTracks({
  query,
  expectedAlbum,
  trackTitle,
  expectedArtists,
  autoFillAlbumOnFirstMatch = false,
  mode = 'auto',
  endpoint,
  albumEndpoint,
  enabled = true,
  requestJson,
  cacheKey = '',
}: Options) {
  const [settled, setSettled] = useState<{
    key: string;
    result: NeteaseResolvedResult | null;
    error: string | null;
  }>({ key: '', result: null, error: null });
  const expectedArtistsKey = expectedArtists?.map((artist) => artist.trim()).filter(Boolean).join('|') ?? '';
  const requestKey = `${cacheKey}|${enabled}|${endpoint ?? ''}|${albumEndpoint ?? ''}|${mode}|${query.trim()}|${expectedAlbum?.trim() ?? ''}|${trackTitle?.trim() ?? ''}|${expectedArtistsKey}|${autoFillAlbumOnFirstMatch}|${requestJson ? 'custom' : 'fetch'}`;

  useEffect(() => {
    if (!enabled || !query.trim()) {
      return;
    }

    const controller = new AbortController();

    resolveNeteaseTracks({
      query: query.trim(),
      expectedAlbum,
      trackTitle,
      expectedArtists,
      autoFillAlbumOnFirstMatch,
      mode,
      endpoint,
      albumEndpoint,
      signal: controller.signal,
      requestJson,
    })
      .then((nextResult) => setSettled({ key: requestKey, result: nextResult, error: null }))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setSettled({
            key: requestKey,
            result: null,
            error: reason instanceof Error ? reason.message : '网易云搜索失败',
          });
        }
      });

    return () => controller.abort();
  }, [albumEndpoint, autoFillAlbumOnFirstMatch, enabled, endpoint, expectedAlbum, expectedArtists, mode, query, requestJson, requestKey, trackTitle]);

  const activeRequest = enabled && query.trim() ? requestKey : null;
  const isSettled = activeRequest !== null && settled.key === activeRequest;

  return {
    result: isSettled ? settled.result : null,
    loading: activeRequest !== null && !isSettled,
    error: isSettled ? settled.error : null,
  };
}
