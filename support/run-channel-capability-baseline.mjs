#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = parseArgs(process.argv.slice(2));
const openClawRepo = requiredArg(args, "openclaw-repo");
const artifactDir = requiredArg(args, "artifact-dir");
const timeoutMs = positiveInteger(args["timeout-ms"] ?? "120000", "timeout-ms");
const skipTests = args["skip-tests"] === true;
const artifactPath = join(artifactDir, "channel-capability-baseline.json");

const catalog = JSON.parse(await readFile(join(repoRoot, "channel-capabilities", "openclaw-message.json"), "utf8"));
const sourceLists = await readOpenClawCapabilitySourceLists(openClawRepo);
const catalogMatchesSource = compareCatalogToSource(catalog, sourceLists);
const contractTest = skipTests
  ? { status: 0, command: "skipped", stdout: "", stderr: "", durationMs: 0, skipped: true }
  : await runOpenClawContractTests(openClawRepo, timeoutMs);
const passed = catalogMatchesSource.ok && contractTest.status === 0;

const rows = catalog.capabilities.map((capability) => ({
  channelId: "openclaw",
  group: capability.group,
  capabilityId: capability.id,
  required: true,
  status: passed ? "passed" : "failed",
  proofMode: "baseline",
  summary: `OpenClaw baseline ${capability.group}/${capability.id}`,
  reason: passed ? null : failureReason(catalogMatchesSource, contractTest),
  ownerArea: "OpenClaw"
}));

const summary = {
  schemaVersion: "kova.channelCapabilityBaselineArtifact.v1",
  openClawRepo: resolve(openClawRepo),
  catalogId: catalog.id,
  catalogCapabilityCount: catalog.capabilities.length,
  sourceCapabilityCounts: Object.fromEntries(Object.entries(sourceLists).map(([key, values]) => [key, values.length])),
  catalogMatchesSource,
  contractTest: compactCommandResult(contractTest),
  capabilities: rows
};

await mkdir(artifactDir, { recursive: true });
await writeFile(artifactPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const output = {
  schemaVersion: "kova.channelCapabilityRun.v1",
  proofMode: "baseline",
  artifactPath,
  ownerArea: "OpenClaw",
  capabilities: rows.map((row) => ({
    ...row,
    artifactPath
  }))
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exit(passed ? 0 : 1);

async function readOpenClawCapabilitySourceLists(openClawRepoPath) {
  const typesPath = join(openClawRepoPath, "src", "channels", "message", "types.ts");
  const text = await readFile(typesPath, "utf8");
  return {
    "durable-final": kebabValues(extractConstArray(text, "durableFinalDeliveryCapabilities")),
    "live-preview": kebabValues(extractConstArray(text, "channelMessageLiveCapabilities")),
    "live-finalizer": kebabValues(extractConstArray(text, "livePreviewFinalizerCapabilities")),
    ack: kebabValues(extractConstArray(text, "channelMessageReceiveAckPolicies"))
  };
}

function compareCatalogToSource(catalogValue, sourceLists) {
  const byGroup = new Map();
  for (const capability of catalogValue.capabilities ?? []) {
    const values = byGroup.get(capability.group) ?? [];
    values.push(capability.id);
    byGroup.set(capability.group, values);
  }

  const groups = ["durable-final", "live-preview", "live-finalizer", "ack"];
  const mismatches = [];
  for (const group of groups) {
    const catalogValues = byGroup.get(group) ?? [];
    const sourceValues = sourceLists[group] ?? [];
    if (JSON.stringify(catalogValues) !== JSON.stringify(sourceValues)) {
      mismatches.push({ group, catalog: catalogValues, source: sourceValues });
    }
  }
  return {
    ok: mismatches.length === 0,
    mismatches
  };
}

function extractConstArray(text, name) {
  const pattern = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`);
  const match = pattern.exec(text);
  if (!match) {
    throw new Error(`could not find ${name} in OpenClaw channel message types`);
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

async function runOpenClawContractTests(openClawRepoPath, commandTimeoutMs) {
  return await runProcess("node", [
    "scripts/run-vitest.mjs",
    "run",
    "--config",
    "test/vitest/vitest.channels.config.ts",
    "src/channels/message/contracts.test.ts"
  ], { cwd: openClawRepoPath, timeoutMs: commandTimeoutMs });
}

function runProcess(command, values, options) {
  const startedAt = Date.now();
  return new Promise((resolvePromise) => {
    const child = spawn(command, values, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      resolvePromise({
        command: [command, ...values].join(" "),
        status: 124,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut: true
      });
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (status) => {
      if (settled) {
        return;
      }
      clearTimeout(timer);
      resolvePromise({
        command: [command, ...values].join(" "),
        status: status ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut: false
      });
    });
  });
}

function failureReason(catalogMatchesSourceResult, contractTestResult) {
  if (!catalogMatchesSourceResult.ok) {
    return `OpenClaw source declarations differ from Kova catalog for ${catalogMatchesSourceResult.mismatches.map((mismatch) => mismatch.group).join(", ")}`;
  }
  if (contractTestResult.timedOut) {
    return "OpenClaw channel message contract tests timed out";
  }
  return `OpenClaw channel message contract tests exited ${contractTestResult.status}`;
}

function compactCommandResult(result) {
  return {
    command: result.command,
    status: result.status,
    durationMs: result.durationMs,
    timedOut: result.timedOut === true,
    skipped: result.skipped === true,
    stdoutTail: tail(result.stdout ?? ""),
    stderrTail: tail(result.stderr ?? "")
  };
}

function tail(value) {
  return String(value).slice(-4000);
}

function kebabValues(values) {
  return values.map((value) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replaceAll("_", "-"));
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      throw new Error(`unexpected argument ${value}`);
    }
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function requiredArg(parsed, key) {
  const value = parsed[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`--${key} is required`);
  }
  return value;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`--${label} must be a positive integer`);
  }
  return number;
}
