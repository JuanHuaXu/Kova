export function declaredCapabilityProofRows({ channelId, channelRegistry, workflowCoverage, rows, artifactPath }) {
  const rowsById = new Map((rows ?? []).map((row) => [row.id, row]));
  const selectedRows = workflowCoverage?.selectedRows ?? workflowCoverage?.selected ?? [];
  return (channelRegistry.capabilities ?? []).map((capability) => capabilityProofRow({
    channelId,
    capability,
    proofCaseRows: selectedRows
      .filter((workflowCase) => caseAtoms(workflowCase).includes(`${capability.group}:${capability.id}`))
      .map((workflowCase) => rowsById.get(workflowCase.id))
      .filter(Boolean),
    artifactPath
  }));
}

function capabilityProofRow({ channelId, capability, proofCaseRows, artifactPath }) {
  const proofCaseIds = proofCaseRows.map((row) => row.id);
  const passedCase = proofCaseRows.find((row) => row.status === "passed");
  const failedCases = proofCaseRows.filter((row) => row.status !== "passed");
  const capabilityKey = `${capability.group}:${capability.id}`;
  if (passedCase) {
    return {
      channelId,
      group: capability.group,
      capabilityId: capability.id,
      required: true,
      status: "passed",
      proofMode: "channel-platform-conformance",
      summary: `${channelId} ${capabilityKey} capability proven by ${passedCase.id}`,
      reason: null,
      ownerArea: `${channelId} adapter/runtime`,
      artifactPath,
      proofCaseIds
    };
  }
  if (failedCases.length > 0) {
    return {
      channelId,
      group: capability.group,
      capabilityId: capability.id,
      required: true,
      status: "failed",
      proofMode: "channel-platform-conformance",
      summary: `${channelId} ${capabilityKey} capability proof failed`,
      reason: `${failedCases.length} selected user flow proof${failedCases.length === 1 ? "" : "s"} failed: ${proofCaseIds.join(", ")}`,
      failureOwner: failedCases[0]?.failureOwner ?? null,
      ownerArea: failedCases[0]?.ownerArea ?? `${channelId} adapter/runtime`,
      artifactPath,
      proofCaseIds
    };
  }
  return {
    channelId,
    group: capability.group,
    capabilityId: capability.id,
    required: true,
    status: "missing",
    proofMode: "channel-platform-conformance",
    summary: `${channelId} ${capabilityKey} capability has no selected user-flow proof`,
    reason: `no selected ${channelId} user flow proves ${capabilityKey}`,
    failureOwner: "kova-coverage",
    ownerArea: "Kova channel conformance coverage",
    artifactPath,
    proofCaseIds: []
  };
}

function caseAtoms(workflowCase) {
  return (workflowCase.atoms ?? [])
    .filter((atom) => atom.group !== "workflow")
    .map((atom) => `${atom.group}:${atom.id}`);
}
