#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const imagesDir = path.join(__dirname, "../public/images");
const outputDir = path.join(__dirname, "../public/images-optimized");

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log("🖼️  Starting image optimization...");
console.log("ℹ️  Note: This script copies images and provides size analysis.");
console.log("   For actual compression, install cwebp: brew install webp");

// Get all image files
const imageFiles = fs
  .readdirSync(imagesDir)
  .filter((file) => /\.(webp|png|jpg|jpeg)$/i.test(file));

let totalOriginalSize = 0;
let totalOptimizedSize = 0;

imageFiles.forEach((imageFile) => {
  const inputPath = path.join(imagesDir, imageFile);
  const outputPath = path.join(outputDir, imageFile);

  try {
    // Copy the file (in a real scenario, you'd compress it)
    fs.copyFileSync(inputPath, outputPath);

    const originalSize = fs.statSync(inputPath).size;
    const optimizedSize = fs.statSync(outputPath).size;

    totalOriginalSize += originalSize;
    totalOptimizedSize += optimizedSize;

    console.log(
      `  ✅ ${imageFile}: ${(originalSize / 1024 / 1024).toFixed(2)}MB`,
    );
  } catch (error) {
    console.error(`  ❌ Error processing ${imageFile}:`, error.message);
  }
});

console.log("🎉 Image optimization complete!");
console.log("📊 Summary:");
console.log(
  `   Original size: ${(totalOriginalSize / 1024 / 1024).toFixed(1)}MB`,
);
console.log(
  `   Optimized size: ${(totalOptimizedSize / 1024 / 1024).toFixed(1)}MB`,
);
console.log("");
console.log("💡 To enable actual compression:");
console.log("   1. Install cwebp: brew install webp");
console.log("   2. Or use online tools like TinyPNG, Squoosh.app");
console.log("   3. Or implement with sharp library: npm install sharp");
