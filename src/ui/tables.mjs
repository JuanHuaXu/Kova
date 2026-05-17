// Lightweight columnar table renderer. Right-aligns numeric columns,
// left-aligns text. No borders; uses whitespace alignment.

import { padEnd, padStart, visualWidth, truncate } from "./text.mjs";

// renderTable({
//   columns: [
//     { key: "label", header: "metric", align: "left" },
//     { key: "value", header: "current", align: "right" },
//   ],
//   rows: [{ label: "...", value: "..." }, ...],
//   gap: 2,
//   maxWidth: 80,   // optional. If total row width exceeds this, shrinks
//                   // the widest shrinkable left-aligned column down to its
//                   // minWidth. Cells beyond their column width are truncated.
// })
export function renderTable({ columns, rows, gap = 2, maxWidth = null }) {
  const widths = columns.map((col) => {
    const header = col.header ?? "";
    const max = rows.reduce(
      (acc, row) => Math.max(acc, visualWidth(String(row[col.key] ?? ""))),
      visualWidth(String(header)),
    );
    return Math.max(max, col.minWidth ?? 0);
  });

  if (typeof maxWidth === "number" && maxWidth > 0) {
    fitWidths(columns, widths, gap, maxWidth);
  }

  const lines = [];
  const gapStr = " ".repeat(gap);

  if (columns.some((col) => col.header != null)) {
    lines.push(columns.map((col, i) => alignCell(col.header ?? "", widths[i], col.align)).join(gapStr).replace(/\s+$/, ""));
  }

  for (const row of rows) {
    lines.push(columns.map((col, i) => alignCell(String(row[col.key] ?? ""), widths[i], col.align)).join(gapStr).replace(/\s+$/, ""));
  }

  return lines.join("\n");
}

function fitWidths(columns, widths, gap, maxWidth) {
  const totalGap = Math.max(0, columns.length - 1) * gap;
  let total = widths.reduce((a, b) => a + b, 0) + totalGap;
  while (total > maxWidth) {
    // Find the most-overgrown left-aligned column (largest width above minWidth).
    let pick = -1;
    let bestSlack = 0;
    for (let i = 0; i < columns.length; i += 1) {
      if (columns[i].align === "right") continue;
      const slack = widths[i] - (columns[i].minWidth ?? 0);
      if (slack > bestSlack) { bestSlack = slack; pick = i; }
    }
    if (pick === -1) break;
    widths[pick] -= 1;
    total -= 1;
  }
}

function alignCell(text, width, align) {
  const truncated = visualWidth(text) > width ? truncate(text, width) : text;
  if (align === "right") return padStart(truncated, width);
  return padEnd(truncated, width);
}
