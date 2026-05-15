// Live-ish progress emitter for kova run / kova matrix run.
//
// On TTY: stylized lines with status glyphs.
// On CI/non-TTY: plain "[start] ... / [done] ..." lines.
// When --json or --plain is set, the emitter is a no-op.
//
// This is not a spinner — it logs discrete events so logs replay sanely in CI.

import { makeUi } from "../ui/index.mjs";

export function createRunProgress({ flags = {}, env = process.env, stream = process.stderr, mode = "run" } = {}) {
  const silent = flags.json === true || flags.plain === true || flags.no_progress === true;
  if (silent) return NOOP;

  const ui = makeUi(flags, env, stream);
  const { c, g } = ui;
  const start = process.hrtime.bigint();
  const t0 = new Map();

  function elapsedMs(from) {
    return Number((process.hrtime.bigint() - from) / 1_000_000n);
  }

  function fmtDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  return {
    runStart({ scenarioCount, mode: m, target, profile }) {
      const tag = (m ?? mode).toUpperCase();
      const head = c.head(`[${tag}]`);
      const parts = [];
      if (profile) parts.push(`profile ${c.bold(profile)}`);
      parts.push(`${c.bold(scenarioCount)} ${scenarioCount === 1 ? "entry" : "entries"}`);
      if (target) parts.push(`target ${c.bold(target)}`);
      stream.write(`${head} ${parts.join(`  ${g.sep}  `)}\n`);
    },

    scenarioStart({ scenarioId, stateId, iteration }) {
      const key = entryKey(scenarioId, stateId, iteration);
      t0.set(key, process.hrtime.bigint());
      const iter = iteration && iteration.total > 1 ? c.dim(` [${iteration.index}/${iteration.total}]`) : "";
      stream.write(`  ${c.head(g.play)} ${c.bold(scenarioId)}${c.dim(` ${g.sep} ${stateId}`)}${iter}\n`);
    },

    phase({ title }) {
      if (!title) return;
      stream.write(`      ${c.dim(g.bullet)} ${c.dim(title)}\n`);
    },

    scenarioEnd({ scenarioId, stateId, iteration, status, skipReason }) {
      const key = entryKey(scenarioId, stateId, iteration);
      const dur = t0.has(key) ? fmtDuration(elapsedMs(t0.get(key))) : "—";
      t0.delete(key);
      const iter = iteration && iteration.total > 1 ? c.dim(` [${iteration.index}/${iteration.total}]`) : "";
      const { glyph, label } = classify(status, skipReason, c, g);
      const tail = skipReason ? c.dim(`  ${g.sep} ${skipReason}`) : c.dim(`  ${g.sep} ${dur}`);
      stream.write(`  ${glyph} ${c.bold(scenarioId)}${c.dim(` ${g.sep} ${stateId}`)}${iter}  ${label}${tail}\n`);
    },

    runFinish({ total, statuses }) {
      const dur = fmtDuration(elapsedMs(start));
      const counts = Object.entries(statuses ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join("  ");
      stream.write(`${c.head(g.arrow)} ${c.dim(`finished ${total} ${total === 1 ? "entry" : "entries"} in ${dur}`)}${counts ? c.dim(`  ${g.sep}  ${counts}`) : ""}\n`);
    },
  };
}

function classify(status, skipReason, c, g) {
  if (skipReason) return { glyph: c.dim(g.pause), label: c.dim("SKIP") };
  switch (String(status ?? "").toUpperCase()) {
    case "PASS":   return { glyph: c.ok(g.check),  label: c.ok("PASS") };
    case "FAIL":   return { glyph: c.err(g.cross), label: c.err("FAIL") };
    case "BLOCKED":return { glyph: c.warn(g.warn), label: c.warn("BLOCKED") };
    case "DRY-RUN":return { glyph: c.head(g.diamond), label: c.dim("DRY-RUN") };
    case "SKIP":   return { glyph: c.dim(g.pause), label: c.dim("SKIP") };
    default:       return { glyph: c.dim(g.bullet), label: c.dim(String(status ?? "?")) };
  }
}

function entryKey(scenarioId, stateId, iteration) {
  const ix = iteration ? `${iteration.index}/${iteration.total}` : "1";
  return `${scenarioId}::${stateId}::${ix}`;
}

const NOOP = {
  runStart() {},
  scenarioStart() {},
  phase() {},
  scenarioEnd() {},
  runFinish() {},
};
