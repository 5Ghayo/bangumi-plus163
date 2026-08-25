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
  root: HTMLDivElement;
} | null {
  const mountPoint = findBangumiTrackListMountPoint();
  const trackList = findBangumiTrackListElement();
  if (!mountPoint) return null;

  const activeHost = document.querySelector<HTMLElement>('[data-bangumi-music-player][data-bangumi-plus-version="1.0.0"]');
  if (activeHost) return null;

  // Remove hosts left behind by older script versions so an update always
  // renders a fresh visible control.
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
  const root = document.createElement('div');
  root.id = 'root';
  host.append(root);
  if (trackList) trackList.before(host);
  else mountPoint.prepend(host);

  return { host, root };
}

export function isMusicSubject(subject: { type?: number }): boolean {
  return subject.type === 3;
}
