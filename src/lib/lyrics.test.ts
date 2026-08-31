import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findOutOfOrderIndexes,
  formatTimecode,
  parseTimecode,
  splitPastedLyrics,
  sortLinesByTime,
} from "@/lib/lyrics";

describe("formatTimecode", () => {
  it("renders minutes, seconds and hundredths", () => {
    assert.equal(formatTimecode(0), "0:00.00");
    assert.equal(formatTimecode(9.5), "0:09.50");
    assert.equal(formatTimecode(83.45), "1:23.45");
    assert.equal(formatTimecode(600), "10:00.00");
  });

  it("does not render a negative or unusable stamp", () => {
    assert.equal(formatTimecode(-1), "0:00.00");
    assert.equal(formatTimecode(Number.NaN), "0:00.00");
    assert.equal(formatTimecode(Number.POSITIVE_INFINITY), "0:00.00");
  });

  it("carries a rounded 59.999 into the next minute rather than showing :60", () => {
    assert.equal(formatTimecode(59.999), "1:00.00");
  });
});

describe("parseTimecode", () => {
  it("reads the forms the editor shows", () => {
    assert.equal(parseTimecode("1:23.45"), 83.45);
    assert.equal(parseTimecode("1:23"), 83);
    assert.equal(parseTimecode("0:09.50"), 9.5);
    assert.equal(parseTimecode("23"), 23);
    assert.equal(parseTimecode("23.4"), 23.4);
    assert.equal(parseTimecode(" 1:23.45 "), 83.45);
    assert.equal(parseTimecode("1:23,45"), 83.45);
  });

  it("round-trips through formatTimecode", () => {
    for (const seconds of [0, 1.25, 83.45, 125.09, 599.99]) {
      assert.equal(
        parseTimecode(formatTimecode(seconds)),
        seconds,
        `${seconds}`,
      );
    }
  });

  it("returns null rather than 0 for anything it cannot read", () => {
    // 0 is a real stamp, so a typo must not quietly become the start of the song.
    for (const text of ["", "abc", "1:99", "1:2:3", "-5", "1:", ":30"]) {
      assert.equal(parseTimecode(text), null, text);
    }
  });
});

describe("splitPastedLyrics", () => {
  it("makes one unstamped line per non-empty row", () => {
    assert.deepEqual(splitPastedLyrics("  Amados  \n\n Cantai \n"), [
      { text: "Amados", time: 0 },
      { text: "Cantai", time: 0 },
    ]);
  });

  it("gives nothing back for blank input", () => {
    assert.deepEqual(splitPastedLyrics("\n  \n"), []);
  });
});

describe("sortLinesByTime", () => {
  it("orders by stamp without touching the original", () => {
    const lines = [
      { text: "b", time: 10 },
      { text: "a", time: 2 },
    ];

    assert.deepEqual(sortLinesByTime(lines), [
      { text: "a", time: 2 },
      { text: "b", time: 10 },
    ]);
    assert.equal(lines[0].text, "b");
  });
});

describe("findOutOfOrderIndexes", () => {
  it("flags a line that starts before the one above it", () => {
    assert.deepEqual(
      findOutOfOrderIndexes([
        { text: "a", time: 0 },
        { text: "b", time: 12 },
        { text: "c", time: 5 },
        { text: "d", time: 20 },
      ]),
      [2],
    );
  });

  it("accepts equal stamps and an empty list", () => {
    assert.deepEqual(
      findOutOfOrderIndexes([
        { text: "a", time: 4 },
        { text: "b", time: 4 },
      ]),
      [],
    );
    assert.deepEqual(findOutOfOrderIndexes([]), []);
  });
});
