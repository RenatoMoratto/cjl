#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffmpeg = require("fluent-ffmpeg");
ffmpeg.setFfmpegPath(ffmpegPath);

const songsDir = path.join(__dirname, "../public/songs");
const outputDir = path.join(__dirname, "../public/songs-optimized");

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log("🎵 Starting audio optimization...");

// Get all song directories
const songDirs = fs
  .readdirSync(songsDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name);

songDirs.forEach((songDir) => {
  const songPath = path.join(songsDir, songDir);
  const outputSongPath = path.join(outputDir, songDir);

  // Create output song directory
  if (!fs.existsSync(outputSongPath)) {
    fs.mkdirSync(outputSongPath, { recursive: true });
  }

  console.log(`📁 Processing ${songDir}...`);

  // Get all MP3 files in the song directory
  const mp3Files = fs
    .readdirSync(songPath)
    .filter((file) => file.endsWith(".mp3"));

  mp3Files.forEach((mp3File) => {
    const inputPath = path.join(songPath, mp3File);
    const outputPath = path.join(outputSongPath, mp3File);

    try {
      // Use fluent-ffmpeg to compress audio (reduce bitrate to 128kbps)
      // We'll run synchronously per file via await-like pattern using a Promise
      const compress = () =>
        new Promise((resolve, reject) => {
          ffmpeg(inputPath)
            .audioBitrate("128k")
            .outputOptions(["-y"]) // overwrite
            .on("end", () => resolve())
            .on("error", (err) => reject(err))
            .save(outputPath);
        });

      compress()
        .then(() => {
          const originalSize = fs.statSync(inputPath).size;
          const optimizedSize = fs.statSync(outputPath).size;
          const savings = (
            ((originalSize - optimizedSize) / originalSize) *
            100
          ).toFixed(1);
          console.log(
            `  ✅ ${mp3File}: ${(originalSize / 1024 / 1024).toFixed(1)}MB → ${(optimizedSize / 1024 / 1024).toFixed(1)}MB (${savings}% savings)`,
          );
        })
        .catch((error) => {
          console.error(`  ❌ Error processing ${mp3File}:`, error.message);
        });
    } catch (error) {
      console.error(`  ❌ Error processing ${mp3File}:`, error.message);
    }
  });
});

console.log("🎉 Audio optimization complete!");
console.log("📊 Summary:");
console.log(`   Original size: ${getDirSize(songsDir)}`);
console.log(`   Optimized size: ${getDirSize(outputDir)}`);

function getDirSize(dirPath) {
  let totalSize = 0;

  function calculateSize(itemPath) {
    const stats = fs.statSync(itemPath);
    if (stats.isDirectory()) {
      fs.readdirSync(itemPath).forEach((file) => {
        calculateSize(path.join(itemPath, file));
      });
    } else {
      totalSize += stats.size;
    }
  }

  calculateSize(dirPath);
  return `${(totalSize / 1024 / 1024).toFixed(1)}MB`;
}
