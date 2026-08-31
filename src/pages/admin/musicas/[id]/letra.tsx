import { ArrowLeft, ClipboardText, SortAscending } from "@phosphor-icons/react";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";

import AdminLayout from "@/components/admin/AdminLayout";
import LyricLineRow from "@/components/admin/LyricLineRow";
import SongPlayer from "@/components/SongPlayer";
import TextReader from "@/components/TextReader";
import { useLocalAudioPlayer } from "@/hooks/useLocalAudioPlayer";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { adminApi, ApiError, isUnauthenticated } from "@/lib/api/client";
import { withAdminPage } from "@/lib/auth/page";
import {
  findOutOfOrderIndexes,
  roundToCentiseconds,
  sortLinesByTime,
  splitPastedLyrics,
} from "@/lib/lyrics";
import type { Lines, SongDetail, Voice } from "@/types";

/**
 * Time a lyric against the song's own recording.
 *
 * The workflow this is built around: paste the whole lyric once, press play,
 * and tap Enter down the lines as they are sung. Everything else — nudging,
 * clearing, reordering — is repair work on top of that pass.
 *
 * The preview on the right is the chorister's own TextReader, unmodified, so
 * what is being edited and what will ship are the same component.
 */

/** Roughly human reaction time; offered rather than applied, since it varies. */
const DEFAULT_OFFSET_MS = 0;

