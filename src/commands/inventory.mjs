import { buildOpenClawInventoryPlan } from "../inventory/openclaw.mjs";
import { buildRepeatedWorkAudit } from "../audits/repeated-work.mjs";
import { renderInventoryPlan } from "../reporting/render-inventory.mjs";

export async function runInventoryCommand(flags) {
  const [subcommand = "plan"] = flags._;
  if (subcommand === "repeated-work") {
    const audit = await buildRepeatedWorkAudit();
    if (flags.json) {
      console.log(JSON.stringify(audit, null, 2));
      return;
    }
    renderRepeatedWorkPlain(audit);
    return;
  }

  if (subcommand !== "plan") {
    throw new Error(`unknown inventory command: ${subcommand}`);
  }

  const plan = await buildOpenClawInventoryPlan(flags);
  if (flags.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (!flags.plain) {
    console.log(renderInventoryPlan(plan, flags));
    return;
  }

  console.log("OpenClaw inventory plan");
  console.log(`Discovered: ${plan.coverage.discoveredCount}`);
  console.log(`Matched: ${plan.coverage.matchedCount}`);
  console.log(`Unmodeled: ${plan.coverage.unmodeledCount}`);
  for (const source of plan.sources) {
    console.log(`- ${source.id}: ${source.status}${formatSourceCount(source)}`);
  }
  if (plan.coverage.warnings.length > 0) {
    const warningLimit = positiveIntegerFlag(flags.max_warnings, 25);
    console.log(`Warnings${plan.coverage.warnings.length > warningLimit ? ` (first ${warningLimit} of ${plan.coverage.warnings.length})` : ""}:`);
    for (const warning of plan.coverage.warnings.slice(0, warningLimit)) {
      console.log(`- ${warning.message}`);
    }
  }
}

function renderRepeatedWorkPlain(audit) {
  console.log("Kova repeated work audit");
  console.log(`Scenarios: ${audit.scenarioCount}`);
  console.log(`Phases: ${audit.phaseCount}`);
  console.log("Profiles:");
  for (const [id, profile] of Object.entries(audit.profiles)) {
    console.log(`- ${id}: entries=${profile.entries}, phases=${profile.scenarioPhases}, minimum collectEnvMetrics=${profile.minimumCollectEnvMetrics}`);
  }
  console.log("Top duplicate commands:");
  for (const entry of audit.duplicateCommands.slice(0, 10)) {
    console.log(`- ${entry.count}x ${entry.command}`);
  }
  console.log("Explicit status/log evidence commands:");
  for (const entry of audit.explicitEvidenceCommands.slice(0, 10)) {
    console.log(`- ${entry.kind}: ${entry.scenario}/${entry.phaseId}`);
  }
}

function formatSourceCount(source) {
  if (source.id === "package-scripts" && typeof source.scriptCount === "number") {
    const included = source.includedScriptCount ?? source.scriptCount;
    return ` (${included}/${source.scriptCount} scripts, scope=${source.scriptScope ?? "unknown"})`;
  }
  const count = source.commandCount ?? source.capabilityCount ?? 0;
  return count ? ` (${count})` : "";
}

function positiveIntegerFlag(value, defaultValue) {
  if (value === undefined || value === null || value === false) {
    return defaultValue;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}
