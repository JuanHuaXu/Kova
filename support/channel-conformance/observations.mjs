import { expectedFinalDeliveries } from "./final-deliveries.mjs";

export async function waitForCaseObservations({
  workflowCase,
  platform,
  callCursor,
  readPlatformCalls,
  readProviderRequestCount,
  normalizeObservations,
  timeoutMs
}) {
  const startedAt = Date.now();
  const deadline = startedAt + caseTimeoutMs(workflowCase, timeoutMs);
  let latest = null;
  while (Date.now() < deadline) {
    const calls = await readPlatformCalls({ platform });
    latest = await normalizeObservations({
      workflowCase,
      platform,
      inbound: platform.currentInbound,
      calls: calls.slice(callCursor)
    });
    if (
      hasExpectedFinalDeliveries(workflowCase, latest) &&
      hasExpectedNativeActions(workflowCase, latest) &&
      hasExpectedLivePreviewProof(workflowCase, latest)
    ) {
      const finalCalls = await waitForQuietEvidence({
        platform,
        readPlatformCalls,
        readProviderRequestCount,
        callCursor,
        deadline,
        quietMs: caseQuietMs(workflowCase)
      });
      return await normalizeObservations({
        workflowCase,
        platform,
        inbound: platform.currentInbound,
        calls: finalCalls.calls
      });
    }
    await sleep(150);
  }
  return latest ?? await normalizeObservations({
    workflowCase,
    platform,
    inbound: platform.currentInbound,
    calls: []
  });
}

async function waitForQuietEvidence({
  platform,
  readPlatformCalls,
  readProviderRequestCount,
  callCursor,
  deadline,
  quietMs
}) {
  let latest = (await readPlatformCalls({ platform })).slice(callCursor);
  let latestCount = latest.length;
  let latestProviderCount = await optionalProviderRequestCount(readProviderRequestCount);
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    await sleep(150);
    latest = (await readPlatformCalls({ platform })).slice(callCursor);
    const providerCount = await optionalProviderRequestCount(readProviderRequestCount);
    if (latest.length !== latestCount || providerCount !== latestProviderCount) {
      latestCount = latest.length;
      latestProviderCount = providerCount;
      quietSince = Date.now();
      continue;
    }
    if (Date.now() - quietSince >= quietMs) {
      return { calls: latest, providerRequestCount: providerCount };
    }
  }
  return { calls: latest, providerRequestCount: latestProviderCount };
}

function hasExpectedLivePreviewProof(workflowCase, observations) {
  const expected = workflowCase.expects?.livePreview;
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return true;
  }
  const proof = observations?.livePreview && typeof observations.livePreview === "object" && !Array.isArray(observations.livePreview)
    ? observations.livePreview
    : {};
  if (expected.retainOnAmbiguousFailure === true && proof.retainedOnAmbiguousFailure !== true) {
    return false;
  }
  if (expected.finalizer === "final-edit" && Number(proof.finalEditCount ?? 0) <= 0) {
    return false;
  }
  if (expected.finalizer === "normal-fallback" && Number(proof.normalFallbackCount ?? 0) <= 0) {
    return false;
  }
  if (expected.previewFinalization === true && proof.previewFinalized !== true) {
    return false;
  }
  if (expected.progressUpdates === true && Number(proof.progressUpdateCount ?? 0) <= 0) {
    return false;
  }
  if (expected.draftPreview === true && Number(proof.draftPreviewCount ?? 0) <= 0) {
    return false;
  }
  return true;
}

function expectedVisibleDeliveryCount(workflowCase) {
  const value = workflowCase.expects?.visibleDeliveries;
  return Number.isInteger(value) ? value : 1;
}

function hasExpectedFinalDeliveries(workflowCase, observations) {
  return expectedFinalDeliveries(workflowCase, observations).length >= expectedVisibleDeliveryCount(workflowCase);
}

function hasExpectedNativeActions(workflowCase, observations) {
  const expected = workflowCase.expects?.nativeActions;
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return true;
  }
  const byAction = observations?.nativeCallSummary?.byAction && typeof observations.nativeCallSummary.byAction === "object"
    ? observations.nativeCallSummary.byAction
    : {};
  return Object.entries(expected)
    .every(([action, count]) => Number(byAction[action] ?? 0) >= Number(count));
}

function caseTimeoutMs(workflowCase, timeoutMs) {
  const value = workflowCase.expects?.asyncCompletionTimeoutMs;
  return Number.isInteger(value) ? Math.min(timeoutMs, value) : Math.min(timeoutMs, 30000);
}

function caseQuietMs(workflowCase) {
  const value = workflowCase.expects?.quietMs;
  if (Number.isInteger(value) && value >= 0) {
    return value;
  }
  return hasAsyncCompletionToolCalls(workflowCase) ? 3000 : 1000;
}

function hasAsyncCompletionToolCalls(workflowCase) {
  return Array.isArray(workflowCase.providerScript?.completionToolCalls) &&
    workflowCase.providerScript.completionToolCalls.length > 0;
}

async function optionalProviderRequestCount(readProviderRequestCount) {
  return typeof readProviderRequestCount === "function"
    ? await readProviderRequestCount()
    : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
