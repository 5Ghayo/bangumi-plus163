export interface BangumiSubject {
  id: number;
  name: string;
  name_cn: string;
  type: number; // 3 = music
  images: { large: string; common: string; medium: string; small: string; grid: string };
  summary: string;
  date: string;
  infobox?: Array<{ key: string; value: unknown }>;
  rating?: { score: number; total: number; rank: number };
  collection?: { wish: number; collect: number; doing: number; on_hold: number; dropped: number };
}

export interface NeteaseSong {
  id: number;
  name: string;
  artist: string;
  artistAliases?: string[];
  duration?: number; // ms
  coverUrl?: string;
  albumName?: string;
  albumId?: number;
}

export interface NeteaseAudioSource {
  id: number;
  url: string | null;
  code?: number;
}

export type NeteaseResolveMode = 'auto' | 'single' | 'album';

export interface NeteaseResolvedResult {
  mode: 'single' | 'album';
  songs: NeteaseSong[];
  albumName?: string;
  albumId?: number;
}
