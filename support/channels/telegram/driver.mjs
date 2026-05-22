import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { normalizeTelegramObservations } from "./normalize.mjs";
import {
  TELEGRAM_TOKEN,
  telegramBotEchoUpdate,
  telegramInboundForCase
} from "./events.mjs";
import {
  enqueueTelegramUpdate,
  readTelegramPlatformCalls,
  startTelegramPlatform,
  stopTelegramPlatform
} from "./platform.mjs";

export const startPlatform = startTelegramPlatform;

export function configureOpenClaw({ repoRoot, envName, platform, timeoutMs }) {
  return runCommand("ocm", [
    "env",
    "exec",
    envName,
    "--",
    "node",
    join(repoRoot, "support/channels/telegram/configure-openclaw.mjs"),
    "--port-file",
    platform.portPath,
    "--token",
    TELEGRAM_TOKEN
  ], timeoutMs);
}

export function startOpenClaw({ repoRoot, envName, artifactDir, timeoutMs }) {
  const commandResults = [
    runCommand("ocm", ["service", "install", envName, "--json"], timeoutMs),
    runCommand("ocm", ["service", "start", envName, "--json"], timeoutMs),
    runCommand(process.execPath, [
      join(repoRoot, "support/ensure-gateway-running.mjs"),
      "--env",
      envName,
      "--artifact-dir",
      artifactDir,
      "--timeout-ms",
      String(Math.min(timeoutMs, 120000))
    ], timeoutMs)
  ];
  const failed = commandResults.find((result) => result.status !== 0);
  if (failed) {
    throw new Error(`telegram OpenClaw startup command failed: ${failed.command}`);
  }
  return { commandResults };
}

export async function enqueueUserEvent({ workflowCase, platform }) {
  const inbound = telegramInboundForCase(workflowCase);
  platform.currentInbound = inbound;
  await enqueueTelegramUpdate({ platform, update: inbound.native.update });
  return inbound;
}

export async function enqueueBotEcho({ workflowCase, platform, inbound, observations }) {
  await enqueueTelegramUpdate({
    platform,
    update: telegramBotEchoUpdate({ workflowCase, inbound, observations })
  });
}

export const readPlatformCalls = readTelegramPlatformCalls;

export async function normalizeObservations({ workflowCase, inbound, calls }) {
  return normalizeTelegramObservations({
    workflowCase,
    inbound,
    calls
  });
}

export const stopPlatform = stopTelegramPlatform;

function runCommand(command, args, timeoutMs) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    env: process.env
  });
  return {
    command: [command, ...args].join(" "),
    status: result.status ?? (result.error ? 1 : 0),
    signal: result.signal ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null
  };
}
