import { SongDetail, SongSummary } from "@/types";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useLocalStorage } from "usehooks-ts";

// Must match SONGS_CACHE in public/sw.js
const SONGS_CACHE = "cjl-songs";
const MAX_OFFLINE_SONGS = 5;
const OFFLINE_SONGS_KEY = "offline-songs"; // most recently opened first
const EXCLUDED_KEY = "offline-excluded"; // songs the user removed from offline

interface OfflineSong {
  id: number;
  voice: string;
  audioUrl: string;
}

const songKey = (id: number, voice: string) => `${id}/${voice}`;
const lyricsPath = (id: number) => `/api/musicas/${id}`;
const toUrl = (path: string) => new URL(path, window.location.origin).href;
const isSameSong = (a: OfflineSong, b: OfflineSong) =>
  a.id === b.id && a.voice === b.voice;

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// The page already holds the song as /api/musicas/:id returned it, so it is
// cached as-is rather than requested a second time
const toLyricsResponse = (song: SongDetail) =>
  new Response(JSON.stringify(song), {
    headers: { "Content-Type": "application/json" },
  });

async function fetchOk(path: string) {
  // cache: "reload" makes the service worker skip the cached copy
  const response = await fetch(path, { cache: "reload" });
  if (!response.ok) throw new Error(`Falha ao baixar ${path}`);
  return response;
}

async function removeFromCache(songs: OfflineSong[], remaining: OfflineSong[]) {
  const cache = await caches.open(SONGS_CACHE);
  await Promise.all(
    songs.map(async (song) => {
      await cache.delete(song.audioUrl);
      // Lyrics are shared by all voices of a song
      if (!remaining.some((other) => other.id === song.id)) {
        await cache.delete(lyricsPath(song.id));
      }
    }),
  );
}

function useOfflineSongList() {
  const [offlineSongs, setOfflineSongs] = useLocalStorage<OfflineSong[]>(
    OFFLINE_SONGS_KEY,
    [],
  );

  // Applies the update and deletes the cached files it no longer references,
  // including the old file of a kit that was replaced (it gets a new URL)
  const updateOfflineSongs = async (
    update: (current: OfflineSong[]) => OfflineSong[],
  ) => {
    let next: OfflineSong[] = [];
    let removed: OfflineSong[] = [];
    setOfflineSongs((current) => {
      next = update(current);
      removed = current.filter(
        (song) => !next.some((other) => other.audioUrl === song.audioUrl),
      );
      return next;
    });
    await removeFromCache(removed, next);
    return next;
  };

  return [offlineSongs, updateOfflineSongs] as const;
}

