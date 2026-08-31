import type { Lines } from "@/types";

/**
 * Pure helpers behind the lyrics editor.
 *
 * Kept out of the component so the fiddly parts — timecode parsing above all —
 * are testable. A silent off-by-one here corrupts a stored lyric in a way
 * nobody notices until a rehearsal.
 */

/** Hundredths of a second: far below what anyone can hear, and keeps jsonb small. */
export function roundToCentiseconds(seconds: number): number {
  return Math.round(seconds * 100) / 100;
}

/** Formats a stamp as m:ss.cc, the form the editor accepts back. */
export function formatTimecode(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const total = roundToCentiseconds(safe);

  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const centis = Math.round((total - Math.floor(total)) * 100);

  return `${minutes}:${secs.toString().padStart(2, "0")}.${centis
    .toString()
    .padStart(2, "0")}`;
}

const TIMECODE = /^(?:(\d+):)?([0-5]?\d)(?:[.,](\d{1,2}))?$/;

/**
 * Reads m:ss.cc, m:ss, ss.cc or ss back into seconds.
 *
 * Returns null rather than 0 for anything unrecognised: 0 is a legitimate
 * stamp, so conflating the two would silently move a line to the start of the
 * song on a typo.
 */
export function parseTimecode(text: string): number | null {
  const match = TIMECODE.exec(text.trim());

  if (!match) return null;

  const [, minutes, seconds, fraction] = match;
  const centis = fraction ? Number(fraction.padEnd(2, "0")) : 0;

  return roundToCentiseconds(
    Number(minutes ?? 0) * 60 + Number(seconds) + centis / 100,
  );
}

/**
 * Turns pasted text into unstamped lines.
 *
 * Blank lines are dropped: they carry no timing and would only be rows to
 * delete by hand.
 */
export function splitPastedLyrics(text: string): Lines[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ text: line, time: 0 }));
}

export function sortLinesByTime(lines: Lines[]): Lines[] {
  return [...lines].sort((a, b) => a.time - b.time);
}

/**
 * Lines that start before the one above them.
 *
 * TextReader decides which line is active by comparing the clock against the
 * *next* line's time, so an unsorted list highlights the wrong line rather than
 * failing visibly. The editor lets stamps land in any order, so it has to point
 * this out itself.
 */
export function findOutOfOrderIndexes(lines: Lines[]): number[] {
  const flagged: number[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].time < lines[index - 1].time) flagged.push(index);
  }

  return flagged;
}
