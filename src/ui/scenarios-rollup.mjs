// Scenarios roll-up. The top-level table that lists every scenario in
// the run with its verdict, sample count, and worst-metric headline.
//
// Single-run shape:
//
//   Scenarios                samples  verdict   worst metric
//     fresh-install          5/5      PASS      agent.turn.ms within budget
//     agent-cold-warm        5/5      FAIL      agent.turn.ms over by 240 ms
//
// Matrix shape adds a target column:
//
//   Scenarios                target   samples  verdict   worst metric
//     fresh-install          stable   5/5      PASS      —
//     fresh-install          canary   5/5      FAIL      health.startup over by 1.1 s
//
// When `collapseSharedTargets` is true and a scenario has the same
// verdict across all targets, the target column shows "both" / "all".

import { renderTable } from "./tables.mjs";
import { badge } from "./badges.mjs";

// scenariosRollup({ rows, matrix, ui }) -> string
//
//   rows (single-run):
//     [{ id, passed, total, verdict, worst, delta }]
//   rows (matrix):
//     [{ id, target, passed, total, verdict, worst, delta }]
//   delta is an optional pre-formatted string for compare mode (e.g. "+12%").
export function scenariosRollup({ rows, matrix = false, compare = false, ui } = {}) {
  if (!rows || rows.length === 0) return "";
  const c = ui.c;

  const shaped = rows.map((r) => {
    const passed = r.passed ?? 0;
    const total = r.total ?? passed;
    return {
      id:      c.bold(r.id),
      target:  r.target ? c.dim(r.target) : "—",
      samples: total > 0 ? `${passed}/${total}` : "—",
      verdict: r.verdict ? badge(r.verdict, r.verdict, ui) : c.dim("—"),
      worst:   r.worst ? formatWorst(r.worst, c) : c.dim("—"),
      delta:   r.delta ? colorDelta(r.delta, c) : c.dim("—"),
    };
  });

  const cols = [
    { key: "id",      header: c.dim("scenario"), align: "left",  minWidth: 20 },
  ];
  if (matrix) cols.push({ key: "target", header: c.dim("target"), align: "left", minWidth: 8 });
  cols.push(
    { key: "samples", header: c.dim("samples"), align: "right", minWidth: 7 },
    { key: "verdict", header: c.dim("verdict"), align: "left",  minWidth: 9 },
  );
  if (compare) cols.push({ key: "delta", header: c.dim("Δ"), align: "right", minWidth: 7 });
  cols.push({ key: "worst", header: c.dim("worst metric"), align: "left", minWidth: 0 });

  return renderTable({ columns: cols, rows: shaped, gap: 2, maxWidth: ui?.width ?? null });
}

function formatWorst(worst, c) {
  // worst can be a string or { label, note, tone }
  if (typeof worst === "string") return worst;
  const text = worst.label + (worst.note ? ` ${worst.note}` : "");
  if (worst.tone === "err") return c.err(text);
  if (worst.tone === "warn") return c.warn(text);
  if (worst.tone === "ok") return c.ok(text);
  return c.dim(text);
}

function colorDelta(text, c) {
  // Caller passes pre-formatted text. We just color based on leading sign.
  if (text.startsWith("+")) return c.neg(text);
  if (text.startsWith("-") || text.startsWith("−")) return c.pos(text);
  return c.dim(text);
}
