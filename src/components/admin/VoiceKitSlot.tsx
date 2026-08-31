import {
  ArrowClockwise,
  Pause,
  Play,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import type { UploadState } from "@/hooks/useTrackUpload";
import { ALLOWED_AUDIO_EXTENSION } from "@/lib/audio";
import { parseTrackObjectKey } from "@/lib/object-keys";
import type { Voice } from "@/types";

/**
 * One voice's kit: empty, uploading, present or failed.
 *
 * Every voice gets a slot whether or not a kit exists, because an empty slot is
 * information — the public song page treats a missing kit as a first-class
 * state, so it should be just as visible here.
 */

export interface VoiceSlotData {
  voice: Voice;
  /** From the management list; needed to delete. */
  trackId?: number;
  objectKey?: string;
  /** From the song detail; the only place a playable URL is composed. */
  url?: string;
}

interface VoiceKitSlotProps {
  slot: VoiceSlotData;
  upload: UploadState;
  onSelectFile: (file: File) => void;
  onCancel: () => void;
  onRetry: () => void;
  onDelete: () => void;
}

const PHASE_LABEL: Record<UploadState["phase"], string> = {
  idle: "",
  signing: "preparando...",
  uploading: "enviando",
  confirming: "finalizando...",
  error: "falhou",
};

function VoiceKitSlot({
  slot,
  upload,
  onSelectFile,
  onCancel,
  onRetry,
  onDelete,
}: VoiceKitSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const busy = upload.phase !== "idle" && upload.phase !== "error";
  const present = Boolean(slot.url);
  // The random suffix is how you confirm at a glance that a replacement
  // actually took: a new upload always mints a new key.
  const version = slot.objectKey
    ? parseTrackObjectKey(slot.objectKey)?.version
    : undefined;

  useEffect(() => {
    // Stop and drop the element when the kit is replaced or removed, so a
    // preview never keeps playing audio that is no longer on screen.
    const audio = audioRef.current;

    return () => {
      audio?.pause();
    };
  }, [slot.url]);

  function togglePreview() {
    if (!slot.url) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(slot.url);
      audioRef.current.onended = () => setPlaying(false);
    }

    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }

    void audioRef.current.play();
    setPlaying(true);
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl bg-gray-900/70 p-3">
      <span className="w-20 shrink-0 text-sm font-medium capitalize text-gray-100">
        {slot.voice}
      </span>

      <div className="min-w-[8rem] flex-1">
        {busy ? (
          <div className="flex flex-col gap-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full rounded-full bg-secondary transition-[width]"
                style={{
                  width:
                    upload.phase === "uploading"
                      ? `${upload.percent}%`
                      : "100%",
                }}
              />
            </div>
            <span className="text-xs text-gray-400">
              {PHASE_LABEL[upload.phase]}
              {upload.phase === "uploading" && ` ${upload.percent}%`}
            </span>
          </div>
        ) : upload.phase === "error" ? (
          <span className="text-xs text-primary">{upload.message}</span>
        ) : present ? (
          <span className="font-mono text-xs text-gray-400">
            {version ? `versão ${version.slice(0, 8)}` : "arquivo migrado"}
          </span>
        ) : (
          <span className="text-xs text-gray-500">nenhum kit enviado</span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={`${ALLOWED_AUDIO_EXTENSION},audio/mpeg`}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file twice after a failure still fires.
          event.target.value = "";
          if (file) onSelectFile(file);
        }}
      />

      <div className="flex items-center gap-1">
        {present && !busy && (
          <button
            type="button"
            onClick={togglePreview}
            aria-label={`Ouvir o kit de ${slot.voice}`}
            className="rounded-lg p-2 text-gray-300 transition hover:bg-gray-700 hover:text-gray-50"
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
        )}

        {upload.phase === "error" && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-2 text-xs text-gray-100 transition hover:bg-gray-600"
          >
            <ArrowClockwise size={14} />
            Tentar de novo
          </button>
        )}

        {busy ? (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-2 text-xs text-gray-100 transition hover:bg-gray-600"
          >
            <X size={14} />
            Cancelar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-2 text-xs text-gray-100 transition hover:bg-gray-600"
          >
            <UploadSimple size={14} />
            {present ? "Substituir" : "Enviar"}
          </button>
        )}

        {present && !busy && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Remover o kit de ${slot.voice}`}
            className="rounded-lg p-2 text-gray-300 transition hover:bg-primary/20 hover:text-primary"
          >
            <Trash size={18} />
          </button>
        )}
      </div>
    </li>
  );
}

export default VoiceKitSlot;
