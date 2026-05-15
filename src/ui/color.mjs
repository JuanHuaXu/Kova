// ANSI color helpers. Honors ui.color; emits raw text when disabled.
// Semantic palette only - no decorative colors.

const CODES = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  ok: "\x1b[32m",      // green   - PASS / SHIP / better
  err: "\x1b[31m",     // red     - FAIL / DO_NOT_SHIP / regression
  warn: "\x1b[33m",    // yellow  - INCOMPLETE / PARTIAL
  block: "\x1b[35m",   // magenta - BLOCKED (harness)
  head: "\x1b[36m",    // cyan    - section heads
  met: "\x1b[34m",     // blue    - metric values
  gray: "\x1b[90m",    // gray    - metadata
};

const BG = {
  ok: "\x1b[42;30m",       // green bg, black fg
  err: "\x1b[41;97m",      // red bg, white fg
  warn: "\x1b[43;30m",     // yellow bg, black fg
  block: "\x1b[45;30m",    // magenta bg, black fg
  neutral: "\x1b[100;97m", // dark gray bg, white fg
};

export function makeColor(ui) {
  const on = Boolean(ui && ui.color);
  const wrap = (code) => (text) => on ? `${code}${text}${CODES.reset}` : String(text);

  return {
    enabled: on,
    raw: CODES,
    bgRaw: BG,
    bold: wrap(CODES.bold),
    dim: wrap(CODES.dim),
    ok: wrap(CODES.ok),
    err: wrap(CODES.err),
    warn: wrap(CODES.warn),
    block: wrap(CODES.block),
    head: wrap(CODES.head + CODES.bold),
    met: wrap(CODES.met),
    gray: wrap(CODES.gray),
    pos: wrap(CODES.ok),
    neg: wrap(CODES.err),
    bg: {
      ok: wrap(BG.ok),
      err: wrap(BG.err),
      warn: wrap(BG.warn),
      block: wrap(BG.block),
      neutral: wrap(BG.neutral),
    },
  };
}

// Strip ANSI escape sequences from a string. Used for width measurement
// and to produce NO_COLOR-equivalent output for snapshots.
const ANSI_RE = /\x1b\[[0-9;]*m/g;
export function stripAnsi(text) {
  return String(text).replace(ANSI_RE, "");
}
