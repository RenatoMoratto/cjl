import { z } from "zod";

/**
 * The server boundary for agenda mutations, shared with the admin form so a
 * message shown before the request and after it are the same sentence.
 *
 * Dates and times stay strings ("YYYY-MM-DD", "HH:MM"): they sort and compare
 * correctly as text and carry no time zone to misread.
 */

const MAX_TITLE_LENGTH = 200;
const MAX_LOCATION_LENGTH = 200;

export const agendaEventIdSchema = z.coerce
  .number()
  .int("O identificador deve ser um número inteiro")
  .positive("O identificador deve ser positivo");

export const eventDateSchema = z.iso.date("Informe uma data válida");

/** null clears the time; an empty time input is sent as null, not "". */
export const eventTimeSchema = z.iso
  .time({ precision: -1, error: "Informe um horário no formato HH:MM" })
  .nullable();

export const eventTitleSchema = z
  .string()
  .trim()
  .min(1, "O título é obrigatório")
  .max(
    MAX_TITLE_LENGTH,
    `O título deve ter até ${MAX_TITLE_LENGTH} caracteres`,
  );

export const eventLocationSchema = z
  .string()
  .trim()
  .max(
    MAX_LOCATION_LENGTH,
    `O local deve ter até ${MAX_LOCATION_LENGTH} caracteres`,
  );

export const createAgendaEventSchema = z.object({
  date: eventDateSchema,
  time: eventTimeSchema.default(null),
  title: eventTitleSchema,
  location: eventLocationSchema.default(""),
});

export type CreateAgendaEventInput = z.infer<typeof createAgendaEventSchema>;

/**
 * Every field optional, but at least one required: a PATCH that names no field
 * is a caller bug, and silently succeeding would hide it.
 */
export const updateAgendaEventSchema = z
  .object({
    date: eventDateSchema,
    time: eventTimeSchema,
    title: eventTitleSchema,
    location: eventLocationSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar",
  });

export type UpdateAgendaEventInput = z.infer<typeof updateAgendaEventSchema>;
