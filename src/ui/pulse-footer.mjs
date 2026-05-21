// Transient single-line footer driven by the Kova pulse spinner.
//
// Append-only progress streams (`createRunProgress`, `createSelfCheckProgress`)
// own the scroll buffer. Between events, this footer renders a single
// "alive" line that ticks the brand pulse glyph plus a short context label,
// and is overwritten by the next real event line (or cleared on stop).
//
// Silent contract: when the host stream is not a TTY, or when callers ask
// for silent output (`--json` / `--plain` / `--no-progress`), every method
// becomes a no-op so log mode stays scrollable and CI logs stay clean.

import { makeUi } from "./index.mjs";

const DEFAULT_INTERVAL_MS = 80;

export function createPulseFooter({ stream = process.stderr, env = process.env, flags = {}, silent = false, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  const enabled = !silent && stream && stream.isTTY === true;
  if (!enabled) return NOOP;

  const ui = makeUi(flags, env, stream);
  const { g } = ui;
  const frames = Array.isArray(g.spinnerKovaPulse) && g.spinnerKovaPulse.length > 0
    ? g.spinnerKovaPulse
    : ["|", "/", "-", "\\"];

  let frameIx = 0;
  let context = "";
  let timer = null;
  let visible = false;

  // Wave mode renders the pulse across a fixed window of cells, with each
  // cell sampling a phase-shifted frame so the heartbeat reads as a moving
  // ripple. We only enable wave mode when the glyph set looks like the
  // Kova pulse (>= 8 distinct height levels). ASCII frames (e.g.
  // `|/-\`) stay in single-cell mode so they don't smear.
  const WAVE_WIDTH = 7;
  const waveMode = frames.length >= 8;

  function paint() {
    let glyphs;
    if (waveMode) {
      const cells = [];
      for (let i = 0; i < WAVE_WIDTH; i++) {
        cells.push(frames[(frameIx + i) % frames.length]);
      }
      glyphs = cells.join("");
    } else {
      glyphs = frames[frameIx % frames.length];
    }
    frameIx += 1;
    const label = context ? ` ${context}` : "";
    stream.write(`\r\x1b[2K\x1b[2m${glyphs}${label}\x1b[0m`);
    visible = true;
  }

  function clear() {
    if (!visible) return;
    stream.write("\r\x1b[2K");
    visible = false;
  }

  function start(initialContext) {
    if (initialContext != null) context = String(initialContext);
    if (timer) return;
    paint();
    timer = setInterval(paint, intervalMs);
    if (typeof timer.unref === "function") timer.unref();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    clear();
  }

  function setContext(text) {
    context = text == null ? "" : String(text);
  }

  return { start, stop, clear, setContext, paint, get enabled() { return true; } };
}

const NOOP = {
  start() {},
  stop() {},
  clear() {},
  setContext() {},
  paint() {},
  get enabled() { return false; },
};
