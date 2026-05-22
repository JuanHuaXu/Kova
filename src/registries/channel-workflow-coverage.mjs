export function buildChannelWorkflowCoverage({
  channelId,
  supportedAtomKeys,
  workflowCases,
  driverSupport
}) {
  const supported = supportedAtomKeys instanceof Set
    ? supportedAtomKeys
    : new Set(supportedAtomKeys ?? []);
  const selected = [];
  const skipped = [];

  for (const workflowCase of workflowCases ?? []) {
    const atomGaps = missingAtomKeys(workflowCase, supported);
    if (atomGaps.length > 0) {
      skipped.push(skippedWorkflowCase({
        workflowCase,
        reason: `missing atoms: ${atomGaps.join(", ")}`,
        missingAtoms: atomGaps,
        driverReason: null
      }));
      continue;
    }

    const driverResult = typeof driverSupport === "function"
      ? normalizeDriverSupport(driverSupport({ channelId, workflowCase }))
      : { supported: true, reason: null };
    if (!driverResult.supported) {
      skipped.push(skippedWorkflowCase({
        workflowCase,
        reason: `driver support: ${driverResult.reason ?? "not supported"}`,
        missingAtoms: [],
        driverReason: driverResult.reason ?? "not supported"
      }));
      continue;
    }

    selected.push(workflowCaseCoverageRow(workflowCase));
  }

  return {
    schemaVersion: "kova.channelWorkflowCoverage.v1",
    channelId,
    selectedCount: selected.length,
    skippedCount: skipped.length,
    selected,
    skipped
  };
}

export function workflowCaseCoverageRow(workflowCase) {
  return {
    id: workflowCase.id,
    workflow: workflowCase.workflow,
    inventoryWorkflow: workflowCase.inventoryWorkflow,
    userAction: workflowCase.userAction,
    matrix: workflowCase.matrix,
    atoms: workflowCase.atoms ?? []
  };
}

export function workflowSupportedAtomKeysFromCapabilities(capabilities) {
  return new Set((capabilities ?? []).map((capability) => `${capability.group}:${capability.id}`));
}

export function workflowSupportedAtomKeysFromPlatformCapabilities(capabilities) {
  return new Set(Object.entries(capabilities ?? {}).flatMap(([group, ids]) =>
    (Array.isArray(ids) ? ids : []).map((id) => `${group}:${id}`)
  ));
}

function missingAtomKeys(workflowCase, supportedAtomKeys) {
  return (workflowCase.atoms ?? [])
    .filter((atom) => atom.group !== "workflow")
    .map((atom) => `${atom.group}:${atom.id}`)
    .filter((key) => !supportedAtomKeys.has(key));
}

function skippedWorkflowCase({ workflowCase, reason, missingAtoms, driverReason }) {
  return {
    ...workflowCaseCoverageRow(workflowCase),
    reason,
    missingAtoms,
    driverReason
  };
}

function normalizeDriverSupport(value) {
  if (value === false) {
    return { supported: false, reason: null };
  }
  if (value === true || value == null) {
    return { supported: true, reason: null };
  }
  if (typeof value === "object") {
    return {
      supported: value.supported !== false,
      reason: typeof value.reason === "string" && value.reason.length > 0 ? value.reason : null
    };
  }
  return { supported: true, reason: null };
}
