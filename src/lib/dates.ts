/**
 * Today as "YYYY-MM-DD" in Londrina.
 *
 * Shared by the public agenda and the admin screen so both split past from
 * upcoming on the same day. The server runs in UTC, where midnight is 21:00
 * here, so its own date would hide an evening rehearsal on the day itself.
 */
export function todayInLondrina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/** "YYYY-MM-DD" as "dd/mm/aaaa", without a Date that could shift the day. */
export function formatEventDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Short weekday ("sex."). Read in UTC from a UTC midnight, so the viewer's own
 * time zone cannot move it to the day before.
 */
export function eventWeekday(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
