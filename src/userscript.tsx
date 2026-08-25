// The metadata banner is added by vite.userscript.config.ts.
import { createRoot } from 'react-dom/client';
import MusicPreviewBar from './components/MusicPreviewBar';
import appStyles from './App.css?inline';
import { createBangumiTrackListShadowMount, findBangumiTrackListElement, findBangumiTrackListMountPoint, getSubjectIdFromLocation } from './integration/bangumiPage';
import type { BangumiSubject } from './types/bangumi';
import type { JsonRequester } from './lib/neteaseResolver';

const USERSCRIPT_VERSION = '1.0.0';
const NETEASE_SEARCH_ENDPOINT = 'https://music.163.com/api/search/get/web';
const NETEASE_ALBUM_ENDPOINT = 'https://music.163.com/api/album';
const NETEASE_AUDIO_ENDPOINT = 'https://music.163.com/api/song/enhance/player/url/v1';
const NETEASE_ACCOUNT_ENDPOINT = 'https://music.163.com/api/nuser/account/get';
const USER_AGENT = 'bangumi-plus/1.0.0 (https://github.com/bangumi/Archive)';

interface UserscriptResponse {
  status: number;
  responseText: string;
}

interface UserscriptRequest {
  method: 'GET';
  url: string;
  headers?: Record<string, string>;
  anonymous?: boolean;
  timeout?: number;
  onload: (response: UserscriptResponse) => void;
  onerror: () => void;
  ontimeout: () => void;
  onabort: () => void;
}

declare const GM_xmlhttpRequest: (details: UserscriptRequest) => { abort: () => void };

const requestJson: JsonRequester = <T,>(url: string, signal?: AbortSignal) => new Promise<T>((resolve, reject) => {
  let settled = false;
  const finish = (callback: () => void) => {
    if (settled) return;
    settled = true;
    callback();
  };

  const request = GM_xmlhttpRequest({
    method: 'GET',
    url,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    anonymous: false,
    timeout: 15000,
    onload: (response) => finish(() => {
      if (response.status < 200 || response.status >= 300) {
        reject(new Error(`请求失败（HTTP ${response.status}）`));
        return;
      }
      try {
        resolve(JSON.parse(response.responseText) as T);
      } catch {
        reject(new Error('请求返回了无效 JSON'));
      }
    }),
    onerror: () => finish(() => reject(new Error('网络请求失败'))),
    ontimeout: () => finish(() => reject(new Error('网络请求超时'))),
    onabort: () => finish(() => reject(new DOMException('请求已取消', 'AbortError'))),
  });

  signal?.addEventListener('abort', () => {
    request.abort();
    finish(() => reject(new DOMException('请求已取消', 'AbortError')));
  }, { once: true });
});

function appendStyles() {
  document.head.querySelector('[data-bangumi-plus-userscript-style]')?.remove();
  const style = document.createElement('style');
  style.dataset.bangumiPlusUserscriptStyle = 'true';
  style.textContent = `${appStyles}\n#bangumi-plus-root { max-width: none; margin: 0; padding: 0; }`;
  document.head.append(style);
}

function parseRgbLuminance(color: string): number | null {
  const values = color.match(/\d+(?:\.\d+)?/g)?.map(Number);
  const channels = values?.slice(0, 3);
  if (!channels || channels.length !== 3) return null;
  if (values?.length === 4 && values[3] === 0) return null;

  const [red, green, blue] = channels.map((channel) => channel / 255);
  return (red * 0.2126) + (green * 0.7152) + (blue * 0.0722);
}

function isDarkBangumiTheme() {
  const themeHint = [
    document.documentElement.className,
    document.body.className,
    document.documentElement.dataset.theme,
    document.body.dataset.theme,
  ].join(' ').toLowerCase();
  if (/(^|[\s_-])dark([\s_-]|$)|night/.test(themeHint)) return true;

  for (const element of [document.body, document.documentElement, document.querySelector<HTMLElement>('#wrapper')]) {
    if (!element) continue;
    const luminance = parseRgbLuminance(getComputedStyle(element).backgroundColor);
    if (luminance !== null) return luminance < 0.45;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyBangumiTheme() {
  const theme = isDarkBangumiTheme() ? 'dark' : 'light';
  if (document.documentElement.dataset.bangumiPlusTheme !== theme) {
    document.documentElement.dataset.bangumiPlusTheme = theme;
  }
}

function installBangumiThemeSync() {
  applyBangumiTheme();
  const observer = new MutationObserver(applyBangumiTheme);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
    subtree: true,
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyBangumiTheme);
}

function getPageSubject(subjectId: number): BangumiSubject {
  const title = document.querySelector<HTMLElement>('#headerSubject h1, h1.nameSingle, h1')?.textContent?.trim()
    || document.title.split('|')[0]?.trim()
    || `Bangumi 音乐条目 ${subjectId}`;

  return {
    id: subjectId,
    name: title,
    name_cn: title,
    type: 3,
    images: { large: '', common: '', medium: '', small: '', grid: '' },
    summary: '',
    date: '',
  };
}

function waitForTrackList(timeoutMs = 10000): Promise<void> {
  if (findBangumiTrackListMountPoint()) return Promise.resolve();

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (findBangumiTrackListMountPoint()) {
        observer.disconnect();
        window.clearTimeout(timeout);
        resolve();
      }
    });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeoutMs);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

async function mount() {
  const subjectId = getSubjectIdFromLocation();
  if (!subjectId) {
    console.info('[bangumi-plus] not a supported subject page', location.href);
    return;
  }

  try {
    await waitForTrackList();
    const mount = createBangumiTrackListShadowMount();
    if (!mount) {
      console.info('[bangumi-plus] mount skipped', {
        host: location.hostname,
        path: location.pathname,
        heading: Boolean(findBangumiTrackListMountPoint()),
        trackList: Boolean(findBangumiTrackListElement()),
      });
      return;
    }
    appendStyles();
    installBangumiThemeSync();
    // The page already tells us this is a music entry by rendering its native
    // track list. Mount the control immediately so a slow BGM API cannot hide it.
    const subject = getPageSubject(subjectId);

    createRoot(mount.root).render(
      <MusicPreviewBar
        subject={subject}
        endpoint={NETEASE_SEARCH_ENDPOINT}
        albumEndpoint={NETEASE_ALBUM_ENDPOINT}
        audioEndpoint={NETEASE_AUDIO_ENDPOINT}
        accountEndpoint={NETEASE_ACCOUNT_ENDPOINT}
        requestJson={requestJson}
      />,
    );
    console.info('[bangumi-plus] preview button mounted at', location.href);
  } catch (error) {
    console.warn('[bangumi-plus] 音乐播放器加载失败', error);
  }
}

document.documentElement.dataset.bangumiPlusUserscript = USERSCRIPT_VERSION;
console.info('[bangumi-plus] userscript started', location.href);
void mount();
