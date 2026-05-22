import { normalizeTelegramObservations } from "./normalize.mjs";
import {
  telegramBotEchoUpdate,
  telegramInboundForCase
} from "./events.mjs";
import {
  configureTelegramOpenClawForCase,
  configureTelegramOpenClaw,
  startTelegramOpenClaw
} from "./openclaw.mjs";
import {
  enqueueTelegramUpdate,
  readTelegramPlatformCalls,
  startTelegramPlatform,
  stopTelegramPlatform
} from "./platform.mjs";

export const startPlatform = startTelegramPlatform;
export const configureOpenClaw = configureTelegramOpenClaw;
export const startOpenClaw = startTelegramOpenClaw;

export function canDriveWorkflowCase() {
  return { supported: true, reason: null };
}

export async function enqueueUserEvent({ workflowCase, platform }) {
  configureTelegramOpenClawForCase({ platform, workflowCase });
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
