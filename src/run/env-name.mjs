import { createHash } from "node:crypto";

const MAX_OCM_ENV_NAME_LENGTH = 63;
const RUN_SEGMENT_LENGTH = 25;
const HASH_LENGTH = 8;

export function envNameFor(scenarioId, stateId, runId, repeat = null) {
  const runSegment = safeSegment(runId).slice(-RUN_SEGMENT_LENGTH);
  const repeatSegment = repeat?.total > 1 ? `r${repeat.index}` : null;
  const readable = [scenarioId, stateId, repeatSegment].filter(Boolean).map(safeSegment).join("-");
  const hash = createHash("sha1")
    .update(JSON.stringify({ scenarioId, stateId: stateId ?? null, repeat: repeatSegment }))
    .digest("hex")
    .slice(0, HASH_LENGTH);
  const fixedLength = "kova-".length + "-".length + hash.length + "-".length + runSegment.length;
  const readableBudget = Math.max(3, MAX_OCM_ENV_NAME_LENGTH - fixedLength);
  const readableSegment = trimSegment(readable || "run", readableBudget);
  return `kova-${readableSegment}-${hash}-${runSegment}`;
}

export function maxOcmEnvNameLength() {
  return MAX_OCM_ENV_NAME_LENGTH;
}

function safeSegment(value) {
  const segment = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return segment || "x";
}

function trimSegment(value, maxLength) {
  const trimmed = String(value).slice(0, maxLength).replace(/-+$/g, "");
  return trimmed || "run";
}
