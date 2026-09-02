// Bangumi 内置组件版：通过本机部署的 NeteaseCloudMusicApi 请求网易云音频。
import { createRoot } from 'react-dom/client';
import MusicPreviewBar from './components/MusicPreviewBar';
import appStyles from './App.css?inline';
import { createBangumiTrackListShadowMount, findBangumiTrackListElement, findBangumiTrackListMountPoint, getSubjectIdFromLocation, isMusicSubjectPage } from './integration/bangumiPage';
import { createLocalNcmRequester } from './lib/localNcmResolver';
import type { BangumiSubject } from './types/bangumi';

// 粘贴到 bgm.tv 的超合金组件前，可把这里改成你的 NeteaseCloudMusicApi 地址。
const LOCAL_API_BASE = 'http://127.0.0.1:3000';
const NETEASE_SEARCH_ENDPOINT = 'https://music.163.com/api/search/get/web';
const NETEASE_ALBUM_ENDPOINT = 'https://music.163.com/api/album';
const NETEASE_AUDIO_ENDPOINT = 'https://music.163.com/api/song/enhance/player/url/v1';
const NETEASE_ACCOUNT_ENDPOINT = 'https://music.163.com/api/nuser/account/get';

function getLocalApiBase() {
  const override = (window as typeof window & { __BANGUMI_PLUS_LOCAL_API__?: string }).__BANGUMI_PLUS_LOCAL_API__;
  return override?.trim() || LOCAL_API_BASE;
}

const requestJson = createLocalNcmRequester({ baseUrl: getLocalApiBase() });

function appendStyles() {
  document.head.querySelector('[data-bangumi-plus-userscript-style]')?.remove();
  const style = document.createElement('style');
  style.dataset.bangumiPlusUserscriptStyle = 'true';
  style.textContent = [
    appStyles,
    '#bangumi-plus-root { max-width: none; margin: 0; padding: 0; }',
    // 登录状态保存在本地 NCM 服务器，不在 bgm.tv 页面里打开网易云登录页。
    '.music-preview__login { display: none !important; }',
  ].join('\n');
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
  if (!subjectId) return;
  if (!isMusicSubjectPage()) {
    console.info('[bangumi-plus/bgm-local] not a music subject, skipped', location.pathname);
    return;
  }

  try {
    await waitForTrackList();
    const mount = createBangumiTrackListShadowMount({ launcherLabel: '试听' });
    if (!mount) {
      console.info('[bangumi-plus/bgm-local] mount skipped', {
        host: location.hostname,
        path: location.pathname,
        heading: Boolean(findBangumiTrackListMountPoint()),
        trackList: Boolean(findBangumiTrackListElement()),
      });
      return;
    }
    appendStyles();
    installBangumiThemeSync();
    const subject = getPageSubject(subjectId);

    createRoot(mount.root).render(
      <MusicPreviewBar
        subject={subject}
        endpoint={NETEASE_SEARCH_ENDPOINT}
        albumEndpoint={NETEASE_ALBUM_ENDPOINT}
        audioEndpoint={NETEASE_AUDIO_ENDPOINT}
        accountEndpoint={NETEASE_ACCOUNT_ENDPOINT}
        requestJson={requestJson}
        sourceLabel="本地 NCM"
        autoFillAlbumOnFirstMatch
      />,
    );
    window.setTimeout(() => {
      const toolbarButton = mount.root.querySelector<HTMLButtonElement>('.music-preview__toggle');
      if (!toolbarButton) return;
      mount.launcher.addEventListener('click', () => toolbarButton.click());
      mount.launcher.remove();
      mount.root.style.display = 'block';
    }, 100);
    console.info('[bangumi-plus/bgm-local] preview button mounted');
  } catch (error) {
    console.warn('[bangumi-plus/bgm-local] 音乐播放器加载失败', error);
  }
}

console.info('[bangumi-plus/bgm-local] component started', location.href);
void mount();
