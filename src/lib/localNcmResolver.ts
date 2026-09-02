import type { JsonRequester } from './neteaseResolver';

const DEFAULT_LOCAL_NCM_BASE = 'http://127.0.0.1:3000';

interface LocalNcmRequesterOptions {
  baseUrl?: string;
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/$/, '');
  if (!trimmed) return DEFAULT_LOCAL_NCM_BASE;
  if (!/^https?:\/\//.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

function joinLocalUrl(baseUrl: string, pathname: string, params: URLSearchParams) {
  const url = new URL(pathname, `${normalizeBaseUrl(baseUrl)}/`);
  url.search = params.toString();
  return url;
}

async function requestLocalNcm<T>(url: URL, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') throw reason;
    throw new Error('无法连接本地 NCM API，请确认服务器已启动并允许跨域访问');
  }

  if (!response.ok) throw new Error(`本地 NCM API 请求失败（HTTP ${response.status}）`);
  const data = (await response.json()) as { code?: number };
  if (data.code !== undefined && data.code !== 200) throw new Error(`本地 NCM API 请求失败（${data.code}）`);
  return data as T;
}

function parseSongIds(rawIds: string | null): number[] {
  if (!rawIds) return [];
  try {
    const value: unknown = JSON.parse(rawIds);
    const list = Array.isArray(value) ? value : [value];
    return list
      .map((item) => (typeof item === 'number' ? item : typeof item === 'string' ? Number.parseInt(item, 10) : Number.NaN))
      .filter((item) => Number.isFinite(item));
  } catch {
    return [];
  }
}

/**
 * 本地部署 NeteaseCloudMusicApi 后，浏览器可以直接请求 localhost 服务。
 * 这里保留共享解析器的旧网易云请求形状，再把它翻译成本地 API 的路由。
 */
export function createLocalNcmRequester({ baseUrl = DEFAULT_LOCAL_NCM_BASE }: LocalNcmRequesterOptions = {}): JsonRequester {
  return async <T>(url: string, signal?: AbortSignal): Promise<T> => {
    const parsed = new URL(url, window.location.origin);

    if (parsed.pathname.includes('/api/search/get/web')) {
      const params = new URLSearchParams({
        keywords: parsed.searchParams.get('s') ?? '',
        type: '1',
        offset: parsed.searchParams.get('offset') ?? '0',
        total: 'true',
        limit: parsed.searchParams.get('limit') ?? '100',
      });
      return (await requestLocalNcm<T>(joinLocalUrl(baseUrl, 'cloudsearch', params), signal)) as T;
    }

    if (parsed.pathname.includes('/api/album')) {
      const match = parsed.pathname.match(/\/api\/album\/(\d+)$/);
      const albumId = match?.[1];
      if (!albumId) throw new Error('本地 NCM API 无法解析专辑请求');
      const params = new URLSearchParams({ id: albumId });
      return (await requestLocalNcm<T>(joinLocalUrl(baseUrl, 'album', params), signal)) as T;
    }

    if (parsed.pathname.includes('/api/song/enhance/player/url/v1')) {
      const [songId] = parseSongIds(parsed.searchParams.get('ids'));
      if (!Number.isFinite(songId)) throw new Error('本地 NCM API 无法解析音频请求');
      const params = new URLSearchParams({
        id: String(songId),
        level: 'standard',
        encodeType: 'mp3',
      });
      return (await requestLocalNcm<T>(joinLocalUrl(baseUrl, 'song/url/v1', params), signal)) as T;
    }

    if (parsed.pathname.includes('/api/nuser/account/get')) {
      return (await requestLocalNcm<T>(joinLocalUrl(baseUrl, 'login/status', new URLSearchParams()), signal)) as T;
    }

    throw new Error(`本地 NCM API 不支持该请求：${parsed.pathname}`);
  };
}