export default function EditarLetra({
  admin,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const songId = Number(router.query.id);

  const [song, setSong] = useState<SongDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lines, setLines] = useState<Lines[]>([]);
  const [saved, setSaved] = useState<Lines[]>([]);
  const [selected, setSelected] = useState(0);
  const [voice, setVoice] = useState<Voice | null>(null);
  const [offsetMs, setOffsetMs] = useState(DEFAULT_OFFSET_MS);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(lines) !== JSON.stringify(saved);
  useUnsavedChanges(dirty, "A letra tem alterações não salvas. Sair mesmo?");

  useEffect(() => {
    if (!Number.isInteger(songId) || songId <= 0) return;

    let active = true;

    adminApi
      .getSong(songId)
      .then((detail) => {
        if (!active) return;

        setSong(detail);
        setLines(detail.lyrics.lines);
        setSaved(detail.lyrics.lines);
        // "todos" is the full mix, which is the easiest thing to time against.
        setVoice(
          detail.tracks.find((track) => track.voice === "todos")?.voice ??
            detail.tracks[0]?.voice ??
            null,
        );
      })
      .catch((error) => {
        if (!active) return;

        if (isUnauthenticated(error)) {
          window.location.href = `/admin/entrar?callbackUrl=${encodeURIComponent(router.asPath)}`;
          return;
        }

        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Não foi possível carregar a letra.",
        );
      });

    return () => {
      active = false;
    };
  }, [songId, router.asPath]);

  const audioUrl = song?.tracks.find((track) => track.voice === voice)?.url;
  const player = useLocalAudioPlayer(audioUrl);
  const { getCurrentTime, togglePlay } = player;

  const outOfOrder = useMemo(
    () => new Set(findOutOfOrderIndexes(lines)),
    [lines],
  );

  const updateLine = useCallback((index: number, patch: Partial<Lines>) => {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }, []);

  /** Stamps the element's own clock, not the state copy, which lags by ~250 ms. */
  const stamp = useCallback(
    (index: number) => {
      const seconds = Math.max(0, getCurrentTime() + offsetMs / 1000);
      updateLine(index, { time: roundToCentiseconds(seconds) });
      setSelected((current) =>
        Math.min(current + 1, Math.max(0, lines.length - 1)),
      );
    },
    [getCurrentTime, offsetMs, updateLine, lines.length],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;

      // Otherwise Space pauses the song and S toggles solo while someone is
      // simply typing a lyric.
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      switch (event.key) {
        case " ":
          event.preventDefault();
          togglePlay();
          break;
        case "Enter":
        case "t":
        case "T":
          event.preventDefault();
          stamp(selected);
          break;
        case "ArrowUp":
          event.preventDefault();
          setSelected((current) => Math.max(0, current - 1));
          break;
        case "ArrowDown":
          event.preventDefault();
          setSelected((current) => Math.min(lines.length - 1, current + 1));
          break;
        case "[":
          event.preventDefault();
          updateLine(selected, {
            time: roundToCentiseconds(
              Math.max(0, (lines[selected]?.time ?? 0) - 0.1),
            ),
          });
          break;
        case "]":
          event.preventDefault();
          updateLine(selected, {
            time: roundToCentiseconds((lines[selected]?.time ?? 0) + 0.1),
          });
          break;
        case "Backspace":
          event.preventDefault();
          updateLine(selected, { time: 0 });
          break;
        case "s":
        case "S":
          event.preventDefault();
          updateLine(selected, { isSolo: !lines[selected]?.isSolo });
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, lines, stamp, togglePlay, updateLine]);

  async function save() {
    setBusy(true);

    try {
      const updated = await adminApi.updateSong(songId, {
        lyrics: { lines },
      });
      setSaved(updated.lyrics.lines);
      setLines(updated.lyrics.lines);
      toast.success("Letra salva.");
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível salvar a letra.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout
      admin={admin}
      title={song ? `Letra — ${song.title}` : "Letra"}
      actions={
        <>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !dirty}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Salvando..." : dirty ? "Salvar letra" : "Salva"}
          </button>
          <Link
            href={`/admin/musicas/${songId}`}
            className="flex items-center gap-1.5 rounded-xl bg-gray-700 px-4 py-2 text-sm text-gray-100 transition hover:bg-gray-600"
          >
            <ArrowLeft size={16} />
            Voltar
          </Link>
        </>
      }
    >
      {loadError && (
        <p className="rounded-xl bg-primary/15 px-3 py-2 text-sm text-gray-100">
          {loadError}
        </p>
      )}

      {!song && !loadError && (
        <p className="text-sm text-gray-400">Carregando...</p>
      )}

      {song && song.tracks.length === 0 && (
        <p className="rounded-xl bg-secondary/20 px-3 py-2 text-sm text-gray-200">
          Envie um kit de voz antes de sincronizar a letra — sem áudio não há o
          que marcar.{" "}
          <Link
            href={`/admin/musicas/${songId}`}
            className="underline hover:text-white"
          >
            Enviar agora
          </Link>
        </p>
      )}

      {song && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-900/50 p-3">
            <button
              type="button"
              onClick={() => setPasting((current) => !current)}
              className="flex items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-2 text-xs text-gray-100 transition hover:bg-gray-600"
            >
              <ClipboardText size={14} />
              Colar letra
            </button>

            <button
              type="button"
              onClick={() => setLines((current) => sortLinesByTime(current))}
              disabled={outOfOrder.size === 0}
              className="flex items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-2 text-xs text-gray-100 transition hover:bg-gray-600 disabled:opacity-40"
            >
              <SortAscending size={14} />
              Ordenar por tempo
            </button>

            <button
              type="button"
              onClick={() =>
                setLines((current) => [...current, { text: "", time: 0 }])
              }
              className="rounded-lg bg-gray-700 px-3 py-2 text-xs text-gray-100 transition hover:bg-gray-600"
            >
              + Linha
            </button>

            <label className="flex items-center gap-2 text-xs text-gray-400">
              Compensação
              <input
                type="number"
                step={10}
                value={offsetMs}
                onChange={(event) => setOffsetMs(Number(event.target.value))}
                title="Deslocamento aplicado a cada marcação, para compensar o tempo de reação."
                className="w-20 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-center text-gray-200 focus:border-primary focus:outline-none"
              />
              ms
            </label>

            {song.tracks.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-gray-400">
                Áudio
                <select
                  value={voice ?? ""}
                  onChange={(event) => setVoice(event.target.value as Voice)}
                  className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-200 focus:border-primary focus:outline-none"
                >
                  {song.tracks.map((track) => (
                    <option key={track.voice} value={track.voice}>
                      {track.voice}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <span className="ml-auto text-xs text-gray-500">
              espaço tocar · enter marcar · ↑↓ navegar · [ ] ±0,1s · s solo
            </span>
          </div>

          {pasting && (
            <div className="flex flex-col gap-2 rounded-xl bg-gray-900/50 p-3">
              <textarea
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                rows={6}
                placeholder="Cole a letra inteira aqui, uma linha por verso."
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-50 focus:border-primary focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLines(splitPastedLyrics(pasted));
                    setSelected(0);
                    setPasted("");
                    setPasting(false);
                  }}
                  disabled={pasted.trim().length === 0}
                  className="rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  Substituir a letra
                </button>
                <button
                  type="button"
                  onClick={() => setPasting(false)}
                  className="rounded-lg bg-gray-700 px-3 py-2 text-xs text-gray-100 transition hover:bg-gray-600"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <ul className="flex max-h-[55vh] flex-col gap-1.5 overflow-y-auto pr-1">
              {lines.length === 0 && (
                <li className="text-sm text-gray-400">
                  Nenhuma linha ainda. Cole a letra para começar.
                </li>
              )}

              {lines.map((line, index) => (
                <LyricLineRow
                  key={index}
                  line={line}
                  index={index}
                  selected={index === selected}
                  outOfOrder={outOfOrder.has(index)}
                  onSelect={() => setSelected(index)}
                  onChangeText={(text) => updateLine(index, { text })}
                  onChangeTime={(time) => updateLine(index, { time })}
                  onClearTime={() => updateLine(index, { time: 0 })}
                  onToggleSolo={() =>
                    updateLine(index, { isSolo: !line.isSolo })
                  }
                  onRemove={() =>
                    setLines((current) => current.filter((_, i) => i !== index))
                  }
                  onStamp={() => stamp(index)}
                />
              ))}
            </ul>

            <aside className="flex max-h-[55vh] flex-col rounded-2xl bg-gray-900/50 p-3">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                Como o coralista vê
              </h2>
              <div className="min-h-0 flex-1 overflow-hidden">
                <TextReader
                  lyrics={{ lines }}
                  currentTime={player.currentTime}
                  enableReading
                  updateCurrentTime={player.updateCurrentTime}
                  textAlign="center"
                  fontSize={18}
                />
              </div>
            </aside>
          </div>

          {audioUrl && (
            <div className="rounded-2xl bg-gray-900/50 p-3">
              <SongPlayer
                currentTime={player.currentTime}
                duration={player.duration}
                isPlaying={player.isPlaying}
                togglePlay={player.togglePlay}
                isReplayEnabled={player.isReplayEnabled}
                toggleReplay={player.toggleReplay}
                handleSeek={player.handleSeek}
                volume={player.volume}
                handleVolumeChange={player.handleVolumeChange}
              />
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}

export const getServerSideProps = withAdminPage();
