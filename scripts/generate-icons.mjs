/**
 * Run once: `node scripts/generate-icons.mjs`
 * Requires the `canvas` package: `npm install canvas --save-dev`
 *
 * Generates simple placeholder PWA icons into public/icons/.
 * Replace with your own branding later.
 */
import { createCanvas } from "canvas";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const sizes = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const { name, size } of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(0, 0, size, size);

  // Rounded corners mask (approximate)
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  const r = size * 0.22;
  ctx.roundRect(0, 0, size, size, r);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  // Text
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(size * 0.28)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("IFS", size / 2, size / 2);

  writeFileSync(join(outDir, name), canvas.toBuffer("image/png"));
  console.log(`✓ ${name}`);
}
console.log("Icons generated in public/icons/");
