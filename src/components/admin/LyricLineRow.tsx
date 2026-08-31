import { Timer, Trash, Warning, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { formatTimecode, parseTimecode } from "@/lib/lyrics";
import type { Lines } from "@/types";

interface LyricLineRowProps {
  line: Lines;
  index: number;
  selected: boolean;
  outOfOrder: boolean;
  onSelect: () => void;
  onChangeText: (text: string) => void;
  onChangeTime: (time: number) => void;
  onClearTime: () => void;
  onToggleSolo: () => void;
  onRemove: () => void;
  onStamp: () => void;
}

function LyricLineRow({
  line,
  index,
  selected,
  outOfOrder,
  onSelect,
  onChangeText,
  onChangeTime,
  onClearTime,
  onToggleSolo,
  onRemove,
  onStamp,
}: LyricLineRowProps) {
  const rowRef = useRef<HTMLLIElement>(null);
  // The timecode input is free text while being edited, so a half-typed "1:" is
  // not treated as a failed parse and reset under the person's cursor.
  const [draft, setDraft] = useState<string | null>(null);
  const stamped = line.time > 0 || index === 0;

  useEffect(() => {
    if (selected) {
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  return (
    <li
      ref={rowRef}
      onFocusCapture={onSelect}
      onClick={onSelect}
      className={`flex items-center gap-2 rounded-xl border p-2 transition ${
        selected
          ? "border-primary bg-gray-900"
          : "border-transparent bg-gray-900/50"
      }`}
    >
      <span className="w-6 shrink-0 text-right text-xs text-gray-500">
        {index + 1}
      </span>

      <input
        type="text"
        aria-label={`Texto da linha ${index + 1}`}
        value={line.text}
        onChange={(event) => onChangeText(event.target.value)}
        className={`min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-50 focus:border-primary focus:outline-none ${
          line.isSolo ? "italic text-gray-300" : ""
        }`}
      />

      <input
        type="text"
        aria-label={`Tempo da linha ${index + 1}`}
        value={draft ?? (stamped ? formatTimecode(line.time) : "--:--")}
        onFocus={() => setDraft(formatTimecode(line.time))}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== null) {
            const parsed = parseTimecode(draft);
            if (parsed !== null) onChangeTime(parsed);
          }
          setDraft(null);
        }}
        className={`w-24 shrink-0 rounded border px-2 py-1.5 text-center font-mono text-xs focus:outline-none ${
          outOfOrder
            ? "border-yellow-500 bg-gray-800 text-yellow-300"
            : stamped
              ? "border-gray-700 bg-gray-800 text-gray-200 focus:border-primary"
              : "border-gray-700 bg-gray-800 text-gray-500 focus:border-primary"
        }`}
      />

      {outOfOrder && (
        <span
          title="Esta linha começa antes da anterior; a letra vai destacar fora de ordem."
          className="text-yellow-400"
        >
          <Warning size={16} weight="fill" />
        </span>
      )}

      <button
        type="button"
        onClick={onStamp}
        title="Marcar o tempo atual nesta linha"
        aria-label={`Marcar o tempo na linha ${index + 1}`}
        className="rounded p-1.5 text-gray-300 transition hover:bg-gray-700 hover:text-gray-50"
      >
        <Timer size={16} />
      </button>

      <button
        type="button"
        onClick={onClearTime}
        title="Limpar o tempo desta linha"
        aria-label={`Limpar o tempo da linha ${index + 1}`}
        className="rounded p-1.5 text-gray-300 transition hover:bg-gray-700 hover:text-gray-50"
      >
        <X size={16} />
      </button>

      <button
        type="button"
        onClick={onToggleSolo}
        title="Marcar como solo"
        aria-pressed={Boolean(line.isSolo)}
        className={`rounded px-2 py-1 text-xs transition ${
          line.isSolo
            ? "bg-secondary text-white"
            : "text-gray-400 hover:bg-gray-700"
        }`}
      >
        solo
      </button>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover a linha ${index + 1}`}
        className="rounded p-1.5 text-gray-400 transition hover:bg-primary/20 hover:text-primary"
      >
        <Trash size={16} />
      </button>
    </li>
  );
}

export default LyricLineRow;
