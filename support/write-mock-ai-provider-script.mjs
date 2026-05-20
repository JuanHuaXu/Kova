#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const options = parseArgs(process.argv.slice(2));
if (!options.output) {
  throw new Error("--output is required");
}

const providerScript = scriptForMode(options);
mkdirSync(dirname(options.output), { recursive: true });
writeFileSync(options.output, `${JSON.stringify(providerScript, null, 2)}\n`, "utf8");

function scriptForMode(options) {
  const marker = options.marker ?? "KOVA_AGENT_OK";
  const mode = options.mode ?? "normal";
  const delayMs = nonNegativeInteger(options.delayMs, "delayMs") ?? 1000;
  const stallMs = nonNegativeInteger(options.stallMs, "stallMs") ?? 65000;
  const errorStatus = nonNegativeInteger(options.errorStatus, "errorStatus") ?? 503;
  const final = { type: "final-text", text: marker };

  if (mode === "normal") {
    return makeScript(mode, [{ id: "kova-normal-final", respond: final }]);
  }
  if (mode === "slow" || mode === "concurrent-pressure") {
    return makeScript(mode, [{
      id: `kova-${mode}-delay`,
      respond: {
        type: "delay",
        ms: delayMs,
        then: final
      }
    }]);
  }
  if (mode === "timeout" || mode === "streaming-stall") {
    return makeScript(mode, [{
      id: `kova-${mode}-timeout`,
      respond: {
        type: "timeout",
        ms: stallMs
      }
    }]);
  }
  if (mode === "malformed") {
    return makeScript(mode, [{
      id: "kova-malformed-response",
      respond: {
        type: "malformed",
        status: 200,
        contentType: "application/json",
        body: "{this-is-not-json"
      }
    }]);
  }
  if (mode === "error-then-recover") {
    return makeScript(mode, [
      {
        id: "kova-error-then-recover-error",
        respond: {
          type: "error",
          status: errorStatus,
          message: "mock provider transient failure",
          errorType: "provider-error",
          code: "kova_mock_provider_error"
        }
      },
      {
        id: "kova-error-then-recover-final",
        respond: final
      }
    ]);
  }
  throw new Error(`unsupported mock provider mode '${mode}'`);
}

function makeScript(id, steps) {
  return { id: `kova-${id}`, steps };
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      throw new Error(`unexpected argument: ${arg}`);
    }
    const key = arg.slice(2).replaceAll("-", "");
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    parsed[key] = value;
    index += 1;
  }
  return {
    output: parsed.output,
    marker: parsed.marker,
    mode: parsed.mode,
    delayMs: parsed.delayms,
    stallMs: parsed.stallms,
    errorStatus: parsed.errorstatus
  };
}

function nonNegativeInteger(value, label) {
  if (value === undefined) {
    return null;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return number;
}
