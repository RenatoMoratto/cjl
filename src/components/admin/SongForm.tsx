import { useState } from "react";
import { z } from "zod";

import Field from "@/components/admin/Field";
import {
  authorSchema,
  imageUrlSchema,
  slugSchema,
  statusSchema,
  titleSchema,
} from "@/lib/validation/songs";
import { Status } from "@/types";

/**
 * The song metadata form, shared by create and edit.
 *
 * Validates with the very same field schemas the API parses with, so a message
 * shown before the request and the one shown after it are the same sentence.
 * Deliberately composed field by field rather than reusing createSongSchema:
 * that one defaults `lyrics` to an empty list, and letting an empty default
 * anywhere near an edit payload is how a saved lyric gets wiped by a title
 * change.
 */
const songFormSchema = z.object({
  slug: slugSchema,
  title: titleSchema,
  author: authorSchema,
  imageUrl: imageUrlSchema,
  status: statusSchema,
});

export type SongFormValues = z.infer<typeof songFormSchema>;

interface SongFormProps {
  initial: SongFormValues;
  submitLabel: string;
  busy: boolean;
  /** Server-reported messages, keyed by the same paths this form validates on. */
  serverFieldError: (path: string) => string | undefined;
  formErrors: string[];
  /** Enables the note about kits keeping the old slug in their object keys. */
  hasTracks?: boolean;
  /** Receives the parsed values plus only the fields that actually changed. */
  onSubmit: (
    values: SongFormValues,
    changed: Partial<SongFormValues>,
  ) => void | Promise<void>;
}

function SongForm({
  initial,
  submitLabel,
  busy,
  serverFieldError,
  formErrors,
  hasTracks = false,
  onSubmit,
}: SongFormProps) {
  const [values, setValues] = useState<SongFormValues>(initial);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  function set<K extends keyof SongFormValues>(
    key: K,
    value: SongFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const changed: Partial<SongFormValues> = {};

  for (const key of Object.keys(values) as Array<keyof SongFormValues>) {
    // Object.assign rather than an indexed write: each key's value type matches
    // its own slot, but the key union defeats that on the left-hand side.
    if (values[key] !== initial[key]) {
      Object.assign(changed, { [key]: values[key] });
    }
  }

  const slugChanged = changed.slug !== undefined;

  function error(path: keyof SongFormValues): string | undefined {
    return clientErrors[path] ?? serverFieldError(path);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const result = songFormSchema.safeParse(values);

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

        <Field label="Autor" error={error("author")}>
          {(props) => (
            <input
              {...props}
              type="text"
              value={values.author}
              onChange={(event) => set("author", event.target.value)}
            />
          )}
        </Field>

        <Field
          label="Slug"
          error={error("slug")}
          hint={
            hasTracks && slugChanged
              ? "Os kits já enviados continuam sob o slug antigo e seguem funcionando; apenas os próximos envios usarão o novo."
              : "Letras minúsculas, números e hífens. Vai para o endereço dos arquivos de áudio."
          }
        >
          {(props) => (
            <input
              {...props}
              type="text"
              value={values.slug}
              onChange={(event) => set("slug", event.target.value)}
            />
          )}
        </Field>

        <Field
          label="Status"
          error={error("status")}
          hint="Inativa some da lista pública, mas continua acessível por link direto."
        >
          {(props) => (
            <select
              {...props}
              value={values.status}
              onChange={(event) => set("status", event.target.value as Status)}
            >
              <option value={Status.active}>ativa</option>
              <option value={Status.inactive}>inativa</option>
            </select>
          )}
        </Field>
      </div>

      <Field
        label="Imagem"
        error={error("imageUrl")}
        hint="Um caminho começando por / ou uma URL https em i.ytimg.com."
      >
        {(props) => (
          <input
            {...props}
            type="text"
            value={values.imageUrl}
            onChange={(event) => set("imageUrl", event.target.value)}
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

        {Object.keys(changed).length > 0 && !busy && (
          <span className="text-xs text-gray-400">
            {Object.keys(changed).length} campo(s) alterado(s)
          </span>
        )}
      </div>
    </form>
  );
}

export default SongForm;
