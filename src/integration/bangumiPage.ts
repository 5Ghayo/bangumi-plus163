const SUBJECT_PATH = /^\/subject\/(\d+)\/?$/;
const SUPPORTED_HOSTS = new Set(['bgm.tv', 'www.bgm.tv', 'bangumi.tv', 'www.bangumi.tv', 'chii.in', 'www.chii.in']);

export function getSubjectIdFromLocation(location: Location = window.location): number | null {
  if (!SUPPORTED_HOSTS.has(location.hostname)) return null;
  const match = location.pathname.match(SUBJECT_PATH);
  return match ? Number(match[1]) : null;
}

export function findBangumiMountPoint(): HTMLElement | null {
  const main = document.querySelector<HTMLElement>('#main');
  return main ?? document.querySelector<HTMLElement>('.mainWrapper');
}

export function findBangumiTrackListMountPoint(): HTMLElement | null {
  const heading = [...document.querySelectorAll<HTMLElement>('h2.subtitle, h2, h3, .subtitle')]
    .find((element) => element.textContent?.replace(/\s+/g, '').includes('曲目列表'));

  return heading?.parentElement
    ?? findBangumiTrackListElement()?.parentElement
    ?? findBangumiMountPoint();
}

export function findBangumiTrackListElement(): HTMLUListElement | null {
  return document.querySelector<HTMLUListElement>('ul.line_list_music, ul.line_list.line_list_music, ul[class*="line_list_music"]');
}

export function findBangumiTrackRows(): HTMLElement[] {
  const trackList = findBangumiTrackListElement();
  if (!trackList) return [];

  return [...trackList.querySelectorAll<HTMLElement>(':scope > li')]
    .filter((row) => row.querySelector('h6 a'));
}

export function getBangumiTrackTitle(row: HTMLElement): string {
  return row.querySelector('h6 a')?.textContent?.trim() ?? '';
}

export function createBangumiShadowMount(): {
  host: HTMLDivElement;
  root: HTMLDivElement;
  shadow: ShadowRoot;
} | null {
  const mountPoint = findBangumiMountPoint();
  if (!mountPoint || mountPoint.querySelector('[data-bangumi-music-player]')) return null;

  const host = document.createElement('div');
  host.dataset.bangumiMusicPlayer = 'true';
  host.style.display = 'block';
  host.style.margin = '0 0 24px';
  const shadow = host.attachShadow({ mode: 'open' });
  const root = document.createElement('div');
  root.id = 'bangumi-plus-root';
  shadow.append(root);
  mountPoint.prepend(host);

  return { host, root, shadow };
}

export function createBangumiTrackListShadowMount(): {
  host: HTMLDivElement;
  launcher: HTMLButtonElement;
  root: HTMLDivElement;
} | null {
  const mountPoint = findBangumiTrackListMountPoint();
  const trackList = findBangumiTrackListElement();
  if (!mountPoint) return null;

  // A previous script version may have left an empty host behind. Remove it
  // so an updated userscript can always render a fresh visible control.
  document.querySelectorAll<HTMLElement>('[data-bangumi-music-player]').forEach((element) => element.remove());

  const host = document.createElement('div');
  host.dataset.bangumiMusicPlayer = 'true';
  host.dataset.bangumiPlusVersion = '1.0.0';
  host.style.cssText = [
    'display:block',
    'width:100%',
    'min-height:38px',
    'margin:8px 0 12px',
    'clear:both',
  ].join(';');
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.dataset.bangumiPlusLauncher = 'true';
  launcher.textContent = '试听 网易云音乐';
  launcher.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'min-height:32px',
    'padding:0 12px',
    'border:1px solid #e28b4d',
    'border-radius:4px',
    'background:#fff7ef',
    'color:#b55d1e',
    'font:600 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'cursor:pointer',
  ].join(';');
  const root = document.createElement('div');
  root.id = 'root';
  root.style.display = 'none';
  host.append(launcher);
  host.append(root);
  if (trackList) trackList.before(host);
  else mountPoint.prepend(host);

  return { host, launcher, root };
}

export function isMusicSubject(subject: { type?: number }): boolean {
  return subject.type === 3;
}
