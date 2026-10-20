import { SongSummary } from "@/types";

/**
 * The songs with a kit for this voice, in list order. Lists cached before
 * voices were returned have none, so they keep every song.
 */
export const songsForVoice = (songs: SongSummary[], voice: string) =>
  songs.filter(
    (song) => !song.voices || song.voices.some((item) => item === voice),
  );
