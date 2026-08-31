import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTrackObjectKey,
  isTrackObjectKeyFor,
  isValidSlug,
  parseTrackObjectKey,
} from "@/lib/object-keys";

describe("isValidSlug", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    assert.equal(isValidSlug("amados"), true);
    assert.equal(isValidSlug("cancao-do-apocalipse"), true);
    assert.equal(isValidSlug("salmo-23"), true);
  });

  it("rejects anything that would change the shape of an object key", () => {
    for (const slug of [
      "",
      "Amados",
      "com espaco",
      "-inicial",
      "final-",
      "duplo--hifen",
      "com/barra",
      "com.ponto",
      "..",
      "acentuação",
    ]) {
      assert.equal(isValidSlug(slug), false, `expected ${slug} to be rejected`);
    }
  });
});

describe("buildTrackObjectKey", () => {
  it("puts the kit under songs/<slug>/ with an .mp3 extension", () => {
    const key = buildTrackObjectKey("amados", "soprano");

    assert.match(key, /^songs\/amados\/soprano-[0-9a-f]{16}\.mp3$/);
  });

  it("never mints the same key twice, so an immutable URL is never reused", () => {
    const keys = new Set(
      Array.from({ length: 50 }, () => buildTrackObjectKey("amados", "tenor")),
    );

    assert.equal(keys.size, 50);
  });

  it("refuses to build a key from a slug it would have to sanitise", () => {
    assert.throws(() => buildTrackObjectKey("../../etc", "baixo"));
    assert.throws(() => buildTrackObjectKey("", "baixo"));
  });

  it("round-trips through the parser", () => {
    const key = buildTrackObjectKey("vem-a-nos", "contralto");

    assert.deepEqual(
      {
        slug: parseTrackObjectKey(key)?.slug,
        voice: parseTrackObjectKey(key)?.voice,
      },
      { slug: "vem-a-nos", voice: "contralto" },
    );
  });
});

describe("parseTrackObjectKey", () => {
  it("reads back a versioned key", () => {
    const parsed = parseTrackObjectKey(
      "songs/amados/soprano-0123456789abcdef.mp3",
    );

    assert.deepEqual(parsed, {
      slug: "amados",
      voice: "soprano",
      version: "0123456789abcdef",
    });
  });

  it("still reads the unversioned keys written during the JSON migration", () => {
    assert.deepEqual(parseTrackObjectKey("songs/amados/baixo.mp3"), {
      slug: "amados",
      voice: "baixo",
    });
  });

  it("rejects keys that escape the songs/ prefix or the expected shape", () => {
    for (const key of [
      "",
      "songs/amados/../../secret.mp3",
      "/songs/amados/soprano.mp3",
      "songs//soprano.mp3",
      "other/amados/soprano.mp3",
      "songs/amados/soprano.mp3.exe",
      "songs/amados/soprano.wav",
      "songs/amados/quinta-voz.mp3",
      "songs/amados/soprano-XYZ.mp3",
      "songs/amados/soprano-0123456789abcde.mp3",
      "songs/amados/nested/soprano.mp3",
      "https://example.com/songs/amados/soprano.mp3",
    ]) {
      assert.equal(
        parseTrackObjectKey(key),
        null,
        `expected ${key} to be rejected`,
      );
    }
  });
});

describe("isTrackObjectKeyFor", () => {
  const key = "songs/amados/soprano-0123456789abcdef.mp3";

  it("accepts a key belonging to the song and voice being confirmed", () => {
    assert.equal(isTrackObjectKeyFor(key, "amados", "soprano"), true);
  });

  it("rejects a key aimed at another song", () => {
    assert.equal(isTrackObjectKeyFor(key, "vem-a-nos", "soprano"), false);
  });

  it("rejects a key aimed at another voice of the same song", () => {
    assert.equal(isTrackObjectKeyFor(key, "amados", "tenor"), false);
  });

  it("rejects a malformed key outright", () => {
    assert.equal(isTrackObjectKeyFor("../secret", "amados", "soprano"), false);
  });
});
