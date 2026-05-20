#!/usr/bin/env node
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const args = parseArgs(process.argv.slice(2));
const targetRepo = requiredArg(args, "target-repo");
const timeoutMs = readTimeoutMs(args["timeout-ms"], 30000);

async function main() {
  const startedAt = Date.now();
  let result;
  try {
    result = {
      ok: true,
      durationMs: Date.now() - startedAt,
      ...(await runProof())
    };
  } catch (error) {
    result = {
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function runProof() {
  const modulePath = join(targetRepo, "src", "agents", "subagent-announce-delivery.ts");
  const mod = await import(pathToFileURL(modulePath).href);
  if (!mod.__testing?.setDepsForTest || typeof mod.deliverSubagentAnnouncement !== "function") {
    throw new Error("OpenClaw subagent announcement delivery test contract is unavailable");
  }

  const capturedAgentCalls = [];
  const mediaUrl = "/tmp/kova-generated-corgi.mp4";
  const requesterSessionKey = "agent:main:telegram:group:-1003970070733:topic:1";

  mod.__testing.setDepsForTest({
    callGateway: async (request) => {
      capturedAgentCalls.push(request);
      if (request?.method !== "agent") {
        throw new Error(`unexpected gateway method: ${request?.method}`);
      }
      const agentParams = request.params;
      if (typeof agentParams?.threadId !== "string") {
        throw new Error("invalid agent params: at /threadId: must be string");
      }
      return {
        payloads: [],
        didSendViaMessagingTool: true,
        messagingToolSentMediaUrls: [mediaUrl],
        messagingToolSentTargets: [
          {
            channel: "telegram",
            to: "telegram:-1003970070733",
            threadId: agentParams.threadId,
            mediaUrls: [mediaUrl]
          }
        ]
      };
    },
    getRuntimeConfig: () => ({
      agents: {
        defaults: {
          subagents: {
            announceTimeoutMs: timeoutMs
          }
        }
      }
    }),
    getRequesterSessionActivity: () => ({
      sessionId: "requester-session-telegram",
      isActive: false
    }),
    queueEmbeddedPiMessageWithOutcome: () => ({
      queued: false,
      reason: "no_active_session"
    })
  });

  try {
    const origin = {
      channel: "telegram",
      to: "telegram:-1003970070733",
      accountId: "bot-1",
      threadId: 1
    };
    const deliveryResult = await mod.deliverSubagentAnnouncement({
      requesterSessionKey,
      targetRequesterSessionKey: requesterSessionKey,
      triggerMessage: "child done",
      steerMessage: "child done",
      requesterOrigin: origin,
      requesterSessionOrigin: origin,
      completionDirectOrigin: origin,
      directOrigin: origin,
      sourceTool: "video_generate",
      requesterIsSubagent: false,
      expectsCompletionMessage: true,
      bestEffortDeliver: true,
      directIdempotencyKey: "kova-telegram-topic-media-completion",
      internalEvents: [
        {
          type: "task_completion",
          source: "video_generation",
          childSessionKey: "video_generate:kova-task-123",
          childSessionId: "kova-task-123",
          announceType: "video generation task",
          taskLabel: "kova telegram topic video",
          status: "ok",
          statusLabel: "completed successfully",
          result: `Generated 1 video.\nMEDIA:${mediaUrl}`,
          mediaUrls: [mediaUrl],
          replyInstruction: "Deliver the generated video through the message tool."
        }
      ]
    });

    return {
      requesterSessionKey,
      deliveryResult,
      capturedAgentParams: capturedAgentCalls[0]?.params ?? null,
      capturedAgentCallCount: capturedAgentCalls.length,
      mediaUrl
    };
  } finally {
    mod.__testing.setDepsForTest();
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      throw new Error(`unexpected argument: ${arg}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    parsed[arg.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function requiredArg(source, name) {
  const value = source[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`--${name} is required`);
  }
  return value;
}

function readTimeoutMs(value, fallbackMs) {
  if (value === undefined) {
    return fallbackMs;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid timeout: ${value}`);
  }
  return parsed;
}

await main();
