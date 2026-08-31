import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_AUDIO_BYTES } from "@/lib/audio";
import {
  confirmTrackUploadSchema,
  createSongSchema,
  createUploadUrlSchema,
  imageUrlSchema,
  reorderSongsSchema,
  updateSongSchema,
} from "@/lib/validation/songs";
import { Status } from "@/types";

const validSong = {
  slug: "amados",
  title: "Amados",
  imageUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
};

describe("createSongSchema", () => {
  it("fills in the optional fields", () => {
    const parsed = createSongSchema.parse(validSong);

    assert.equal(parsed.author, "");
    assert.equal(parsed.status, Status.active);
    assert.deepEqual(parsed.lyrics, { lines: [] });
  });

  it("trims the title and normalises the slug", () => {
    const parsed = createSongSchema.parse({
      ...validSong,
      slug: "  AMADOS  ",
      title: "  Amados  ",
    });

    assert.equal(parsed.slug, "amados");
    assert.equal(parsed.title, "Amados");
  });

  it("requires a title", () => {
    assert.equal(
      createSongSchema.safeParse({ ...validSong, title: "   " }).success,
      false,
    );
  });

  // "Amados" is absent on purpose: casing is normalised, not rejected.
  it("rejects a slug that would break out of its object-key path", () => {
    for (const slug of ["../etc", "a/b", "com espaco", "acentuação", "--"]) {
      assert.equal(
        createSongSchema.safeParse({ ...validSong, slug }).success,
        false,
        `expected ${slug} to be rejected`,
      );
    }
  });

  it("accepts lyric lines and rejects negative timings", () => {
    const withLyrics = createSongSchema.parse({
      ...validSong,
      lyrics: { lines: [{ text: "Amados", time: 12.5, isSolo: true }] },
    });

    assert.equal(withLyrics.lyrics.lines[0].time, 12.5);

    assert.equal(
      createSongSchema.safeParse({
        ...validSong,
        lyrics: { lines: [{ text: "x", time: -1 }] },
      }).success,
      false,
    );
  });
});

describe("imageUrlSchema", () => {
  it("accepts a root-relative path and a configured remote host", () => {
    assert.equal(
      imageUrlSchema.parse("/images/soprano.webp"),
      "/images/soprano.webp",
    );
    assert.equal(
      imageUrlSchema.safeParse("https://i.ytimg.com/vi/abc/hq.jpg").success,
      true,
    );
  });

  it("rejects hosts next/image is not configured to optimise", () => {
    assert.equal(
      imageUrlSchema.safeParse("https://evil.example.com/x.jpg").success,
      false,
    );
  });

  it("rejects http, protocol-relative URLs and javascript:", () => {
    for (const value of [
      "http://i.ytimg.com/vi/abc/hq.jpg",
      "//i.ytimg.com/vi/abc/hq.jpg",
      "javascript:alert(1)",
      "not a url",
    ]) {
      assert.equal(
        imageUrlSchema.safeParse(value).success,
        false,
        `expected ${value} to be rejected`,
      );
    }
  });
});

describe("updateSongSchema", () => {
  it("accepts a single field", () => {
    assert.deepEqual(updateSongSchema.parse({ title: "Novo" }), {
      title: "Novo",
    });
  });

  it("rejects an empty patch, which is always a caller bug", () => {
    assert.equal(updateSongSchema.safeParse({}).success, false);
  });
});

describe("reorderSongsSchema", () => {
  it("accepts a list of ids", () => {
    assert.deepEqual(reorderSongsSchema.parse({ orderedIds: [3, 1, 2] }), {
      orderedIds: [3, 1, 2],
    });
  });

  it("rejects duplicates and empty lists", () => {
    assert.equal(
      reorderSongsSchema.safeParse({ orderedIds: [1, 1, 2] }).success,
      false,
    );
    assert.equal(
      reorderSongsSchema.safeParse({ orderedIds: [] }).success,
      false,
    );
  });
});

describe("createUploadUrlSchema", () => {
  const validUpload = {
    songId: 1,
    voice: "soprano",
    filename: "soprano.mp3",
    contentType: "audio/mpeg",
    sizeBytes: 5_884_077,
  };

  it("accepts a plausible MP3 upload", () => {
    assert.equal(createUploadUrlSchema.safeParse(validUpload).success, true);
  });

  it("accepts the MIME spellings browsers actually send for MP3", () => {
    for (const contentType of ["audio/mp3", "audio/mpeg3", "audio/x-mpeg-3"]) {
      assert.equal(
        createUploadUrlSchema.safeParse({ ...validUpload, contentType })
          .success,
        true,
        `expected ${contentType} to be accepted`,
      );
    }
  });

  it("rejects non-audio types and non-mp3 extensions", () => {
    assert.equal(
      createUploadUrlSchema.safeParse({
        ...validUpload,
        contentType: "application/x-msdownload",
      }).success,
      false,
    );

    assert.equal(
      createUploadUrlSchema.safeParse({
        ...validUpload,
        filename: "soprano.exe",
      }).success,
      false,
    );
  });

  it("rejects a file larger than the cap or too small to be audio", () => {
    assert.equal(
      createUploadUrlSchema.safeParse({
        ...validUpload,
        sizeBytes: MAX_AUDIO_BYTES + 1,
      }).success,
      false,
    );

    assert.equal(
      createUploadUrlSchema.safeParse({ ...validUpload, sizeBytes: 0 }).success,
      false,
    );
  });

  it("rejects an unknown voice", () => {
    assert.equal(
      createUploadUrlSchema.safeParse({ ...validUpload, voice: "regente" })
        .success,
      false,
    );
  });
});

describe("confirmTrackUploadSchema", () => {
  it("accepts a well-formed key", () => {
    assert.equal(
      confirmTrackUploadSchema.safeParse({
        songId: 1,
        voice: "soprano",
        objectKey: "songs/amados/soprano-0123456789abcdef.mp3",
      }).success,
      true,
    );
  });

  it("rejects a key that escapes the songs/ prefix", () => {
    for (const objectKey of [
      "../../../etc/passwd",
      "/songs/amados/soprano.mp3",
      "other-bucket-path/x.mp3",
      "songs/amados/soprano.mp3.exe",
    ]) {
      assert.equal(
        confirmTrackUploadSchema.safeParse({
          songId: 1,
          voice: "soprano",
          objectKey,
        }).success,
        false,
        `expected ${objectKey} to be rejected`,
      );
    }
  });
});