export function useOfflineSong(
  song: SongDetail | undefined,
  voice: string | undefined,
) {
  const [offlineSongs, updateOfflineSongs] = useOfflineSongList();
  const [excluded, setExcluded] = useLocalStorage<string[]>(EXCLUDED_KEY, []);
  // Keyed by song and voice: the page stays mounted from one song to the
  // next, and a download still running for the previous one is not this one's
  const [savingKeys, setSavingKeys] = useState<string[]>([]);
  const [saveAttempt, setSaveAttempt] = useState(0);
  // Set by the switch: songs saved on their own as they are opened report
  // nothing, a save the user asked for reports how it went
  const requestedRef = useRef(false);

  const track = song?.tracks.find((item) => item.voice === voice);
  const key = song && voice ? songKey(song.id, voice) : "";
  const isOfflineEnabled = !excluded.includes(key);
  const isAvailableOffline = offlineSongs.some(
    (other) => songKey(other.id, other.voice) === key,
  );
  // A download turned off midway is discarded when it finishes
  const isSavingNow = savingKeys.includes(key) && isOfflineEnabled;

  useEffect(() => {
    const requested = requestedRef.current;
    requestedRef.current = false;

    if (!song || !voice || !track || !isOfflineEnabled || !("caches" in window))
      return;

    const entry: OfflineSong = { id: song.id, voice, audioUrl: track.url };
    const entryKey = songKey(entry.id, entry.voice);
    let markedSaving = false;

    const markAsRecent = () =>
      updateOfflineSongs((current) =>
        [entry, ...current.filter((other) => !isSameSong(other, entry))].slice(
          0,
          MAX_OFFLINE_SONGS,
        ),
      );

    const evictOldest = () =>
      updateOfflineSongs((current) => {
        const oldest = current
          .filter((other) => !isSameSong(other, entry))
          .at(-1);
        return current.filter((other) => other !== oldest);
      });

    const download = async (cache: Cache) => {
      await cache.put(entry.audioUrl, await fetchOk(entry.audioUrl));
      await cache.put(lyricsPath(entry.id), toLyricsResponse(song));
    };

    const save = async () => {
      const cache = await caches.open(SONGS_CACHE);
      const cached = await cache.match(entry.audioUrl);

      if (cached) {
        await markAsRecent();
        // Pick up lyric syncs, from the copy the page just loaded. Audio needs
        // no refresh: a replaced kit has a new URL, so it is downloaded as new.
        await cache.put(lyricsPath(entry.id), toLyricsResponse(song));
        return;
      }

      if (!navigator.onLine) {
        if (requested) toast.error("Sem conexão para salvar a música");
        return;
      }

      markedSaving = true;
      setSavingKeys((current) => [...current, entryKey]);
      try {
        await download(cache);
      } catch (error) {
        if (
          !(
            error instanceof DOMException && error.name === "QuotaExceededError"
          )
        ) {
          throw error;
        }
        // Storage is full: free the oldest song and try once more
        await evictOldest();
        await download(cache);
      }

      // The user may have turned offline off while the song was downloading
      if (readStorage<string[]>(EXCLUDED_KEY, []).includes(entryKey)) {
        await removeFromCache(
          [entry],
          readStorage<OfflineSong[]>(OFFLINE_SONGS_KEY, []),
        );
        return;
      }

      await markAsRecent();
      navigator.storage?.persist?.();
      if (requested) toast.success("Música salva para ouvir sem internet");
    };

    save()
      .catch((error) => {
        console.warn("Falha ao salvar música offline", error);
        if (requested) toast.error("Não foi possível salvar a música offline");
      })
      .finally(() => {
        if (!markedSaving) return;
        // One entry, not every one: the same song may be saving twice over
        setSavingKeys((current) => {
          const index = current.indexOf(entryKey);
          return [...current.slice(0, index), ...current.slice(index + 1)];
        });
      });
    // updateOfflineSongs changes on every render, but always writes to the same key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song, voice, isOfflineEnabled, saveAttempt]);

  // The switch shows whether the song is saved: turning it off removes it,
  // turning it on saves it (also retrying a save that failed)
  const toggleOffline = () => {
    if (!song || !voice) return;

    if (isAvailableOffline || isSavingNow) {
      setExcluded((current) =>
        current.includes(key) ? current : [...current, key],
      );
      updateOfflineSongs((current) =>
        current.filter((other) => songKey(other.id, other.voice) !== key),
      ).catch((error) =>
        console.warn("Falha ao remover música offline", error),
      );
      toast.success("Música removida do modo offline");
    } else {
      setExcluded((current) => current.filter((other) => other !== key));
      requestedRef.current = true;
      setSaveAttempt((attempt) => attempt + 1);
    }
  };

  return { isAvailableOffline, isSaving: isSavingNow, toggleOffline };
}

export function useOfflineSongs(songs: SongSummary[]) {
  const [offlineSongs, updateOfflineSongs] = useOfflineSongList();

  // Keeps the list and the cache in agreement: either one can be cleared on
  // its own by the browser or the user, and songs can become inactive.
  useEffect(() => {
    if (!songs.length || !("caches" in window)) return;

    const sync = async () => {
      const snapshot = readStorage<OfflineSong[]>(OFFLINE_SONGS_KEY, []);
      const cache = await caches.open(SONGS_CACHE);
      const cachedUrls = (await cache.keys()).map((request) => request.url);

      const invalid = snapshot.filter(
        (song) =>
          !songs.some((active) => active.id === song.id) ||
          !cachedUrls.includes(toUrl(song.audioUrl)),
      );
      const next = await updateOfflineSongs((current) =>
        current.filter(
          (song) => !invalid.some((other) => isSameSong(song, other)),
        ),
      );

      const referenced = next.flatMap((song) => [
        toUrl(song.audioUrl),
        toUrl(lyricsPath(song.id)),
      ]);
      await Promise.all(
        cachedUrls
          .filter((url) => !referenced.includes(url))
          .map((url) => cache.delete(url)),
      );
    };

    sync().catch((error) =>
      console.warn("Falha ao sincronizar músicas offline", error),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs]);

  const isSavedOffline = (id: number, voice: string) =>
    offlineSongs.some((song) => song.id === id && song.voice === voice);

  return { isSavedOffline };
}
