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
// })
export function renderTable({ columns, rows, gap = 2 }) {
  const widths = columns.map((col) => {
    const header = col.header ?? "";
    const max = rows.reduce(
      (acc, row) => Math.max(acc, visualWidth(String(row[col.key] ?? ""))),
      visualWidth(String(header)),
    );
    return Math.max(max, col.minWidth ?? 0);
  });

  const lines = [];
  const gapStr = " ".repeat(gap);

  if (columns.some((col) => col.header != null)) {
    lines.push(columns.map((col, i) => alignCell(col.header ?? "", widths[i], col.align)).join(gapStr));
  }

  for (const row of rows) {
    lines.push(columns.map((col, i) => alignCell(String(row[col.key] ?? ""), widths[i], col.align)).join(gapStr));
  }

  return lines.join("\n");
}

function alignCell(text, width, align) {
  const truncated = visualWidth(text) > width ? truncate(text, width) : text;
  if (align === "right") return padStart(truncated, width);
  return padEnd(truncated, width);
}
