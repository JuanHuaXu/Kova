export function isNoLogsOutput(output) {
  return /no logs exist for env\b/i.test(String(output ?? ""));
}

export function normalizeOptionalCommandResult(result) {
  if (!result || result.status === 0) {
    return result;
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (/^ocm\s+logs\s/.test(result.command ?? "") && isNoLogsOutput(output)) {
    result.optional = true;
    result.originalStatus = result.status;
    result.status = 0;
    result.note = "optional log collection found no env logs";
  }

  return result;
}
