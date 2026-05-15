// ANSI-aware text utilities: width measurement, padding, truncation, wrapping.

import { stripAnsi } from "./color.mjs";

export function visualWidth(text) {
  if (text == null) return 0;
  const stripped = stripAnsi(String(text));
  // Count code points, not UTF-16 code units; box-drawing chars are width 1.
  let width = 0;
  for (const _ of stripped) width += 1;
  return width;
}

export function padEnd(text, width, char = " ") {
  const w = visualWidth(text);
  if (w >= width) return text;
  return text + char.repeat(width - w);
}

export function padStart(text, width, char = " ") {
  const w = visualWidth(text);
  if (w >= width) return text;
  return char.repeat(width - w) + text;
}

export function truncate(text, width, ellipsis = "…") {
  const w = visualWidth(text);
  if (w <= width) return text;
  if (width <= 1) return ellipsis.slice(0, width);
  // Walk visible chars while preserving ANSI; simple approach: strip, truncate,
  // and discard color rather than try to interleave - the renderer can re-color.
  const plain = stripAnsi(text);
  return plain.slice(0, Math.max(0, width - 1)) + ellipsis;
}

export function repeat(char, n) {
  if (n <= 0) return "";
  return char.repeat(n);
}

// Wrap a plain string at word boundaries to the given visual width.
// ANSI-naive: callers should wrap before colorizing.
export function wrap(text, width) {
  if (width <= 0) return [String(text)];
  const out = [];
  for (const para of String(text).split("\n")) {
    if (para.length === 0) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (line.length === 0) { line = word; continue; }
      if (line.length + 1 + word.length <= width) line += " " + word;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}

// Indent every line of a multi-line string with the given prefix.
export function indent(text, prefix = "  ") {
  return String(text).split("\n").map((line) => prefix + line).join("\n");
}
