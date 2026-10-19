import { ArrowClockwise, Plus } from "@phosphor-icons/react";
import type { InferGetServerSidePropsType } from "next";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

import AdminLayout from "@/components/admin/AdminLayout";
import AgendaEventForm, {
  type AgendaEventFormValues,
} from "@/components/admin/AgendaEventForm";
import AgendaEventRow from "@/components/admin/AgendaEventRow";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import {
  adminApi,
  ApiError,
  isNotFound,
  isUnauthenticated,
} from "@/lib/api/client";
import { withAdminPage } from "@/lib/auth/page";
import { formatEventDate, todayInLondrina } from "@/lib/dates";
import type { Event as AgendaEvent } from "@/types";

/**
 * The agenda: upcoming events first, past ones folded away below.
 *
 * Create and edit share one form at the top of the card rather than separate
 * pages, since an event is four fields. There is no ordering to save: the list
 * is always by date, then time, the same order the public page uses.
 */

/** Mirrors EVENT_ORDER in src/services/agenda.ts: no time sorts first. */
function compareEvents(a: AgendaEvent, b: AgendaEvent): number {
  return (
    a.date.localeCompare(b.date) ||
    (a.time ?? "").localeCompare(b.time ?? "") ||
    a.id - b.id
  );
}

function toFormValues(event: AgendaEvent): AgendaEventFormValues {
  return {
    date: event.date,
    time: event.time ?? null,
    title: event.title,
    location: event.location,
  };
}

export default function AdminAgenda({
  admin,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [events, setEvents] = useState<AgendaEvent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgendaEvent | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AgendaEvent | null>(null);
  const { errors, fieldError, capture, clear } = useFieldErrors();

  const load = useCallback(async () => {
    setLoadError(null);

    try {
      setEvents(await adminApi.listEvents());
    } catch (error) {
      if (isUnauthenticated(error)) {
        window.location.href = "/admin/entrar?callbackUrl=%2Fadmin%2Fagenda";
        return;
      }

      setLoadError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível carregar a agenda.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEditing(target: AgendaEvent | "new") {
    clear();
    setEditing(target);
  }

  async function save(
    values: AgendaEventFormValues,
    changed: Partial<AgendaEventFormValues>,
  ) {
    if (!editing) return;

    setBusy(true);
    clear();

    try {
      const saved =
        editing === "new"
          ? await adminApi.createEvent(values)
          : await adminApi.updateEvent(editing.id, changed);

      setEvents((current) =>
        [...(current ?? []).filter((item) => item.id !== saved.id), saved].sort(
          compareEvents,
        ),
      );
      setEditing(null);
      toast.success(editing === "new" ? "Evento criado." : "Evento salvo.");
    } catch (error) {
      // capture has already shown anything that is not a form problem. A 404
      // means another tab removed the event, so the list here is stale.
      if (!capture(error) && isNotFound(error)) {
        setEditing(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;

    setBusy(true);

    try {
      await adminApi.deleteEvent(pendingDelete.id);

      setEvents(
        (current) =>
          current?.filter((item) => item.id !== pendingDelete.id) ?? current,
      );
      if (editing !== "new" && editing?.id === pendingDelete.id) {
        setEditing(null);
      }
      toast.success("Evento removido.");
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível remover o evento.",
      );
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  }

  const today = todayInLondrina();
  const upcoming = events?.filter((event) => event.date >= today) ?? [];
  // Most recent first: the past event an admin looks for is usually last week's.
  const past = events?.filter((event) => event.date < today).reverse() ?? [];

  function renderRows(list: AgendaEvent[]) {
    return (
      <ul className="flex flex-col gap-2">
        {list.map((event) => (
          <AgendaEventRow
            key={event.id}
            event={event}
            busy={busy}
            onEdit={() => startEditing(event)}
            onDelete={() => setPendingDelete(event)}
          />
        ))}
      </ul>
    );
  }

  return (
    <AdminLayout
      admin={admin}
      title="Agenda"
      actions={
        <button
          type="button"
          onClick={() => startEditing("new")}
          disabled={busy || editing === "new"}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          <Plus size={16} weight="bold" />
          Novo evento
        </button>
      }
    >
      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-primary/15 px-3 py-2 text-sm text-gray-100">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-1.5 transition hover:bg-gray-600"
          >
            <ArrowClockwise size={14} />
            Recarregar
          </button>
        </div>
      )}

      {editing && (
        <section className="flex flex-col gap-4 rounded-2xl bg-gray-900/70 p-4">
          <h2 className="text-lg font-semibold text-gray-50">
            {editing === "new" ? "Novo evento" : "Editar evento"}
          </h2>
          <AgendaEventForm
            // Remounted per event, so switching rows never carries edits over.
            key={editing === "new" ? "new" : editing.id}
            initial={
              editing === "new"
                ? { date: today, time: null, title: "", location: "" }
                : toFormValues(editing)
            }
            submitLabel={editing === "new" ? "Criar evento" : "Salvar"}
            busy={busy}
            serverFieldError={fieldError}
            formErrors={errors.form}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        </section>
      )}

      {events === null && !loadError && (
        <p className="text-sm text-gray-400">Carregando...</p>
      )}

      {events && (
        <>
          <h2 className="text-sm font-medium text-gray-300">
            Próximos ({upcoming.length})
          </h2>
          {upcoming.length > 0 ? (
            renderRows(upcoming)
          ) : (
            <p className="text-sm text-gray-400">
              Nenhum evento agendado. A agenda pública está vazia.
            </p>
          )}

          {past.length > 0 && (
            <details className="flex flex-col gap-2">
              <summary className="cursor-pointer text-sm font-medium text-gray-300">
                Anteriores ({past.length})
              </summary>
              <div className="mt-2">{renderRows(past)}</div>
            </details>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remover evento"
        description={
          <>
            <strong className="text-gray-100">{pendingDelete?.title}</strong> em{" "}
            {pendingDelete && formatEventDate(pendingDelete.date)} sai da agenda
            pública. Esta ação não pode ser desfeita.
          </>
        }
        confirmLabel="Remover"
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </AdminLayout>
  );
}

export const getServerSideProps = withAdminPage();
