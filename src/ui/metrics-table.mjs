// Metrics table with three column variants, auto-selected by sample count.
//
//   Single sample (n === 1):
//     metric                              value      threshold   status
//   Few samples (1 < n < 20):
//     metric                  median  ±σ  max        threshold   status
//   Many samples (n ≥ 20):
//     metric                  median  ±σ  p95  max   threshold   status
//
// Compare variant (when `compare: true`):
//     metric                  baseline   current   Δ      threshold   status
//
// Inputs are pre-shaped rows. Callers do the aggregation; this module
// owns only column choice, formatting, and color.

import { renderTable } from "./tables.mjs";
import { formatNumber, formatPercent } from "./format.mjs";

const MANY_SAMPLES = 20;

// metricsTable({ rows, sampleCount, compare, ui, gap }) -> string
//
//   row shape (single-run):
//     {
//       label,      // metric id, e.g. "agent.turn.ms"
//       unit,       // optional, e.g. "ms" — suffixed in formatted cells
//       direction,  // "lower-better" (default) | "higher-better"
//       value,      // single-sample value, OR null when using stats
//       stats,      // { median, stdev, p95, max } when n > 1
//       threshold,  // optional numeric threshold
//       status,     // "PASS" | "FAIL" | "WARN" | "—"
//       headroom,   // optional numeric percent (negative = over)
//     }
//
//   row shape (compare):
//     {
//       label, unit, direction,
//       baseline,  // numeric
//       current,   // numeric
//       delta,     // percent (signed); null when N/A
//       threshold, status,
//     }
export function metricsTable({ rows, sampleCount = 1, compare = false, ui, gap = 3 } = {}) {
  if (!rows || rows.length === 0) return "";
  const c = ui.c;
  const cols = compare
    ? compareColumns(c)
    : sampleCount >= MANY_SAMPLES
      ? manySampleColumns(c)
      : sampleCount > 1
        ? fewSampleColumns(c)
        : singleSampleColumns(c);
  const shaped = rows.map((r) => compare ? shapeCompareRow(r, ui) : shapeRow(r, sampleCount, ui));
  return renderTable({ columns: cols, rows: shaped, gap });
}

export { MANY_SAMPLES };

// ----- column sets -----

function singleSampleColumns(c) {
  return [
    { key: "label",     header: c.dim("metric"),    align: "left",  minWidth: 24 },
    { key: "value",     header: c.dim("value"),     align: "right", minWidth: 10 },
    { key: "threshold", header: c.dim("threshold"), align: "right", minWidth: 10 },
    { key: "status",    header: c.dim("status"),    align: "left",  minWidth: 8 },
  ];
}

function fewSampleColumns(c) {
  return [
    { key: "label",     header: c.dim("metric"),    align: "left",  minWidth: 24 },
    { key: "median",    header: c.dim("median"),    align: "right", minWidth: 9 },
    { key: "stdev",     header: c.dim("±σ"),        align: "right", minWidth: 7 },
    { key: "max",       header: c.dim("max"),       align: "right", minWidth: 9 },
    { key: "threshold", header: c.dim("threshold"), align: "right", minWidth: 10 },
    { key: "status",    header: c.dim("status"),    align: "left",  minWidth: 8 },
  ];
}

function manySampleColumns(c) {
  return [
    { key: "label",     header: c.dim("metric"),    align: "left",  minWidth: 24 },
    { key: "median",    header: c.dim("median"),    align: "right", minWidth: 9 },
    { key: "stdev",     header: c.dim("±σ"),        align: "right", minWidth: 7 },
    { key: "p95",       header: c.dim("p95"),       align: "right", minWidth: 9 },
    { key: "max",       header: c.dim("max"),       align: "right", minWidth: 9 },
    { key: "threshold", header: c.dim("threshold"), align: "right", minWidth: 10 },
    { key: "status",    header: c.dim("status"),    align: "left",  minWidth: 8 },
  ];
}

function compareColumns(c) {
  return [
    { key: "label",     header: c.dim("metric"),    align: "left",  minWidth: 24 },
    { key: "baseline",  header: c.dim("baseline"),  align: "right", minWidth: 10 },
    { key: "current",   header: c.dim("current"),   align: "right", minWidth: 10 },
    { key: "delta",     header: c.dim("Δ"),         align: "right", minWidth: 8 },
    { key: "threshold", header: c.dim("threshold"), align: "right", minWidth: 10 },
    { key: "status",    header: c.dim("status"),    align: "left",  minWidth: 8 },
  ];
}

// ----- row shaping -----

function shapeRow(r, sampleCount, ui) {
  const c = ui.c;
  const unit = r.unit ? ` ${r.unit}` : "";
  const fmt = (v) => v == null ? "—" : formatNumber(v) + unit;
  const status = colorStatus(c, r.status);
  if (sampleCount === 1) {
    return {
      label:     c.bold(r.label),
      value:     fmt(r.value),
      threshold: fmt(r.threshold),
      status,
    };
  }
  const s = r.stats ?? {};
  return {
    label:     c.bold(r.label),
    median:    fmt(s.median),
    stdev:     s.stdev == null ? "—" : "±" + formatNumber(s.stdev) + unit,
    p95:       fmt(s.p95),
    max:       fmt(s.max),
    threshold: fmt(r.threshold),
    status,
  };
}

function shapeCompareRow(r, ui) {
  const c = ui.c;
  const unit = r.unit ? ` ${r.unit}` : "";
  const fmt = (v) => v == null ? "—" : formatNumber(v) + unit;
  return {
    label:     c.bold(r.label),
    baseline:  fmt(r.baseline),
    current:   fmt(r.current),
    delta:     formatDelta(r.delta, r.direction, c),
    threshold: fmt(r.threshold),
    status:    colorStatus(c, r.status),
  };
}

function formatDelta(delta, direction = "lower-better", c) {
  if (delta == null) return c.dim("—");
  const text = formatPercent(delta, { withSign: true });
  const better = direction === "lower-better" ? delta < 0 : delta > 0;
  const worse  = direction === "lower-better" ? delta > 0 : delta < 0;
  if (better) return c.pos(text);
  if (worse) return c.neg(text);
  return c.dim(text);
}

function colorStatus(c, status) {
  if (!status) return c.dim("—");
  const upper = String(status).toUpperCase();
  if (upper === "PASS" || upper === "OK") return c.ok(upper);
  if (upper === "FAIL" || upper === "OVER") return c.err(upper);
  if (upper === "WARN" || upper === "WATCH") return c.warn(upper);
  return c.dim(upper);
}
