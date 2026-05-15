export const EVIDENCE_LEDGER_SCHEMA = "kova.evidenceLedger.v1";

export function attachEvidenceLedger(record) {
  record.evidenceLedger = buildEvidenceLedger(record);
  return record;
}

export function buildEvidenceLedger(record) {
  const entries = [];
  for (const phase of record.phases ?? []) {
    const commands = phase.commands ?? [];
    const results = phase.results ?? [];
    for (const [index, command] of commands.entries()) {
      const result = results[index] ?? null;
      entries.push(commandEntry({ record, phase, index, command, result }));
    }
  }

  return {
    schemaVersion: EVIDENCE_LEDGER_SCHEMA,
    completeness: "not-evaluated",
    summary: summarizeEntries(entries),
    entries
  };
}

function commandEntry({ record, phase, index, command, result }) {
  const executed = record.status !== "DRY-RUN";
  const status = commandStatus({ executed, result });
  return {
    id: `command:${phase.id}:${index + 1}`,
    category: "command",
    required: true,
    status,
    phaseId: phase.id,
    commandIndex: index,
    summary: summarizeCommand(command),
    artifactPath: null,
    reason: commandReason({ executed, result, status })
  };
}

function commandStatus({ executed, result }) {
  if (!executed) {
    return "skipped";
  }
  if (!result) {
    return "missing";
  }
  return result.status === 0 ? "passed" : "failed";
}

function commandReason({ executed, result, status }) {
  if (!executed) {
    return "dry-run command was planned but not executed";
  }
  if (status === "missing") {
    return "command was planned but no result was recorded";
  }
  if (status === "failed") {
    if (result?.timedOut) {
      return "command timed out";
    }
    return `command exited ${result?.status ?? "unknown"}`;
  }
  return null;
}

function summarizeEntries(entries) {
  const byStatus = {};
  const byCategory = {};
  let required = 0;
  let requiredMissing = 0;
  let requiredFailed = 0;
  for (const entry of entries) {
    byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
    byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
    if (entry.required) {
      required += 1;
      if (entry.status === "missing") {
        requiredMissing += 1;
      }
      if (entry.status === "failed") {
        requiredFailed += 1;
      }
    }
  }
  return {
    total: entries.length,
    required,
    requiredMissing,
    requiredFailed,
    byStatus,
    byCategory
  };
}

function summarizeCommand(command) {
  if (typeof command !== "string") {
    return "unknown command";
  }
  return command.length <= 160 ? command : `${command.slice(0, 157)}...`;
}
