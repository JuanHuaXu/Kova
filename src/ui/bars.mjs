// Gauges and sparklines, ANSI-aware.

import { makeGlyphs } from "./glyphs.mjs";

// gauge(value, max, width) -> "█████░░░░░"
export function gauge(value, max, width = 20, ui) {
  const glyphs = makeGlyphs(ui);
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const filled = Math.round(ratio * width);
  const empty = Math.max(0, width - filled);
  return glyphs.bar.repeat(filled) + glyphs.barEmpty.repeat(empty);
}

// sparkline([1,2,3,4]) -> "▁▂▃▄"
export function sparkline(values, ui) {
  if (!Array.isArray(values) || values.length === 0) return "";
  const glyphs = makeGlyphs(ui);
  const levels = glyphs.spark;
  const numeric = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (numeric.length === 0) return "";
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const span = max - min;
  return numeric.map((v) => {
    if (span === 0) return levels[Math.floor(levels.length / 2)];
    const idx = Math.round(((v - min) / span) * (levels.length - 1));
    return levels[idx];
  }).join("");
}

// Render a small inline progress bar for a known total.
export function progressBar(done, total, width = 24, ui) {
  return gauge(done, total, width, ui);
}
