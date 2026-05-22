import {
  buildChannelWorkflowCoverage,
  workflowCaseCoverageRow,
  workflowSupportedAtomKeysFromCapabilities
} from "../../src/registries/channel-workflow-coverage.mjs";

export function selectWorkflowCases({ channelRegistry, workflowCatalog, caseSet: requestedCaseSet }) {
  const cases = Array.isArray(workflowCatalog?.cases) ? workflowCatalog.cases : [];
  const casesById = new Map(cases.map((workflowCase) => [workflowCase.id, workflowCase]));
  const ids = requestedCaseSet === "declared-workflows"
    ? channelRegistry.workflowCaseIds ?? []
    : requestedCaseSet.split(",").map((id) => id.trim()).filter(Boolean);
  const selected = ids.map((id) => casesById.get(id)).filter(Boolean);
  if (selected.length !== ids.length) {
    const unknown = ids.filter((id) => !casesById.has(id));
    throw new Error(`unknown workflow case${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
  }
  return selected;
}

export function planWorkflowCases({ channelRegistry, workflowCatalog, caseSet: requestedCaseSet, driver }) {
  const cases = Array.isArray(workflowCatalog?.cases) ? workflowCatalog.cases : [];
  if (requestedCaseSet !== "declared-workflows") {
    const selected = selectWorkflowCases({ channelRegistry, workflowCatalog, caseSet: requestedCaseSet });
    return {
      schemaVersion: "kova.channelWorkflowCoverage.v1",
      channelId: channelRegistry.id,
      selectedCount: selected.length,
      skippedCount: 0,
      selected,
      selectedRows: selected.map((workflowCase) => workflowCaseCoverageRow(workflowCase)),
      skipped: [],
      requestedCaseSet
    };
  }

  const coverage = buildChannelWorkflowCoverage({
    channelId: channelRegistry.id,
    supportedAtomKeys: workflowSupportedAtomKeysFromCapabilities(channelRegistry.capabilities),
    workflowCases: cases,
    driverSupport: typeof driver?.canDriveWorkflowCase === "function"
      ? ({ workflowCase }) => driver.canDriveWorkflowCase({ workflowCase })
      : null
  });
  const selectedById = new Map(cases.map((workflowCase) => [workflowCase.id, workflowCase]));
  return {
    ...coverage,
    selected: coverage.selected.map((row) => selectedById.get(row.id)).filter(Boolean),
    selectedRows: coverage.selected,
    requestedCaseSet
  };
}
