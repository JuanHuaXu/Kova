export const RECORD_STATUS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  INCOMPLETE: "INCOMPLETE",
  BLOCKED: "BLOCKED",
  SKIPPED: "SKIPPED",
  DRY_RUN: "DRY-RUN"
});

export const NON_PASSING_EXECUTION_STATUSES = new Set([
  RECORD_STATUS.FAIL,
  RECORD_STATUS.INCOMPLETE,
  RECORD_STATUS.BLOCKED
]);

export function isNonPassingExecutionStatus(status) {
  return NON_PASSING_EXECUTION_STATUSES.has(status);
}

export function findingSeverityForStatus(status) {
  if (status === RECORD_STATUS.BLOCKED) {
    return "blocked";
  }
  if (status === RECORD_STATUS.INCOMPLETE) {
    return "incomplete";
  }
  return "fail";
}
