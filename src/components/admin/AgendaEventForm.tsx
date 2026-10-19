import { useState } from "react";
import { z } from "zod";

import Field from "@/components/admin/Field";
import {
  eventDateSchema,
  eventLocationSchema,
  eventTimeSchema,
  eventTitleSchema,
} from "@/lib/validation/agenda";

/**
 * The event form, shared by create and edit.
 *
 * Validates with the very same field schemas the API parses with, so a message
 * shown before the request and the one shown after it are the same sentence.
 */
const agendaEventFormSchema = z.object({
  date: eventDateSchema,
  time: eventTimeSchema,
  title: eventTitleSchema,
  location: eventLocationSchema,
});

export type AgendaEventFormValues = z.infer<typeof agendaEventFormSchema>;

interface AgendaEventFormProps {
  initial: AgendaEventFormValues;
  submitLabel: string;
  busy: boolean;
  /** Server-reported messages, keyed by the same paths this form validates on. */
  serverFieldError: (path: string) => string | undefined;
  formErrors: string[];
  /** Receives the parsed values plus only the fields that actually changed. */
  onSubmit: (
    values: AgendaEventFormValues,
    changed: Partial<AgendaEventFormValues>,
  ) => void | Promise<void>;
  onCancel: () => void;
}

function AgendaEventForm({
  initial,
  submitLabel,
  busy,
  serverFieldError,
  formErrors,
  onSubmit,
  onCancel,
}: AgendaEventFormProps) {
  const [values, setValues] = useState<AgendaEventFormValues>(initial);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  function set<K extends keyof AgendaEventFormValues>(
    key: K,
    value: AgendaEventFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const changed: Partial<AgendaEventFormValues> = {};

  for (const key of Object.keys(values) as Array<keyof AgendaEventFormValues>) {
    if (values[key] !== initial[key]) {
      Object.assign(changed, { [key]: values[key] });
    }
  }

  function error(path: keyof AgendaEventFormValues): string | undefined {
    return clientErrors[path] ?? serverFieldError(path);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const result = agendaEventFormSchema.safeParse(values);

    if (!result.success) {
      const next: Record<string, string> = {};

      // Same path rule the API uses to key its own field errors.
      for (const issue of result.error.issues) {
        const path = issue.path.join(".") || "_";
        next[path] ??= issue.message;
      }

      setClientErrors(next);
      return;
    }

    setClientErrors({});
    void onSubmit(result.data, changed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {formErrors.map((message) => (
        <p
          key={message}
          role="alert"
          className="rounded-xl bg-primary/15 px-3 py-2 text-sm text-gray-100"
        >
          {message}
        </p>
      ))}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Data" error={error("date")}>
          {(props) => (
            <input
              {...props}
              type="date"
              value={values.date}
              onChange={(event) => set("date", event.target.value)}
            />
          )}
        </Field>

        <Field
          label="Horário"
          error={error("time")}
          hint="Opcional. Deixe em branco para o horário de sempre."
        >
          {(props) => (
            <input
              {...props}
              type="time"
              value={values.time ?? ""}
              // An emptied time input reports "", which the API reads as
              // "no time" only when it arrives as null.
              onChange={(event) => set("time", event.target.value || null)}
            />
          )}
        </Field>
      </div>

      <Field label="Título" error={error("title")}>
        {(props) => (
          <input
            {...props}
            type="text"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
          />
        )}
      </Field>

      <Field label="Local" error={error("location")}>
        {(props) => (
          <input
            {...props}
            type="text"
            value={values.location}
            onChange={(event) => set("location", event.target.value)}
          />
        )}
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || Object.keys(changed).length === 0}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          title={
            Object.keys(changed).length === 0 ? "Nada foi alterado" : undefined
          }
        >
          {busy ? "Salvando..." : submitLabel}
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl bg-gray-700 px-4 py-2.5 text-sm transition hover:bg-gray-600 disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default AgendaEventForm;
