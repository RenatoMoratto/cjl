import {
  ArrowDown,
  ArrowUp,
  MusicNotes,
  PencilSimple,
  TextAlignLeft,
  Trash,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";

import type { ManagedSongResponse } from "@/lib/api/client";
import { Status, VOICES } from "@/types";

interface SongListRowProps {
  song: ManagedSongResponse;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onMove: (direction: -1 | 1) => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

function SongListRow({
  song,
  isFirst,
  isLast,
  busy,
  onMove,
  onToggleStatus,
  onDelete,
}: SongListRowProps) {
  const isActive = song.status === Status.active;

  return (
    <li
      className="flex flex-wrap items-center gap-3 rounded-2xl bg-gray-900/70 p-3"
      // Alt with the arrows so the same gesture works from anywhere in the row
      // without stealing plain arrow keys from the buttons themselves.
      onKeyDown={(event) => {
        if (!event.altKey) return;
        if (event.key === "ArrowUp" && !isFirst) {
          event.preventDefault();
          onMove(-1);
        }
        if (event.key === "ArrowDown" && !isLast) {
          event.preventDefault();
          onMove(1);
        }
      }}
    >
      <div className="flex flex-col">
        <button
          type="button"
          aria-label={`Mover ${song.title} para cima`}
          disabled={isFirst || busy}
          onClick={() => onMove(-1)}
          className="rounded p-1 text-gray-300 transition hover:bg-gray-700 hover:text-gray-50 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ArrowUp size={16} weight="bold" />
        </button>
        <button
          type="button"
          aria-label={`Mover ${song.title} para baixo`}
          disabled={isLast || busy}
          onClick={() => onMove(1)}
          className="rounded p-1 text-gray-300 transition hover:bg-gray-700 hover:text-gray-50 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ArrowDown size={16} weight="bold" />
        </button>
      </div>

      <Image
        src={song.imageUrl}
        alt=""
        width={48}
        height={48}
        className="h-12 w-12 shrink-0 rounded-lg object-cover"
      />

      <div className="flex min-w-[10rem] flex-1 flex-col">
        <span className="font-medium text-gray-50">{song.title}</span>
        <span className="text-xs text-gray-400">
          {song.author || "sem autor"} · /{song.slug}
        </span>
      </div>

      <span
        className="flex items-center gap-1 text-xs text-gray-400"
        title={`${song.tracks.length} de ${VOICES.length} kits de voz enviados`}
      >
        <MusicNotes size={14} />
        {song.tracks.length}/{VOICES.length}
      </span>

      <button
        type="button"
        onClick={onToggleStatus}
        disabled={busy}
        title={
          isActive
            ? "Visível para os coralistas. Clique para ocultar."
            : "Oculta da lista pública. Clique para publicar."
        }
        className={`rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-60 ${
          isActive
            ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
        }`}
      >
        {isActive ? "ativa" : "inativa"}
      </button>

      <div className="flex items-center gap-1">
        <Link
          href={`/admin/musicas/${song.id}`}
          aria-label={`Editar ${song.title}`}
          className="rounded-lg p-2 text-gray-300 transition hover:bg-gray-700 hover:text-gray-50"
        >
          <PencilSimple size={18} />
        </Link>
        <Link
          href={`/admin/musicas/${song.id}/letra`}
          aria-label={`Editar a letra de ${song.title}`}
          className="rounded-lg p-2 text-gray-300 transition hover:bg-gray-700 hover:text-gray-50"
        >
          <TextAlignLeft size={18} />
        </Link>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Remover ${song.title}`}
          className="rounded-lg p-2 text-gray-300 transition hover:bg-primary/20 hover:text-primary disabled:opacity-40"
        >
          <Trash size={18} />
        </button>
      </div>
    </li>
  );
}

export default SongListRow;
