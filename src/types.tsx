export interface Lines {
  text: string;
  time: number;
  isSolo?: boolean;
}

export interface Lyrics {
  lines: Lines[];
}

export interface Event {
  id: number;
  date: string;
  title: string;
  location: string;
}

export interface Agenda {
  events: Event[];
}

export const VOICES = [
  "soprano",
  "contralto",
  "tenor",
  "baixo",
  "todos",
] as const;

export type Voice = (typeof VOICES)[number];

export function isVoice(value: string): value is Voice {
  return (VOICES as readonly string[]).includes(value);
}

/** A single voice kit, with the audio URL already resolved server-side. */
export interface SongTrack {
  voice: Voice;
  url: string;
}

/** Shape returned by /api/musicas — enough to render the song list. */
export interface SongSummary {
  id: number;
  slug: string;
  title: string;
  author: string;
  imageUrl: string;
}

/** Shape returned by /api/musicas/[id] — adds lyrics and the available kits. */
export interface SongDetail extends SongSummary {
  status: Status;
  lyrics: Lyrics;
  tracks: SongTrack[];
}

export enum Status {
  active = "active",
  inactive = "inactive",
}
