// TTY receipt for `kova setup`.

import {
  makeUi, heavyBand, ruleSection, card, sideBySide,
  badge, renderTable, repeat,
} from "../ui/index.mjs";

const TARGET_WIDTH_FOR_DASHBOARD = 100;

export function renderSetup(result, flags = {}, env = process.env, stream = process.stdout) {
  const ui = makeUi(flags, env, stream);
  const sections = [];
  const verdict = deriveVerdict(result);

  sections.push(heavyBand({
    badgeText: badge(verdict.label, verdict.tone, ui),
    status: verdict.status,
    title: "KOVA SETUP",
    meta: formatBandMeta(result, ui),
    width: ui.width,
    ui,
  }));
  sections.push("");
  sections.push(renderKpi(result, ui));

  sections.push("");
  sections.push(renderChecks(result, ui));

  if (result.auth) {
    sections.push("");
    sections.push(renderAuth(result.auth, ui));
  }

  if (Array.isArray(result.nextCommands) && result.nextCommands.length > 0) {
    sections.push("");
    sections.push(renderNext(result.nextCommands, ui));
  }
  return sections.join("\n");
}

function deriveVerdict(result) {
  if (result.ok) return { label: "READY", tone: "PASS", status: "PASS" };
  return { label: "BLOCKED", tone: "FAIL", status: "FAIL" };
}

function formatBandMeta(result, ui) {
  const sep = `  ${ui.g.sep}  `;
  const parts = [];
  if (result.mode) parts.push(`mode: ${result.mode}`);
  if (result.platform?.platform) parts.push(`platform: ${result.platform.platform}`);
  if (result.auth?.method) parts.push(`auth: ${result.auth.method}`);
  if (result.auth?.provider) parts.push(`provider: ${result.auth.provider}`);
  return parts.join(sep);
}

function renderKpi(result, ui) {
  const { c } = ui;
  const checks = result.checks ?? [];
  const pass = checks.filter((c) => c.status === "PASS").length;
  const fail = checks.filter((c) => c.status === "FAIL").length;
  const info = checks.filter((c) => c.status === "INFO" || c.status === "WARN").length;
  const cardWidth = computeCardWidth(ui, 4);

  return sideBySide([
    card({ title: "Total",  width: cardWidth, ui, lines: [c.bold(String(checks.length)), c.dim("checks")] }),
    card({ title: "Passed", width: cardWidth, ui, lines: [pass > 0 ? c.ok(c.bold(String(pass))) : c.dim("0"), c.dim("required")] }),
    card({ title: "Failed", width: cardWidth, ui, lines: [fail > 0 ? c.err(c.bold(String(fail))) : c.dim("0"), c.dim(fail === 0 ? "—" : "see below")] }),
    card({ title: "Info",   width: cardWidth, ui, lines: [c.bold(String(info)), c.dim("advisory")] }),
  ], { width: ui.width, gap: 2, minWidth: TARGET_WIDTH_FOR_DASHBOARD });
}

function renderChecks(result, ui) {
  const { c, g } = ui;
  const checks = result.checks ?? [];
  const lines = [ruleSection("checks", ui.width, ui)];
  const rows = checks.map((check) => {
    const status = String(check.status ?? "?").toUpperCase();
    let statusCol;
    if (status === "PASS")      statusCol = c.ok(status);
    else if (status === "FAIL") statusCol = c.err(status);
    else if (status === "WARN") statusCol = c.warn(status);
    else if (status === "INFO") statusCol = c.dim(status);
    else                        statusCol = c.dim(status);
    return {
      status: statusCol,
      id: c.bold(check.id ?? ""),
      detail: c.dim(check.message ?? check.path ?? ""),
    };
  });
  lines.push(indentBlock(renderTable({
    columns: [
      { key: "status", header: c.dim("status"), align: "left", minWidth: 6 },
      { key: "id",     header: c.dim("check"),  align: "left", minWidth: 22 },
      { key: "detail", header: c.dim("detail"), align: "left", minWidth: 24 },
    ],
    rows, gap: 2,
  }), 2));
  return lines.join("\n");
}

function renderAuth(auth, ui) {
  const { c, g } = ui;
  const lines = [ruleSection("auth", ui.width, ui)];
  lines.push(`  ${c.dim("provider")}     ${c.bold(auth.provider ?? "—")}${auth.envVar ? c.dim(`  ${g.sep} env ${auth.envVar}`) : ""}`);
  lines.push(`  ${c.dim("method")}       ${c.bold(auth.method ?? "—")}${auth.externalCli ? c.dim(`  ${g.sep} cli ${auth.externalCli}`) : ""}`);
  if (auth.verification) {
    const verified = auth.verification.verified === true;
    lines.push(`  ${c.dim("verified")}     ${verified ? c.ok("yes") : c.err("no")}${auth.verification.reason ? c.dim(`  ${g.sep} ${auth.verification.reason}`) : ""}`);
  }
  return lines.join("\n");
}

function renderNext(nextCommands, ui) {
  const { c, g } = ui;
  const lines = [ruleSection("next", ui.width, ui)];
  for (const cmd of nextCommands) {
    lines.push(`  ${c.head(g.arrow)} ${cmd}`);
  }
  return lines.join("\n");
}

function computeCardWidth(ui, n) {
  const stack = ui.width < TARGET_WIDTH_FOR_DASHBOARD;
  return stack ? Math.max(20, ui.width) : Math.max(20, Math.floor((ui.width - (n - 1) * 2) / n));
}

function indentBlock(text, n) {
  const pad = repeat(" ", n);
  return String(text).split("\n").map((line) => pad + line).join("\n");
}
