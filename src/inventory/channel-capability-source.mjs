import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export const openClawChannelCapabilitySourceGroups = [
  {
    group: "durable-final",
    symbol: "durableFinalDeliveryCapabilities"
  },
  {
    group: "live-preview",
    symbol: "channelMessageLiveCapabilities"
  },
  {
    group: "live-finalizer",
    symbol: "livePreviewFinalizerCapabilities"
  },
  {
    group: "ack",
    symbol: "channelMessageReceiveAckPolicies"
  }
];

export async function discoverOpenClawChannelCapabilityCatalogSource({ repoPath, catalog }) {
  if (!repoPath) {
    return {
      source: {
        id: "channel-capability-catalog",
        kind: "source-catalog-check",
        status: "skipped",
        reason: "--openclaw-repo was not provided"
      },
      result: null
    };
  }

  try {
    const sourceLists = await readOpenClawChannelCapabilitySourceLists(repoPath);
    const comparison = compareChannelCapabilityCatalogToSource(catalog, sourceLists);
    return {
      source: {
        id: "channel-capability-catalog",
        kind: "source-catalog-check",
        status: comparison.ok ? "matched" : "failed",
        path: relative(repoPath, channelCapabilityTypesPath(repoPath)),
        capabilityCount: catalog?.capabilities?.length ?? 0,
        mismatchCount: comparison.mismatches.length
      },
      result: {
        schemaVersion: "kova.channelCapabilityCatalogSourceComparison.v1",
        repoPath: resolve(repoPath),
        catalogId: catalog?.id ?? null,
        sourcePath: channelCapabilityTypesPath(repoPath),
        sourceCapabilityCounts: Object.fromEntries(
          Object.entries(sourceLists).map(([group, values]) => [group, values.length])
        ),
        ...comparison
      }
    };
  } catch (error) {
    return {
      source: {
        id: "channel-capability-catalog",
        kind: "source-catalog-check",
        status: error.code === "ENOENT" ? "missing" : "failed",
        path: channelCapabilityTypesPath(repoPath),
        error: error.message
      },
      result: {
        schemaVersion: "kova.channelCapabilityCatalogSourceComparison.v1",
        repoPath: resolve(repoPath),
        catalogId: catalog?.id ?? null,
        sourcePath: channelCapabilityTypesPath(repoPath),
        ok: false,
        mismatches: [],
        error: error.message
      }
    };
  }
}

export async function readOpenClawChannelCapabilitySourceLists(repoPath) {
  const text = await readFile(channelCapabilityTypesPath(repoPath), "utf8");
  const lists = {};
  for (const sourceGroup of openClawChannelCapabilitySourceGroups) {
    lists[sourceGroup.group] = kebabValues(extractConstArray(text, sourceGroup.symbol));
  }
  return lists;
}

export function compareChannelCapabilityCatalogToSource(catalog, sourceLists) {
  const byGroup = new Map();
  for (const capability of catalog?.capabilities ?? []) {
    const values = byGroup.get(capability.group) ?? [];
    values.push(capability.id);
    byGroup.set(capability.group, values);
  }

  const mismatches = [];
  for (const sourceGroup of openClawChannelCapabilitySourceGroups) {
    const catalogValues = byGroup.get(sourceGroup.group) ?? [];
    const sourceValues = sourceLists[sourceGroup.group] ?? [];
    if (JSON.stringify(catalogValues) !== JSON.stringify(sourceValues)) {
      mismatches.push({
        group: sourceGroup.group,
        catalog: catalogValues,
        source: sourceValues
      });
    }
  }

  return {
    ok: mismatches.length === 0,
    mismatches
  };
}

function channelCapabilityTypesPath(repoPath) {
  return join(repoPath, "src", "channels", "message", "types.ts");
}

function extractConstArray(text, name) {
  const pattern = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`);
  const match = pattern.exec(text);
  if (!match) {
    throw new Error(`could not find ${name} in OpenClaw channel message types`);
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function kebabValues(values) {
  return values.map((value) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replaceAll("_", "-"));
}
