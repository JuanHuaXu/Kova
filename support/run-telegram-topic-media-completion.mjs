#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSupportArgs,
  prepareOpenClawRuntimeFromOcmEnv,
  readTimeoutMs
} from "./openclaw-runtime.mjs";

const args = parseSupportArgs(process.argv.slice(2));
const envName = requiredArg(args, "env");
const artifactDir = requiredArg(args, "artifact-dir");
const targetRepo = optionalArg(args, "target-repo");
const timeoutMs = readTimeoutMs(args["timeout-ms"], 30000);
const artifactPath = join(artifactDir, "telegram-topic-media-completion.json");
const supportDir = fileURLToPath(new URL(".", import.meta.url));

async function main() {
  let result;
  try {
    const runtimeContext = prepareOpenClawRuntimeFromOcmEnv(envName);
    const startedAt = Date.now();
    const proof = await runProof(runtimeContext);
    result = buildResult({
      runtimeContext,
      proof,
      error: null,
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    result = buildResult({
      runtimeContext: null,
      proof: null,
      error,
      durationMs: null
    });
  }

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(result.artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "kova.telegramTopicMediaCompletionRun.v1",
    ok: result.ok,
    artifactPath,
    envName,
    durationMs: result.artifact.durationMs,
    deliveryResult: result.artifact.proof?.sourceRunner?.deliveryResult ?? null,
    capturedAgentParams: compactAgentParams(result.artifact.proof?.sourceRunner?.capturedAgentParams),
    invariants: result.artifact.invariants
  }, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

async function runProof(runtimeContext) {
  if (!targetRepo) {
    throw new Error("Telegram topic media completion proof requires --target-repo from a local-build target");
  }
  const runnerPath = join(supportDir, "run-telegram-topic-media-completion-source.mjs");
  const stdout = execFileSync(process.execPath, [
    "--import",
    "tsx",
    runnerPath,
    "--target-repo",
    targetRepo,
    "--timeout-ms",
    String(timeoutMs)
  ], {
    cwd: targetRepo,
    encoding: "utf8",
    timeout: timeoutMs + 5000,
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    runtimeContext: compactRuntimeContext(runtimeContext),
    sourceRunner: JSON.parse(stdout)
  };
}

function buildResult({ runtimeContext, proof, error, durationMs }) {
  const runError = error instanceof Error ? error.message : error ? String(error) : null;
  const runner = proof?.sourceRunner;
  const params = runner?.capturedAgentParams;
  const invariants = [
    invariant("handoff-called-agent", runner?.capturedAgentCallCount === 1, "completion handoff called gateway agent once"),
    invariant("thread-id-stringified", params?.threadId === "1", "Telegram topic id was stringified before gateway agent handoff"),
    invariant("message-tool-only", params?.sourceReplyDeliveryMode === "message_tool_only", "generated media completion required message-tool delivery"),
    invariant("target-channel", params?.channel === "telegram" && params?.to === "telegram:-1003970070733", "completion handoff targeted the Telegram topic chat"),
    invariant("direct-delivery-accepted", runner?.deliveryResult?.delivered === true && runner?.deliveryResult?.path === "direct", "direct in-process gateway agent delivery evidence was accepted"),
    invariant("source-runner-ok", runner?.ok === true, "OpenClaw source-level regression runner completed successfully"),
    invariant("no-global-error", !runError && !runner?.error, "Telegram topic media completion proof completed without transport error")
  ];
  const ok = !runError && invariants.every((item) => item.status === "passed");
  return {
    ok,
    artifact: {
      schemaVersion: "kova.telegramTopicMediaCompletionArtifact.v1",
      runtimeContext: compactRuntimeContext(runtimeContext),
      timeoutMs,
      durationMs,
      error: runError,
      proof,
      invariants
    }
  };
}

function compactAgentParams(params) {
  if (!params || typeof params !== "object") {
    return null;
  }
  return {
    sessionKey: params.sessionKey ?? null,
    deliver: params.deliver ?? null,
    channel: params.channel ?? null,
    accountId: params.accountId ?? null,
    to: params.to ?? null,
    threadId: params.threadId ?? null,
    sourceReplyDeliveryMode: params.sourceReplyDeliveryMode ?? null,
    sourceTool: params.inputProvenance?.sourceTool ?? null
  };
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

function invariant(id, condition, summary) {
  return {
    id,
    status: condition ? "passed" : "failed",
    summary,
    reason: condition ? null : summary
  };
}

function requiredArg(source, name) {
  const value = source[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`--${name} is required`);
  }
  return value;
}

function optionalArg(source, name) {
  const value = source[name];
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`--${name} must be a non-empty value when provided`);
  }
  return value;
}

await main();
