import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { TELEGRAM_TOKEN } from "./events.mjs";

export async function startTelegramPlatform({ repoRoot, artifactDir, timeoutMs }) {
  const platformDir = join(artifactDir, "telegram-platform");
  await mkdir(platformDir, { recursive: true });
  const stdoutFd = openSync(join(platformDir, "server.log"), "a");
  const stderrFd = openSync(join(platformDir, "server.err"), "a");
  const child = spawn(process.execPath, [
    join(repoRoot, "support/channels/telegram/platform-shim.mjs"),
    "--dir", platformDir,
    "--token", TELEGRAM_TOKEN
  ], {
    stdio: ["ignore", stdoutFd, stderrFd],
    env: process.env
  });
  const portPath = join(platformDir, "port");
  const port = await waitForPortFile(portPath, timeoutMs);
  const apiRoot = `http://127.0.0.1:${port}`;
  await waitForHttpOk(`${apiRoot}/health`, timeoutMs);
  return {
    channelId: "telegram",
    artifactDir: platformDir,
    apiRoot,
    token: TELEGRAM_TOKEN,
    port,
    portPath,
    callsPath: join(platformDir, "calls.jsonl"),
    process: child,
    stdoutFd,
    stderrFd,
    repoRoot: null,
    envName: null,
    timeoutMs,
    currentInbound: null,
    driver: null
  };
}

export async function stopTelegramPlatform({ platform }) {
  if (platform?.process && !platform.process.killed) {
    platform.process.kill("SIGTERM");
  }
  closeFd(platform?.stdoutFd);
  closeFd(platform?.stderrFd);
}

export async function enqueueTelegramUpdate({ platform, update }) {
  await postJson(`${platform.apiRoot}/__kova/enqueue-update`, { update });
}

export async function readTelegramPlatformCalls({ platform }) {
  const result = await getJson(`${platform.apiRoot}/__kova/calls`);
  return Array.isArray(result.result) ? result.result : [];
}

async function waitForPortFile(path, waitMs) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    try {
      const raw = (await readFile(path, "utf8")).trim();
      const port = Number(raw);
      if (Number.isInteger(port) && port > 0 && port <= 65535) {
        return port;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error(`timed out waiting for Telegram shim port file ${path}`);
}

async function waitForHttpOk(url, waitMs) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}

function closeFd(fd) {
  if (typeof fd === "number") {
    try {
      closeSync(fd);
    } catch {}
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
