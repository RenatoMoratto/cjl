import { PencilSimple, Trash } from "@phosphor-icons/react";

import { eventWeekday, formatEventDate } from "@/lib/dates";
import type { Event } from "@/types";

interface AgendaEventRowProps {
  event: Event;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function AgendaEventRow({
  event,
  busy,
  onEdit,
  onDelete,
}: AgendaEventRowProps) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl bg-gray-900/70 p-3">
      <div className="flex w-28 shrink-0 flex-col">
        <span className="font-medium text-gray-50">
          {formatEventDate(event.date)}
        </span>
        <span className="text-xs text-gray-400">
          {eventWeekday(event.date)}
          {event.time && ` · ${event.time}`}
        </span>
      </div>

      <div className="flex min-w-[10rem] flex-1 flex-col">
        <span className="font-medium text-gray-50">{event.title}</span>
        <span className="text-xs text-gray-400">
          {event.location || "sem local"}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          aria-label={`Editar ${event.title}`}
          className="rounded-lg p-2 text-gray-300 transition hover:bg-gray-700 hover:text-gray-50 disabled:opacity-40"
        >
          <PencilSimple size={18} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Remover ${event.title}`}
          className="rounded-lg p-2 text-gray-300 transition hover:bg-primary/20 hover:text-primary disabled:opacity-40"
        >
          <Trash size={18} />
        </button>
      </div>
    </li>
  );
}

export default AgendaEventRow;
