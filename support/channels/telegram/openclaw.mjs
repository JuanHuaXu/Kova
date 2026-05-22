import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { TELEGRAM_TOKEN } from "./events.mjs";

export function configureTelegramOpenClaw({ repoRoot, envName, platform, timeoutMs }) {
  platform.repoRoot = repoRoot;
  platform.envName = envName;
  platform.timeoutMs = timeoutMs;
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
    TELEGRAM_TOKEN,
    "--visible-replies",
    "automatic"
  ], timeoutMs);
}

export function configureTelegramOpenClawForCase({ platform, workflowCase }) {
  if (!platform?.repoRoot || !platform?.envName) {
    throw new Error("Telegram OpenClaw platform is not configured");
  }
  const visibleReplies =
    workflowCase.sourceReplyDeliveryMode === "message_tool_only" ? "message_tool" : "automatic";
  if (platform.visibleReplies === visibleReplies) {
    return { skipped: true, visibleReplies };
  }
  const result = runCommand("ocm", [
    "env",
    "exec",
    platform.envName,
    "--",
    "node",
    join(platform.repoRoot, "support/channels/telegram/configure-openclaw.mjs"),
    "--port-file",
    platform.portPath,
    "--token",
    TELEGRAM_TOKEN,
    "--visible-replies",
    visibleReplies
  ], platform.timeoutMs);
  if (result.status !== 0) {
    throw new Error(`telegram per-case OpenClaw configuration failed: ${result.command}`);
  }
  platform.visibleReplies = visibleReplies;
  return result;
}

export function startTelegramOpenClaw({ repoRoot, envName, artifactDir, timeoutMs }) {
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
