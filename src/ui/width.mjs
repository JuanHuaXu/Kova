// Width resolution + horizontal framing.
//
// Wide terminals stretch our verdict bands, KPI strips, and tables out
// of their designed proportions. We cap content at a soft maximum and
// leave the rest of the terminal as empty margin.
//
// Pure stdlib. No ANSI awareness needed; margin is whitespace.

export const WIDTH_DEFAULT = 80;
export const WIDTH_MIN = 40;
export const WIDTH_ENV = "KOVA_WIDTH";
export const ALIGN_ENV = "KOVA_ALIGN";

// resolveWidth(termCols, flags, env) -> { width, leftPad, capped, align }
//
// terminalCols  raw stream.columns (or fallback)
// flags.width   "auto" | "full" | "off" | number | true | undefined
// flags.align   "left" | "center" | undefined
// env.KOVA_WIDTH same shape as flags.width
// env.KOVA_ALIGN same shape as flags.align
export function resolveWidth(termCols, flags = {}, env = process.env) {
  const align = pickAlign(flags.align, env[ALIGN_ENV]);
  const target = pickWidth(flags.width, env[WIDTH_ENV], termCols);
  const width = Math.max(WIDTH_MIN, Math.min(target, termCols));
  const slack = Math.max(0, termCols - width);
  const leftPad = align === "center" ? Math.floor(slack / 2) : 0;
  return { width, leftPad, capped: width < termCols, align };
}

function pickWidth(flag, envVal, termCols) {
  for (const v of [flag, envVal]) {
    if (v == null || v === "" || v === true || v === "auto") continue;
    const s = String(v).toLowerCase();
    if (s === "full" || s === "off" || s === "none") return termCols;
    const n = Number(s);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return WIDTH_DEFAULT;
}

function pickAlign(flag, envVal) {
  for (const v of [flag, envVal]) {
    if (v == null || v === "" || v === true) continue;
    const s = String(v).toLowerCase();
    if (s === "center" || s === "centre" || s === "middle") return "center";
    if (s === "left" || s === "start") return "left";
  }
  return "left";
}

// withMargin(text, leftPad) -> text with `leftPad` spaces prepended to
// every non-empty line. Empty lines stay empty so blank rows do not
// produce trailing whitespace.
export function withMargin(text, leftPad) {
  if (!leftPad || leftPad <= 0) return text;
  const pad = " ".repeat(leftPad);
  return String(text)
    .split("\n")
    .map((line) => (line === "" ? line : pad + line))
    .join("\n");
}
