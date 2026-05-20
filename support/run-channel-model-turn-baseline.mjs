#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  openDirectGatewayRpcClient,
  parseSupportArgs,
  prepareOpenClawRuntimeFromOcmEnv,
  readTimeoutMs
} from "./openclaw-runtime.mjs";

const args = parseSupportArgs(process.argv.slice(2));
const envName = requiredArg(args, "env");
const artifactDir = requiredArg(args, "artifact-dir");
const timeoutMs = readTimeoutMs(args["timeout-ms"], 120000);
const message = args.message ?? "Reply with exact ASCII text KOVA_AGENT_OK only.";
const expectedText = args["expected-text"] ?? null;
const modelTurnCase = args.case ?? "all";
const includeSharedBaseline = args["skip-shared-baseline"] !== "true";
const continueOnModelTurnFailure = args["continue-on-model-turn-failure"] === "true";
const providerRequestPolicyOverride = parseProviderRequestPolicyArg(args["provider-request-policy"]);
const artifactPath = join(artifactDir, `channel-model-turn-baseline-${safeArtifactSegment(modelTurnCase)}.json`);
const providerRequestLogPath = join(artifactDir, "mock-openai", "requests.jsonl");

async function main() {
  let result;
  let clientHandle = null;
  const providerRequestCountBefore = await countJsonl(providerRequestLogPath);
  try {
    const runtimeContext = prepareOpenClawRuntimeFromOcmEnv(envName);
    clientHandle = await openDirectGatewayRpcClient(runtimeContext);
    if (!clientHandle.client) {
      throw new Error(`gateway direct RPC unavailable: ${clientHandle.fallbackReason ?? "unknown"}`);
    }
    await waitForBaselineChannel(clientHandle.client, timeoutMs);
    const activeStartedAtEpochMs = Date.now();
    const params = { message, case: modelTurnCase, includeSharedBaseline };
    if (expectedText) {
      params.expectedText = expectedText;
    }
    const turn = await clientHandle.client.request(
      "kova.channelBaseline.runModelTurn",
      params,
      { timeoutMs }
    );
    const activeFinishedAtEpochMs = Date.now();
    const providerRequestCountAfter = await countJsonl(providerRequestLogPath);
    const providerRequestScopedCount = await countScopedProviderRequests(providerRequestLogPath, turn?.modelTurnCases);
    result = buildResult({
      runtimeContext,
      turn,
      error: null,
      activeStartedAtEpochMs,
      activeFinishedAtEpochMs,
      providerRequestCountBefore,
      providerRequestCountAfter,
      providerRequestScopedCount,
      timeoutMs
    });
  } catch (error) {
    const providerRequestCountAfter = await countJsonl(providerRequestLogPath);
    result = buildResult({
      runtimeContext: null,
      turn: null,
      error,
      providerRequestCountBefore,
      providerRequestCountAfter,
      timeoutMs
    });
  } finally {
    clientHandle?.client?.close?.();
  }

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(result.artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "kova.channelModelTurnRun.v1",
    ok: result.ok,
    artifactPath,
    ownerArea: "OpenClaw",
    envName,
    case: modelTurnCase,
    expectedText: result.artifact.turn?.expectedText ?? expectedText,
    sharedBaselineIncluded: result.artifact.turn?.sharedBaselineIncluded ?? null,
    finalText: result.artifact.turn?.finalText ?? null,
    inboundEventId: result.artifact.turn?.modelTurnCases?.[0]?.inboundEvent?.id ?? result.artifact.turn?.inboundEvent?.id ?? null,
    routeSessionKey: result.artifact.turn?.modelTurnCases?.[0]?.routeSessionKey ?? result.artifact.turn?.routeSessionKey ?? null,
    modelTurnCaseCount: result.artifact.turn?.modelTurnCases?.length ?? null,
    failedModelTurnCases: summarizeFailedModelTurnCases(result.artifact.turn?.modelTurnCases),
    capabilityRowCount: result.artifact.turn?.capabilityRows?.length ?? null,
    activeStartedAtEpochMs: result.artifact.activeStartedAtEpochMs,
    activeFinishedAtEpochMs: result.artifact.activeFinishedAtEpochMs,
    activeTurnMs: result.artifact.activeTurnMs,
    providerRequestDelta: result.artifact.providerRequestDelta,
    providerRequestScopedCount: result.artifact.providerRequestScopedCount,
    providerRequestObserved: result.artifact.providerRequestObserved,
    providerRequestScope: result.artifact.providerRequestScope,
    providerRequestPolicy: result.artifact.providerRequestPolicy,
    invariants: result.artifact.invariants
  }, null, 2)}\n`);
  process.exit(result.ok || continueOnModelTurnFailure ? 0 : 1);
}

async function waitForBaselineChannel(client, commandTimeoutMs) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < commandTimeoutMs) {
    try {
      const status = await client.request("kova.channelBaseline.status", {}, { timeoutMs: 5000 });
      if (status?.ok === true) {
        return status;
      }
      lastError = new Error("kova channel baseline plugin registered but channel runtime is not started");
    } catch (error) {
      lastError = error;
    }
    await sleep(1000);
  }
  throw lastError ?? new Error("timed out waiting for kova channel baseline runtime");
}

function buildResult({
  runtimeContext,
  turn,
  error,
  providerRequestCountBefore,
  providerRequestCountAfter,
  providerRequestScopedCount,
  activeStartedAtEpochMs = null,
  activeFinishedAtEpochMs = null,
  timeoutMs: commandTimeoutMs
}) {
  const runError = error ? error.message : turn?.error ?? null;
  const providerRequestDelta = Math.max(0, providerRequestCountAfter - providerRequestCountBefore);
  const providerRequestObserved = Number.isInteger(providerRequestScopedCount) ? providerRequestScopedCount : providerRequestDelta;
  const providerRequestPolicy = providerRequestPolicyOverride ?? resolveProviderRequestPolicy(turn?.modelTurnCases);
  const activeTurnMs = activeStartedAtEpochMs === null || activeFinishedAtEpochMs === null
    ? null
    : Math.max(0, activeFinishedAtEpochMs - activeStartedAtEpochMs);
  const invariants = [
    ...(turn?.invariants ?? []),
    providerRequestInvariant(providerRequestPolicy, providerRequestObserved, runError),
    invariant("no-global-error", !runError, "channel model turn completed without transport or plugin error")
  ];
  const ok = !runError && turn?.ok === true && invariants.every((item) => item.status === "passed");

  return {
    ok,
    artifact: {
      schemaVersion: "kova.channelModelTurnBaselineArtifact.v1",
      runtimeContext: compactRuntimeContext(runtimeContext),
      timeoutMs: commandTimeoutMs,
      message,
      case: modelTurnCase,
      expectedText: turn?.expectedText ?? expectedText,
      error: runError,
      providerRequestLogPath,
      providerRequestCountBefore,
      providerRequestCountAfter,
      providerRequestDelta,
      providerRequestScopedCount,
      providerRequestObserved,
      providerRequestScope: Number.isInteger(providerRequestScopedCount) ? "kova-inbound-event" : "before-after-delta",
      providerRequestPolicy,
      activeStartedAtEpochMs,
      activeFinishedAtEpochMs,
      activeTurnMs,
      turn,
      invariants
    }
  };
}

function resolveProviderRequestPolicy(cases) {
  if (!Array.isArray(cases) || cases.length === 0) {
    return { mode: "observe", reason: "no completed model-turn cases declared a provider request policy" };
  }
  const policies = cases.map((testCase) => normalizeProviderRequestPolicy(testCase?.providerRequests));
  if (policies.every((policy) => policy.mode === "exact")) {
    return {
      mode: "exact",
      expected: policies.reduce((total, policy) => total + policy.expected, 0),
      source: "model-turn-cases"
    };
  }
  if (policies.every((policy) => policy.mode === "minimum")) {
    return {
      mode: "minimum",
      min: policies.reduce((total, policy) => total + policy.min, 0),
      source: "model-turn-cases"
    };
  }
  return {
    mode: "observe",
    reason: "mixed or observational provider request policies; provider request count is recorded but not a failure gate"
  };
}

function parseProviderRequestPolicyArg(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const text = String(value).trim();
  if (text === "observe") {
    return { mode: "observe", source: "cli" };
  }
  const exact = text.match(/^exact:(\d+)$/);
  if (exact) {
    return { mode: "exact", expected: Number(exact[1]), source: "cli" };
  }
  const minimum = text.match(/^(?:minimum|min):(\d+)$/);
  if (minimum) {
    return { mode: "minimum", min: Number(minimum[1]), source: "cli" };
  }
  throw new Error(`unsupported provider request policy '${text}'; expected observe, exact:<count>, or min:<count>`);
}

function normalizeProviderRequestPolicy(value) {
  if (value?.mode === "exact" && Number.isInteger(value.expected) && value.expected >= 0) {
    return { mode: "exact", expected: value.expected };
  }
  if ((value?.mode === "minimum" || value?.mode === "min") && Number.isInteger(value.min) && value.min >= 0) {
    return { mode: "minimum", min: value.min };
  }
  if (value?.mode === "observe") {
    return { mode: "observe" };
  }
  return { mode: "observe" };
}

function providerRequestInvariant(policy, observed, runError) {
  if (policy?.mode === "exact") {
    return invariant(
      "provider-request-count",
      !runError && observed === policy.expected,
      `channel model turn made exactly ${policy.expected} mock provider request${policy.expected === 1 ? "" : "s"}; observed ${observed}`
    );
  }
  if (policy?.mode === "minimum") {
    return invariant(
      "provider-request-count",
      !runError && observed >= policy.min,
      `channel model turn made at least ${policy.min} mock provider request${policy.min === 1 ? "" : "s"}; observed ${observed}`
    );
  }
  return invariant(
    "provider-request-count-observed",
    true,
    `channel model turn provider request count observed without gating; observed ${observed}`
  );
}

function safeArtifactSegment(value) {
  return String(value ?? "all").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function compactRuntimeContext(context) {
  if (!context) {
    return null;
  }
  return {
    source: "ocm-env",
    envName: context.envName ?? null,
    packageRoot: context.packageRoot,
    runtime: context.runtime ?? null
  };
}

function summarizeFailedModelTurnCases(cases) {
  if (!Array.isArray(cases)) {
    return [];
  }
  return cases
    .filter((testCase) => testCase?.status !== "passed")
    .map((testCase) => ({
      id: testCase.id ?? null,
      reason: testCase.reason ?? null,
      failedInvariants: Array.isArray(testCase.invariants)
        ? testCase.invariants
            .filter((invariant) => invariant?.status !== "passed")
            .map((invariant) => ({
              id: invariant.id ?? null,
              reason: invariant.reason ?? invariant.summary ?? null
            }))
        : []
    }));
}

async function countJsonl(path) {
  try {
    const text = await readFile(path, "utf8");
    return text.split("\n").filter((line) => line.trim().length > 0).length;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

async function countScopedProviderRequests(path, cases) {
  const inboundEventIds = new Set(
    Array.isArray(cases)
      ? cases
          .map((testCase) => testCase?.inboundEvent?.id)
          .filter((id) => typeof id === "string" && id.length > 0)
      : []
  );
  if (inboundEventIds.size === 0) {
    return null;
  }
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
  let count = 0;
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const entryInboundIds = Array.isArray(entry?.kova?.inboundEventIds) ? entry.kova.inboundEventIds : [];
    if (entryInboundIds.some((id) => inboundEventIds.has(id))) {
      count += 1;
    }
  }
  return count;
}

function invariant(id, condition, summary) {
  return {
    id,
    status: condition ? "passed" : "failed",
    summary,
    reason: condition ? null : summary
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requiredArg(parsed, key) {
  const value = parsed[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`--${key} is required`);
  }
  return value;
}

await main();
