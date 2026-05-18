import { stat } from "node:fs/promises";

export function attachEvidenceInvariants(record, scenario) {
  const invariants = [];
  if (scenario.surface === "upgrade-existing-user") {
    invariants.push(...buildUpgradeStateSnapshotInvariants(record));
    invariants.push(...buildUpgradeLogDerivedInvariants(record));
  }
  if (scenario.surface === "gateway-session-send-turn") {
    invariants.push(...buildGatewaySessionEvidenceInvariants(record, scenario));
  }
  if (scenario.surface === "agent-cli-local-turn") {
    invariants.push(...buildAgentCliLocalTurnEvidenceInvariants(record, scenario));
  }
  if (scenario.surface === "agent-gateway-rpc-turn") {
    invariants.push(...buildAgentGatewayRpcTurnEvidenceInvariants(record, scenario));
  }
  if (scenario.surface === "release-runtime-startup") {
    invariants.push(...buildReleaseRuntimeStartupEvidenceInvariants(record, scenario));
  }
  if (scenario.surface === "official-plugin-install") {
    invariants.push(...buildOfficialPluginInstallEvidenceInvariants(record, scenario));
  }
  if (invariants.length > 0) {
    record.evidenceInvariants = invariants;
  }
  return record;
}

export function buildAgentGatewayRpcTurnEvidenceInvariants(record, scenario = {}) {
  if (record.status === "DRY-RUN" || record.status === "SKIPPED") {
    return [];
  }

  const turns = record.measurements?.agentTurns ?? [];
  const expectedTurnCount = agentTurnExpectedCount(scenario, turns);
  const health = record.measurements?.health ?? {};
  const providerEvidence = record.providerEvidence ?? {};
  const providerArtifacts = Array.isArray(providerEvidence.artifacts) ? providerEvidence.artifacts : [];
  const missingDependencyErrors = record.measurements?.missingDependencyErrors;
  const pluginLoadFailures = record.measurements?.pluginLoadFailures;
  const providerTimeoutMentions = record.measurements?.providerTimeoutMentions;
  const logArtifactPath = releaseStartupLogArtifactPath(record);

  return [
    {
      id: "agent-gateway-command-receipts",
      phaseId: "post-agent-health",
      required: true,
      status: phaseCommandReceiptsOk(record) ? "passed" : "missing",
      summary: "gateway RPC agent provision, service, turn, status, log, and collector command receipts were captured",
      artifactPath: null,
      reason: phaseCommandReceiptsReason(record)
    },
    {
      id: "agent-gateway-runtime-binding-proof",
      phaseId: "gateway-start",
      required: true,
      status: agentGatewayRuntimeBindingOk(record) ? "passed" : "missing",
      summary: "Gateway-backed agent run captured runtime release binding and gateway port metadata",
      artifactPath: null,
      reason: agentGatewayRuntimeBindingReason(record)
    },
    {
      id: "agent-gateway-readiness-health-proof",
      phaseId: "gateway-start",
      required: true,
      status: gatewaySessionHealthOk(record, health) ? "passed" : "missing",
      summary: "Gateway readiness, post-ready health, and final service state were measured",
      artifactPath: null,
      reason: gatewaySessionHealthReason(record, health)
    },
    {
      id: "agent-gateway-rpc-transport-proof",
      phaseId: "gateway-agent-turn",
      required: true,
      status: agentGatewayRpcTransportOk(turns, expectedTurnCount) ? "passed" : "failed",
      summary: "agent turn used the Gateway-backed CLI path without the local embedded-agent flag",
      artifactPath: null,
      reason: agentGatewayRpcTransportReason(turns, expectedTurnCount)
    },
    {
      id: "agent-gateway-response-proof",
      phaseId: "gateway-agent-turn",
      required: true,
      status: agentTurnBehaviorOk(turns, scenario, expectedTurnCount) ? "passed" : "failed",
      summary: "Gateway-backed agent turn produced the expected assistant marker",
      artifactPath: null,
      reason: agentTurnBehaviorReason(turns, scenario, expectedTurnCount)
    },
    {
      id: "agent-gateway-provider-proof",
      phaseId: "gateway-agent-turn",
      required: true,
      status: agentProviderProofOk(providerEvidence, turns, scenario, expectedTurnCount) ? "passed" : "missing",
      summary: "mock provider request/response evidence was captured and attributed to the Gateway-backed agent turn",
      artifactPath: providerEvidence.summaryPath ?? providerArtifacts[0] ?? null,
      reason: agentProviderProofReason(providerEvidence, turns, scenario, expectedTurnCount)
    },
    {
      id: "agent-gateway-latency-windows",
      phaseId: "gateway-agent-turn",
      required: true,
      status: agentTurnLatencyOk(turns, scenario, expectedTurnCount) ? "passed" : "missing",
      summary: "Gateway-backed agent total, pre-provider, provider, and post-provider latency windows were measured",
      artifactPath: null,
      reason: agentTurnLatencyReason(turns, scenario, expectedTurnCount)
    },
    {
      id: "agent-gateway-resource-proof",
      phaseId: "gateway-agent-turn",
      required: true,
      status: agentGatewayResourceProofOk(record.measurements) ? "passed" : "missing",
      summary: "Gateway and agent CLI resource samples with retained sample artifacts were captured",
      artifactPath: record.measurements?.resourceSampleArtifacts?.[0] ?? null,
      reason: agentGatewayResourceProofReason(record.measurements)
    },
    {
      id: "agent-gateway-diagnostic-timeline-proof",
      phaseId: "gateway-agent-turn",
      required: true,
      status: commonTimelineProofOk(record.measurements) ? "passed" : "missing",
      summary: "OpenClaw diagnostic timeline was captured and parsed without errors",
      artifactPath: record.measurements?.openclawTimelineArtifacts?.[0] ?? null,
      reason: commonTimelineProofReason(record.measurements)
    },
    {
      id: "agent-gateway-logs-captured",
      phaseId: "post-agent-health",
      required: true,
      status: logArtifactPath ? "passed" : "missing",
      summary: "bounded gateway logs were captured for dependency and plugin-load checks",
      artifactPath: logArtifactPath,
      reason: logArtifactPath ? null : "log artifact path was not recorded"
    },
    zeroCountInvariant({
      id: "agent-gateway-no-missing-runtime-dependency-errors",
      summary: "Gateway-backed agent logs and command output contain no missing runtime dependency errors",
      actual: missingDependencyErrors,
      metric: "missingDependencyErrors",
      phaseId: "post-agent-health"
    }),
    zeroCountInvariant({
      id: "agent-gateway-no-plugin-load-failures",
      summary: "Gateway-backed agent logs contain no plugin load failures",
      actual: pluginLoadFailures,
      metric: "pluginLoadFailures",
      phaseId: "post-agent-health"
    }),
    zeroCountInvariant({
      id: "agent-gateway-no-provider-timeout-mentions",
      summary: "Gateway-backed agent logs and command output contain no provider timeout mentions",
      actual: providerTimeoutMentions,
      metric: "providerTimeoutMentions",
      phaseId: "post-agent-health"
    })
  ];
}

function agentGatewayRuntimeBindingOk(record) {
  const service = agentGatewayBestServiceMetrics(record);
  return typeof service?.runtimeReleaseVersion === "string" &&
    service.runtimeReleaseVersion.length > 0 &&
    typeof service.runtimeReleaseChannel === "string" &&
    nonNegativeNumber(service.gatewayPort);
}

function agentGatewayRuntimeBindingReason(record) {
  const service = agentGatewayBestServiceMetrics(record);
  if (!service) {
    return "service metrics were not captured";
  }
  if (typeof service.runtimeReleaseVersion !== "string" || service.runtimeReleaseVersion.length === 0) {
    return "runtime release version was not captured";
  }
  if (typeof service.runtimeReleaseChannel !== "string") {
    return "runtime release channel was not captured";
  }
  if (!nonNegativeNumber(service.gatewayPort)) {
    return "gateway port was not captured";
  }
  return null;
}

function agentGatewayBestServiceMetrics(record) {
  const services = [];
  for (const phase of record.phases ?? []) {
    if (phase.metrics?.service) {
      services.push(phase.metrics.service);
    }
  }
  if (record.finalMetrics?.service) {
    services.push(record.finalMetrics.service);
  }
  return services.find((service) => service.gatewayState === "running" && typeof service.runtimeReleaseVersion === "string") ??
    services.find((service) => typeof service.runtimeReleaseVersion === "string") ??
    null;
}

function agentGatewayRpcTransportOk(turns, expectedTurnCount) {
  const scopedTurns = turns.slice(0, expectedTurnCount);
  return scopedTurns.length >= expectedTurnCount &&
    scopedTurns.every((turn) =>
      !commandUsesFlag(turn.command, "--local") &&
      commandUsesToken(turn.command, "agent") &&
      !turn.gatewaySession
    );
}

function agentGatewayRpcTransportReason(turns, expectedTurnCount) {
  if (turns.length < expectedTurnCount) {
    return `expected at least ${expectedTurnCount} agent turn(s), found ${turns.length}`;
  }
  const bad = turns.slice(0, expectedTurnCount).find((turn) =>
    commandUsesFlag(turn.command, "--local") ||
    !commandUsesToken(turn.command, "agent") ||
    turn.gatewaySession
  );
  if (!bad) {
    return null;
  }
  if (commandUsesFlag(bad.command, "--local")) {
    return `${bad.phaseId} command used --local`;
  }
  if (!commandUsesToken(bad.command, "agent")) {
    return `${bad.phaseId} command did not invoke the agent CLI`;
  }
  return `${bad.phaseId} had Gateway session helper transport evidence`;
}

function commandUsesToken(command, token) {
  return new RegExp(`(^|\\s)${escapeRegex(token)}(\\s|$)`).test(command ?? "");
}

function agentGatewayResourceProofOk(measurements) {
  return commonResourceProofOk(measurements) &&
    nonNegativeNumber(measurements?.resourceByRole?.gateway?.peakRssMb) &&
    nonNegativeNumber(measurements?.resourceByRole?.["agent-cli"]?.peakRssMb);
}

function agentGatewayResourceProofReason(measurements) {
  const commonReason = commonResourceProofReason(measurements);
  if (commonReason) {
    return commonReason;
  }
  if (!nonNegativeNumber(measurements?.resourceByRole?.gateway?.peakRssMb)) {
    return "gateway role resource measurements were not captured";
  }
  if (!nonNegativeNumber(measurements?.resourceByRole?.["agent-cli"]?.peakRssMb)) {
    return "agent CLI role resource measurements were not captured";
  }
  return null;
}

export function buildAgentCliLocalTurnEvidenceInvariants(record, scenario = {}) {
  if (record.status === "DRY-RUN" || record.status === "SKIPPED") {
    return [];
  }

  const turns = record.measurements?.agentTurns ?? [];
  const expectedTurnCount = agentTurnExpectedCount(scenario, turns);
  const providerEvidence = record.providerEvidence ?? {};
  const providerArtifacts = Array.isArray(providerEvidence.artifacts) ? providerEvidence.artifacts : [];
  const missingDependencyErrors = record.measurements?.missingDependencyErrors;
  const pluginLoadFailures = record.measurements?.pluginLoadFailures;
  const providerTimeoutMentions = record.measurements?.providerTimeoutMentions;
  const logArtifactPath = releaseStartupLogArtifactPath(record);

  return [
    {
      id: "agent-cli-command-receipts",
      phaseId: "post-agent-health",
      required: true,
      status: phaseCommandReceiptsOk(record) ? "passed" : "missing",
      summary: "agent CLI provision, turn, status, and collector command receipts were captured",
      artifactPath: null,
      reason: phaseCommandReceiptsReason(record)
    },
    {
      id: "agent-cli-local-transport-proof",
      phaseId: "cold-agent-turn",
      required: true,
      status: agentCliLocalTransportOk(turns, expectedTurnCount) ? "passed" : "failed",
      summary: "agent turns used the local embedded agent CLI path, not Gateway session RPC",
      artifactPath: null,
      reason: agentCliLocalTransportReason(turns, expectedTurnCount)
    },
    {
      id: "agent-cli-response-proof",
      phaseId: "warm-agent-turn",
      required: true,
      status: agentTurnBehaviorOk(turns, scenario, expectedTurnCount) ? "passed" : "failed",
      summary: "agent turns produced the expected assistant marker or expected failure evidence",
      artifactPath: null,
      reason: agentTurnBehaviorReason(turns, scenario, expectedTurnCount)
    },
    {
      id: "agent-cli-provider-proof",
      phaseId: "warm-agent-turn",
      required: true,
      status: agentProviderProofOk(providerEvidence, turns, scenario, expectedTurnCount) ? "passed" : "missing",
      summary: "mock provider request/response evidence was captured and attributed to every successful agent turn",
      artifactPath: providerEvidence.summaryPath ?? providerArtifacts[0] ?? null,
      reason: agentProviderProofReason(providerEvidence, turns, scenario, expectedTurnCount)
    },
    {
      id: "agent-cli-latency-windows",
      phaseId: "warm-agent-turn",
      required: true,
      status: agentTurnLatencyOk(turns, scenario, expectedTurnCount) ? "passed" : "missing",
      summary: "agent total, pre-provider, provider, and post-provider latency windows were measured",
      artifactPath: null,
      reason: agentTurnLatencyReason(turns, scenario, expectedTurnCount)
    },
    {
      id: "agent-cli-no-service-health-proof",
      phaseId: "post-agent-health",
      required: true,
      status: agentCliNoServiceHealthOk(record) ? "passed" : "missing",
      summary: "no-service local agent env state and final health accounting were captured",
      artifactPath: null,
      reason: agentCliNoServiceHealthReason(record)
    },
    {
      id: "agent-cli-resource-proof",
      phaseId: "warm-agent-turn",
      required: true,
      status: agentCliResourceProofOk(record.measurements) ? "passed" : "missing",
      summary: "agent CLI resource samples and retained sample artifacts were captured",
      artifactPath: record.measurements?.resourceSampleArtifacts?.[0] ?? null,
      reason: agentCliResourceProofReason(record.measurements)
    },
    {
      id: "agent-cli-diagnostic-timeline-proof",
      phaseId: "warm-agent-turn",
      required: true,
      status: commonTimelineProofOk(record.measurements) ? "passed" : "missing",
      summary: "OpenClaw diagnostic timeline was captured and parsed without errors",
      artifactPath: record.measurements?.openclawTimelineArtifacts?.[0] ?? null,
      reason: commonTimelineProofReason(record.measurements)
    },
    {
      id: "agent-cli-logs-captured",
      phaseId: "post-agent-health",
      required: true,
      status: logArtifactPath ? "passed" : "missing",
      summary: "bounded gateway or command logs were captured for dependency and plugin-load checks",
      artifactPath: logArtifactPath,
      reason: logArtifactPath ? null : "log artifact path was not recorded"
    },
    zeroCountInvariant({
      id: "agent-cli-no-missing-runtime-dependency-errors",
      summary: "agent CLI logs and command output contain no missing runtime dependency errors",
      actual: missingDependencyErrors,
      metric: "missingDependencyErrors",
      phaseId: "post-agent-health"
    }),
    zeroCountInvariant({
      id: "agent-cli-no-plugin-load-failures",
      summary: "agent CLI logs contain no plugin load failures",
      actual: pluginLoadFailures,
      metric: "pluginLoadFailures",
      phaseId: "post-agent-health"
    }),
    zeroCountInvariant({
      id: "agent-cli-no-provider-timeout-mentions",
      summary: "agent CLI logs and command output contain no provider timeout mentions",
      actual: providerTimeoutMentions,
      metric: "providerTimeoutMentions",
      phaseId: "post-agent-health"
    })
  ];
}

function phaseCommandReceiptsOk(record) {
  return (record.phases ?? []).every((phase) => {
    const commandCount = phase.commands?.length ?? 0;
    if (commandCount === 0) {
      return true;
    }
    return Array.from({ length: commandCount }).every((_, index) => {
      const result = phase.results?.[index];
      return result?.status === 0 && result.durationMs !== undefined;
    });
  });
}

function phaseCommandReceiptsReason(record) {
  for (const phase of record.phases ?? []) {
    for (const [index, command] of (phase.commands ?? []).entries()) {
      const result = phase.results?.[index];
      if (!result) {
        return `${phase.id} command ${index + 1} receipt was not captured`;
      }
      if (result.status !== 0) {
        return `${phase.id} command ${index + 1} exited ${result.status}`;
      }
      if (result.durationMs === undefined) {
        return `${phase.id} command ${index + 1} duration was not captured`;
      }
      if (typeof command === "string" && typeof result.command === "string" && result.command.length === 0) {
        return `${phase.id} command ${index + 1} command text was empty`;
      }
    }
  }
  return null;
}

function agentTurnExpectedCount(scenario, turns) {
  if (scenario.id === "agent-cold-warm-message") {
    return 2;
  }
  if (scenario.id === "agent-gateway-rpc-turn") {
    return 1;
  }
  return Math.max(1, turns.length);
}

function agentCliLocalTransportOk(turns, expectedTurnCount) {
  const scopedTurns = turns.slice(0, expectedTurnCount);
  return scopedTurns.length >= expectedTurnCount &&
    scopedTurns.every((turn) => commandUsesFlag(turn.command, "--local") && !turn.gatewaySession);
}

function agentCliLocalTransportReason(turns, expectedTurnCount) {
  if (turns.length < expectedTurnCount) {
    return `expected at least ${expectedTurnCount} agent turn(s), found ${turns.length}`;
  }
  const bad = turns.slice(0, expectedTurnCount).find((turn) => !commandUsesFlag(turn.command, "--local") || turn.gatewaySession);
  if (!bad) {
    return null;
  }
  if (!commandUsesFlag(bad.command, "--local")) {
    return `${bad.phaseId} command did not include --local`;
  }
  return `${bad.phaseId} had Gateway session transport evidence`;
}

function commandUsesFlag(command, flag) {
  return new RegExp(`(^|\\s)${escapeRegex(flag)}(\\s|$)`).test(command ?? "");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function agentTurnBehaviorOk(turns, scenario, expectedTurnCount) {
  const scopedTurns = turns.slice(0, expectedTurnCount);
  return scopedTurns.length >= expectedTurnCount &&
    scopedTurns.every((turn) => agentTurnExpectedFailure(turn, scenario)
      ? turn.expectedFailureObserved === true
      : turn.responseOk === true && turn.expectedTextPresent === true && typeof turn.responseText === "string" && turn.responseText.length > 0);
}

function agentTurnBehaviorReason(turns, scenario, expectedTurnCount) {
  if (turns.length < expectedTurnCount) {
    return `expected at least ${expectedTurnCount} agent turn(s), found ${turns.length}`;
  }
  const bad = turns.slice(0, expectedTurnCount).find((turn) => {
    if (agentTurnExpectedFailure(turn, scenario)) {
      return turn.expectedFailureObserved !== true;
    }
    return turn.responseOk !== true || turn.expectedTextPresent !== true || typeof turn.responseText !== "string" || turn.responseText.length === 0;
  });
  if (!bad) {
    return null;
  }
  if (agentTurnExpectedFailure(bad, scenario)) {
    return `${bad.phaseId} did not observe the expected agent failure`;
  }
  if (bad.responseOk !== true) {
    return `${bad.phaseId} responseOk was not true`;
  }
  if (bad.expectedTextPresent !== true) {
    return `${bad.phaseId} did not report expected text present`;
  }
  return `${bad.phaseId} response text was missing`;
}

function agentTurnExpectedFailure(turn, scenario) {
  if (turn?.expectedFailure === true || scenario.agent?.expectedFailure === true) {
    return true;
  }
  return (scenario.phases ?? []).some((phase) => phase.id === turn?.phaseId && phase.expectedAgentFailure === true);
}

function agentProviderProofOk(providerEvidence, turns, scenario, expectedTurnCount) {
  const successfulTurns = turns.slice(0, expectedTurnCount).filter((turn) => !agentTurnExpectedFailure(turn, scenario));
  if (successfulTurns.length === 0) {
    return true;
  }
  if (providerEvidence?.available !== true || providerEvidence.requestCount < successfulTurns.length) {
    return false;
  }
  return successfulTurns.every((turn) =>
    turn.missingProviderRequest === false &&
    (turn.requestCount ?? 0) > 0 &&
    turn.providerAfterCommandEnd !== true &&
    turn.providerStatuses.every((status) => !Number.isFinite(Number(status.value)) || Number(status.value) < 400)
  );
}

function agentProviderProofReason(providerEvidence, turns, scenario, expectedTurnCount) {
  const successfulTurns = turns.slice(0, expectedTurnCount).filter((turn) => !agentTurnExpectedFailure(turn, scenario));
  if (successfulTurns.length === 0) {
    return null;
  }
  if (providerEvidence?.available !== true) {
    return providerEvidence?.error ?? "provider evidence was not available";
  }
  if (providerEvidence.requestCount < successfulTurns.length) {
    return `provider request count ${providerEvidence.requestCount ?? 0} was below required ${successfulTurns.length}`;
  }
  const missing = successfulTurns.find((turn) => turn.missingProviderRequest === true || (turn.requestCount ?? 0) === 0);
  if (missing) {
    return `${missing.phaseId} had no attributed provider request`;
  }
  const late = successfulTurns.find((turn) => turn.providerAfterCommandEnd === true);
  if (late) {
    return `${late.phaseId} provider request arrived after command window by ${late.providerLateByMs ?? "unknown"}ms`;
  }
  const failedStatus = successfulTurns.find((turn) =>
    turn.providerStatuses.some((status) => Number.isFinite(Number(status.value)) && Number(status.value) >= 400)
  );
  if (failedStatus) {
    return `${failedStatus.phaseId} had provider HTTP error status evidence`;
  }
  return null;
}

function agentTurnLatencyOk(turns, scenario, expectedTurnCount) {
  const scopedTurns = turns.slice(0, expectedTurnCount);
  return scopedTurns.length >= expectedTurnCount &&
    scopedTurns.every((turn) => {
      if (!nonNegativeNumber(turn.totalTurnMs) || !nonNegativeNumber(turn.rawCommandDurationMs)) {
        return false;
      }
      if (agentTurnExpectedFailure(turn, scenario)) {
        return true;
      }
      return nonNegativeNumber(turn.preProviderMs) &&
        nonNegativeNumber(turn.providerFinalMs) &&
        nonNegativeNumber(turn.postProviderMs);
    });
}

function agentTurnLatencyReason(turns, scenario, expectedTurnCount) {
  if (turns.length < expectedTurnCount) {
    return `expected at least ${expectedTurnCount} agent turn(s), found ${turns.length}`;
  }
  const bad = turns.slice(0, expectedTurnCount).find((turn) => !agentTurnLatencyOk([turn], scenario, 1));
  if (!bad) {
    return null;
  }
  const required = ["totalTurnMs", "rawCommandDurationMs"];
  if (!agentTurnExpectedFailure(bad, scenario)) {
    required.push("preProviderMs", "providerFinalMs", "postProviderMs");
  }
  const missing = required.filter((key) => !nonNegativeNumber(bad[key]));
  return `${bad.phaseId} missing latency field(s): ${missing.join(", ")}`;
}

function agentCliNoServiceHealthOk(record) {
  const final = record.measurements?.health?.final;
  return record.measurements?.finalGatewayState === "disabled" &&
    final?.failureCount === 0 &&
    findCommandResult(record, (result) => result.command?.includes(" -- status"))?.status === 0;
}

function agentCliNoServiceHealthReason(record) {
  if (record.measurements?.finalGatewayState !== "disabled") {
    return `final gateway state was ${record.measurements?.finalGatewayState ?? "missing"}`;
  }
  if (record.measurements?.health?.final?.failureCount !== 0) {
    return `final health failures were ${record.measurements?.health?.final?.failureCount ?? "missing"}`;
  }
  if (findCommandResult(record, (result) => result.command?.includes(" -- status"))?.status !== 0) {
    return "post-agent status command did not pass";
  }
  return null;
}

function agentCliResourceProofOk(measurements) {
  return commonResourceProofOk(measurements) &&
    (nonNegativeNumber(measurements?.resourceByRole?.["agent-cli"]?.peakRssMb) ||
      nonNegativeNumber(measurements?.resourceByRole?.["agent-process"]?.peakRssMb));
}

function agentCliResourceProofReason(measurements) {
  const commonReason = commonResourceProofReason(measurements);
  if (commonReason) {
    return commonReason;
  }
  if (!nonNegativeNumber(measurements?.resourceByRole?.["agent-cli"]?.peakRssMb) &&
    !nonNegativeNumber(measurements?.resourceByRole?.["agent-process"]?.peakRssMb)) {
    return "agent CLI role resource measurements were not captured";
  }
  return null;
}

export function buildOfficialPluginInstallEvidenceInvariants(record, scenario = {}) {
  if (record.status === "DRY-RUN" || record.status === "SKIPPED") {
    return [];
  }

  const health = record.measurements?.health ?? {};
  const evidence = record.measurements?.officialPluginEvidence ?? {};
  const missingDependencyErrors = record.measurements?.missingDependencyErrors;
  const pluginLoadFailures = record.measurements?.pluginLoadFailures;
  const logsResult = findCommandResult(record, (result) => result.command?.startsWith("ocm logs "));

  return [
    {
      id: "official-plugin-command-receipts",
      phaseId: "install",
      required: true,
      status: officialPluginCommandReceiptsOk(record) ? "passed" : "missing",
      summary: "official plugin provision, install, restart, verification, and log command receipts were captured",
      artifactPath: null,
      reason: officialPluginCommandReceiptsReason(record)
    },
    {
      id: "official-plugin-install-proof",
      phaseId: "install",
      required: true,
      status: officialPluginInstallProofStatus(evidence),
      summary: "required official plugins installed, listed, and refreshed through the user command path",
      artifactPath: evidence.artifactPath ?? null,
      reason: officialPluginInstallProofReason(evidence)
    },
    {
      id: "official-plugin-security-proof",
      phaseId: "install",
      required: true,
      status: officialPluginSecurityStatus(evidence),
      summary: "official plugin install produced no security scanner blocks",
      artifactPath: evidence.artifactPath ?? null,
      reason: officialPluginSecurityReason(evidence)
    },
    {
      id: "official-plugin-readiness-health-proof",
      phaseId: "restart",
      required: true,
      status: officialPluginHealthMissing(record, health) ? "missing" : officialPluginHealthOk(record, health) ? "passed" : "failed",
      summary: "gateway readiness, post-install health, and final service state were measured",
      artifactPath: null,
      reason: officialPluginHealthReason(record, health)
    },
    {
      id: "official-plugin-command-usability-proof",
      phaseId: "post-restart-verify",
      required: true,
      status: nonNegativeNumber(record.measurements?.pluginsListMs) ? "passed" : "missing",
      summary: "post-install plugin list command completed with latency measurement",
      artifactPath: null,
      reason: nonNegativeNumber(record.measurements?.pluginsListMs) ? null : "plugin list latency was not measured"
    },
    {
      id: "official-plugin-resource-proof",
      phaseId: "install",
      required: true,
      status: commonResourceProofOk(record.measurements) ? "passed" : "missing",
      summary: "official plugin install resource samples and retained sample artifacts were captured",
      artifactPath: record.measurements?.resourceSampleArtifacts?.[0] ?? null,
      reason: commonResourceProofReason(record.measurements)
    },
    {
      id: "official-plugin-diagnostic-timeline-proof",
      phaseId: "post-restart-verify",
      required: true,
      status: commonTimelineProofOk(record.measurements) ? "passed" : "missing",
      summary: "OpenClaw diagnostic timeline was captured and parsed without errors",
      artifactPath: record.measurements?.openclawTimelineArtifacts?.[0] ?? null,
      reason: commonTimelineProofReason(record.measurements)
    },
    {
      id: "official-plugin-logs-captured",
      phaseId: "post-restart-verify",
      required: true,
      status: releaseStartupLogsOk(logsResult) ? "passed" : "missing",
      summary: "post-install gateway logs were captured for dependency and plugin-load checks",
      artifactPath: releaseStartupLogArtifactPath(record),
      reason: releaseStartupLogsReason(logsResult)
    },
    zeroCountInvariant({
      id: "official-plugin-no-missing-runtime-dependency-errors",
      summary: "post-install logs and command output contain no missing runtime dependency errors",
      actual: missingDependencyErrors,
      metric: "missingDependencyErrors",
      phaseId: "post-restart-verify"
    }),
    zeroCountInvariant({
      id: "official-plugin-no-plugin-load-failures",
      summary: "post-install logs contain no plugin load failures",
      actual: pluginLoadFailures,
      metric: "pluginLoadFailures",
      phaseId: "post-restart-verify"
    })
  ];
}

function officialPluginCommandReceiptsOk(record) {
  return officialPluginRequiredCommands().every(([_, phaseId, predicate]) => {
    const result = findCommandResultInPhase(record, phaseId, predicate);
    return result?.status === 0 && result.durationMs !== undefined;
  });
}

function officialPluginCommandReceiptsReason(record) {
  for (const [label, phaseId, predicate] of officialPluginRequiredCommands()) {
    const result = findCommandResultInPhase(record, phaseId, predicate);
    if (!result) {
      return `${label} receipt was not captured`;
    }
    if (result.status !== 0) {
      return `${label} exited ${result.status}`;
    }
    if (result.durationMs === undefined) {
      return `${label} duration was not captured`;
    }
  }
  return null;
}

function officialPluginRequiredCommands() {
  return [
    ["ocm start", "provision", (result) => result.command?.startsWith("ocm start ")],
    ["baseline plugins list", "provision", (result) => result.command?.includes(" -- plugins list")],
    ["official plugin install helper", "install", (result) => result.command?.includes("run-official-plugin-install.mjs")],
    ["gateway restart helper", "restart", (result) => result.command?.includes("ensure-gateway-running.mjs")],
    ["service status", "post-restart-verify", (result) => result.command?.startsWith("ocm service status ")],
    ["post-install plugins list", "post-restart-verify", (result) => result.command?.includes(" -- plugins list")],
    ["post-install logs", "post-restart-verify", (result) => result.command?.startsWith("ocm logs ")]
  ];
}

function officialPluginInstallProofStatus(evidence) {
  if (evidence?.available !== true) {
    return "missing";
  }
  return officialPluginInstallProofOk(evidence) ? "passed" : "failed";
}

function officialPluginInstallProofOk(evidence) {
  return evidence?.ok === true &&
    evidence.installed === true &&
    evidence.listed === true &&
    evidence.registryRefreshed === true &&
    (evidence.requiredPluginCount ?? 0) > 0 &&
    (evidence.failedRequiredCount ?? 0) === 0;
}

function officialPluginInstallProofReason(evidence) {
  if (evidence?.available !== true) {
    return "official plugin install helper JSON was not captured";
  }
  if ((evidence.requiredPluginCount ?? 0) <= 0) {
    return "official plugin state had no required plugin proof";
  }
  if ((evidence.failedRequiredCount ?? 0) !== 0) {
    return `failed required official plugin count was ${evidence.failedRequiredCount}`;
  }
  if (evidence.installed !== true) {
    return "one or more official plugin install commands failed";
  }
  if (evidence.listed !== true) {
    return "one or more official plugins were not listed after install";
  }
  if (evidence.registryRefreshed !== true) {
    return "official plugin registry refresh did not succeed";
  }
  if (evidence.ok !== true) {
    return "official plugin helper did not report ok";
  }
  return null;
}

function officialPluginSecurityStatus(evidence) {
  if (evidence?.available !== true) {
    return "missing";
  }
  return (evidence.securityBlockCount ?? 0) === 0 ? "passed" : "failed";
}

function officialPluginSecurityReason(evidence) {
  if (evidence?.available !== true) {
    return "official plugin install helper JSON was not captured";
  }
  if ((evidence.securityBlockCount ?? 0) !== 0) {
    return `security block count was ${evidence.securityBlockCount}`;
  }
  return null;
}

function officialPluginHealthOk(record) {
  const restartReadiness = phaseMetrics(record, "restart")?.readiness;
  const postVerifyHealth = phaseMetrics(record, "post-restart-verify")?.healthSummary;
  const finalHealth = record.measurements?.health?.final;
  return restartReadiness?.classification?.state === "ready" &&
    Number.isFinite(restartReadiness.healthReadyAtMs) &&
    (postVerifyHealth?.count ?? 0) > 0 &&
    (postVerifyHealth?.failureCount ?? 0) === 0 &&
    (finalHealth?.failureCount ?? 0) === 0 &&
    record.measurements?.finalGatewayState === "running";
}

function officialPluginHealthMissing(record) {
  const restartReadiness = phaseMetrics(record, "restart")?.readiness;
  const postVerifyHealth = phaseMetrics(record, "post-restart-verify")?.healthSummary;
  return !restartReadiness ||
    !Number.isFinite(restartReadiness.healthReadyAtMs) ||
    (postVerifyHealth?.count ?? 0) <= 0 ||
    record.measurements?.finalGatewayState === undefined;
}

function officialPluginHealthReason(record) {
  const restartReadiness = phaseMetrics(record, "restart")?.readiness;
  const postVerifyHealth = phaseMetrics(record, "post-restart-verify")?.healthSummary;
  const finalHealth = record.measurements?.health?.final;
  if (!restartReadiness) {
    return "restart readiness measurement was not collected";
  }
  if (restartReadiness.classification?.state !== "ready") {
    return `restart readiness classification was ${restartReadiness.classification?.state ?? "missing"}`;
  }
  if (!Number.isFinite(restartReadiness.healthReadyAtMs)) {
    return "restart health-ready timing was not collected";
  }
  if ((postVerifyHealth?.count ?? 0) <= 0) {
    return "post-restart verification health samples were not collected";
  }
  if ((postVerifyHealth?.failureCount ?? 0) !== 0) {
    return `post-restart verification health failures were ${postVerifyHealth.failureCount}`;
  }
  if ((finalHealth?.failureCount ?? 0) !== 0) {
    return `final health failures were ${finalHealth.failureCount}`;
  }
  if (record.measurements?.finalGatewayState !== "running") {
    return `final gateway state was ${record.measurements?.finalGatewayState ?? "missing"}`;
  }
  return null;
}

function commonResourceProofOk(measurements) {
  return (measurements?.resourceSampleCount ?? 0) > 0 &&
    Array.isArray(measurements?.resourceSampleArtifacts) &&
    measurements.resourceSampleArtifacts.length > 0 &&
    nonNegativeNumber(measurements.peakRssMb);
}

function commonResourceProofReason(measurements) {
  if ((measurements?.resourceSampleCount ?? 0) <= 0) {
    return "resource samples were not collected";
  }
  if (!Array.isArray(measurements?.resourceSampleArtifacts) || measurements.resourceSampleArtifacts.length === 0) {
    return "resource sample artifact path was not recorded";
  }
  if (!nonNegativeNumber(measurements?.peakRssMb)) {
    return "resource peak RSS measurement was not captured";
  }
  return null;
}

function commonTimelineProofOk(measurements) {
  return measurements?.openclawTimelineAvailable === true &&
    (measurements.openclawTimelineEventCount ?? 0) > 0 &&
    (measurements.openclawTimelineParseErrors ?? 0) === 0 &&
    Array.isArray(measurements.openclawTimelineArtifacts) &&
    measurements.openclawTimelineArtifacts.length > 0;
}

function commonTimelineProofReason(measurements) {
  if (measurements?.openclawTimelineAvailable !== true) {
    return "OpenClaw diagnostic timeline was not available";
  }
  if ((measurements.openclawTimelineEventCount ?? 0) <= 0) {
    return "OpenClaw diagnostic timeline had no events";
  }
  if ((measurements.openclawTimelineParseErrors ?? 0) !== 0) {
    return `OpenClaw diagnostic timeline parse errors were ${measurements.openclawTimelineParseErrors}`;
  }
  if (!Array.isArray(measurements.openclawTimelineArtifacts) || measurements.openclawTimelineArtifacts.length === 0) {
    return "OpenClaw diagnostic timeline artifact path was not recorded";
  }
  return null;
}

function phaseMetrics(record, phaseId) {
  return (record.phases ?? []).find((phase) => phase.id === phaseId)?.metrics ?? null;
}

export function buildReleaseRuntimeStartupEvidenceInvariants(record, scenario = {}) {
  if (record.status === "DRY-RUN" || record.status === "SKIPPED") {
    return [];
  }

  const health = record.measurements?.health ?? {};
  const service = releaseStartupBestServiceMetrics(record);
  const provision = releaseStartupProvisionProof(record);
  const statusResult = findCommandResult(record, (result) => result.command === "ocm @{env} -- status" || result.command?.includes(" -- status"));
  const pluginsListResult = findCommandResult(record, (result) => result.command === "ocm @{env} -- plugins list" || result.command?.includes(" -- plugins list"));
  const logsProof = releaseStartupLogsProof(record, "startup-logs");
  const missingDependencyErrors = record.measurements?.missingDependencyErrors;
  const pluginLoadFailures = record.measurements?.pluginLoadFailures;

  return [
    {
      id: "release-runtime-command-receipts",
      phaseId: "post-start",
      required: true,
      status: releaseStartupCommandReceiptsOk(record) ? "passed" : "missing",
      summary: "startup, service status, OpenClaw status, plugin list, and log command receipts were captured",
      artifactPath: null,
      reason: releaseStartupCommandReceiptsReason(record)
    },
    {
      id: "release-runtime-binding-version-proof",
      phaseId: "provision",
      required: true,
      status: releaseStartupBindingOk(service, provision) ? "passed" : "missing",
      summary: "OCM startup evidence identifies the release runtime binding and OpenClaw version",
      artifactPath: null,
      reason: releaseStartupBindingReason(service, provision)
    },
    {
      id: "release-runtime-readiness-health-proof",
      phaseId: "provision",
      required: true,
      status: releaseStartupHealthMissing(record, health) ? "missing" : releaseStartupHealthOk(record, health) ? "passed" : "failed",
      summary: "gateway readiness, post-ready health, and final service state were measured",
      artifactPath: null,
      reason: releaseStartupHealthReason(record, health)
    },
    {
      id: "release-runtime-command-usability-proof",
      phaseId: "post-start",
      required: true,
      status: releaseStartupCommandUsabilityOk(statusResult, pluginsListResult, record.measurements) ? "passed" : "missing",
      summary: "status and plugin-list commands completed with latency measurements",
      artifactPath: null,
      reason: releaseStartupCommandUsabilityReason(statusResult, pluginsListResult, record.measurements)
    },
    {
      id: "release-runtime-resource-proof",
      phaseId: "provision",
      required: true,
      status: releaseStartupResourceOk(record.measurements) ? "passed" : "missing",
      summary: "gateway-scoped resource samples and retained sample artifacts were captured",
      artifactPath: record.measurements?.resourceSampleArtifacts?.[0] ?? null,
      reason: releaseStartupResourceReason(record.measurements)
    },
    {
      id: "release-runtime-diagnostic-timeline-proof",
      phaseId: "startup-logs",
      required: true,
      status: releaseStartupTimelineOk(record.measurements) ? "passed" : "missing",
      summary: "OpenClaw diagnostic timeline was captured and parsed without errors",
      artifactPath: record.measurements?.openclawTimelineArtifacts?.[0] ?? null,
      reason: releaseStartupTimelineReason(record.measurements)
    },
    {
      id: "release-runtime-startup-logs-captured",
      phaseId: "startup-logs",
      required: true,
      status: releaseStartupLogsOk(logsProof) ? "passed" : "missing",
      summary: "startup logs were captured through command or collector evidence",
      artifactPath: releaseStartupLogArtifactPath(record),
      reason: releaseStartupLogsReason(logsProof)
    },
    zeroCountInvariant({
      id: "release-runtime-no-missing-runtime-dependency-errors",
      summary: "startup logs and command output contain no missing runtime dependency errors",
      actual: missingDependencyErrors,
      metric: "missingDependencyErrors",
      phaseId: "startup-logs"
    }),
    zeroCountInvariant({
      id: "release-runtime-no-plugin-load-failures",
      summary: "startup logs contain no plugin load failures",
      actual: pluginLoadFailures,
      metric: "pluginLoadFailures",
      phaseId: "startup-logs"
    })
  ];
}

function releaseStartupCommandReceiptsOk(record) {
  const required = [
    ["ocm start", () => commandReceiptOk(record, (result) => result.command?.startsWith("ocm start "))],
    ["service collector", () => collectorReceiptOk(record, "post-start", "service")],
    ["ocm status", () => commandReceiptOk(record, (result) => result.command === "ocm @{env} -- status" || result.command?.includes(" -- status"))],
    ["ocm plugins list", () => commandReceiptOk(record, (result) => result.command === "ocm @{env} -- plugins list" || result.command?.includes(" -- plugins list"))],
    ["logs collector", () => collectorReceiptOk(record, "startup-logs", "logs")]
  ];
  return required.every(([_, ok]) => ok());
}

function releaseStartupCommandReceiptsReason(record) {
  const required = [
    ["ocm start", () => commandReceiptReason(record, (result) => result.command?.startsWith("ocm start "))],
    ["service collector", () => collectorReceiptReason(record, "post-start", "service")],
    ["ocm status", () => commandReceiptReason(record, (result) => result.command === "ocm @{env} -- status" || result.command?.includes(" -- status"))],
    ["ocm plugins list", () => commandReceiptReason(record, (result) => result.command === "ocm @{env} -- plugins list" || result.command?.includes(" -- plugins list"))],
    ["logs collector", () => collectorReceiptReason(record, "startup-logs", "logs")]
  ];
  for (const [label, reason] of required) {
    const missing = reason();
    if (missing) {
      return `${label}: ${missing}`;
    }
  }
  return null;
}

function releaseStartupProvisionProof(record) {
  const result = findCommandResult(record, (candidate) => candidate.command?.startsWith("ocm start "));
  return {
    result,
    payload: parseJsonObject(result?.stdout)
  };
}

function releaseStartupBestServiceMetrics(record) {
  const services = [];
  for (const phase of record.phases ?? []) {
    if (phase.metrics?.service) {
      services.push(phase.metrics.service);
    }
  }
  if (record.finalMetrics?.service) {
    services.push(record.finalMetrics.service);
  }
  return services.find((service) => typeof service.runtimeReleaseVersion === "string" && service.runtimeReleaseVersion.length > 0) ??
    services.find((service) => service.gatewayState || service.gatewayPort || service.runtimeReleaseChannel) ??
    null;
}

function releaseStartupBindingOk(service, provision) {
  return typeof service?.runtimeReleaseVersion === "string" &&
    service.runtimeReleaseVersion.length > 0 &&
    (typeof service.runtimeReleaseChannel === "string" || typeof provision?.payload?.defaultRuntime === "string") &&
    (nonNegativeNumber(service.gatewayPort) || nonNegativeNumber(provision?.payload?.gatewayPort));
}

function releaseStartupBindingReason(service, provision) {
  if (!service) {
    return "service metrics were not captured";
  }
  if (typeof service.runtimeReleaseVersion !== "string" || service.runtimeReleaseVersion.length === 0) {
    return "runtime release version was not captured";
  }
  if (typeof service.runtimeReleaseChannel !== "string" && typeof provision?.payload?.defaultRuntime !== "string") {
    return "runtime binding/channel was not captured";
  }
  if (!nonNegativeNumber(service.gatewayPort) && !nonNegativeNumber(provision?.payload?.gatewayPort)) {
    return "gateway port was not captured";
  }
  return null;
}

function releaseStartupHealthOk(record, health) {
  return health?.readiness?.classification === "ready" &&
    Number.isFinite(health.readiness.healthReadyAtMs) &&
    (health.postReadySamples?.count ?? 0) > 0 &&
    (health.postReadySamples?.failureCount ?? 0) === 0 &&
    (health.final?.failureCount ?? 0) === 0 &&
    record.measurements?.finalGatewayState === "running";
}

function releaseStartupHealthMissing(record, health) {
  return !health?.readiness ||
    !Number.isFinite(health.readiness.healthReadyAtMs) ||
    (health.postReadySamples?.count ?? 0) <= 0 ||
    record.measurements?.finalGatewayState === undefined;
}

function releaseStartupHealthReason(record, health) {
  if (!health?.readiness) {
    return "readiness measurement was not collected";
  }
  if (health.readiness.classification !== "ready") {
    return `readiness classification was ${health.readiness.classification ?? "missing"}`;
  }
  if (!Number.isFinite(health.readiness.healthReadyAtMs)) {
    return "readiness health-ready timing was not collected";
  }
  if ((health.postReadySamples?.count ?? 0) <= 0) {
    return "post-ready health samples were not collected";
  }
  if ((health.postReadySamples?.failureCount ?? 0) !== 0) {
    return `post-ready health failures were ${health.postReadySamples.failureCount}`;
  }
  if ((health.final?.failureCount ?? 0) !== 0) {
    return `final health failures were ${health.final.failureCount}`;
  }
  if (record.measurements?.finalGatewayState !== "running") {
    return `final gateway state was ${record.measurements?.finalGatewayState ?? "missing"}`;
  }
  return null;
}

function releaseStartupCommandUsabilityOk(statusResult, pluginsListResult, measurements) {
  return statusResult?.status === 0 &&
    pluginsListResult?.status === 0 &&
    nonNegativeNumber(measurements?.statusMs) &&
    nonNegativeNumber(measurements?.pluginsListMs);
}

function releaseStartupCommandUsabilityReason(statusResult, pluginsListResult, measurements) {
  if (!statusResult) {
    return "OpenClaw status command receipt was not captured";
  }
  if (statusResult.status !== 0) {
    return `OpenClaw status command exited ${statusResult.status}`;
  }
  if (!pluginsListResult) {
    return "plugin list command receipt was not captured";
  }
  if (pluginsListResult.status !== 0) {
    return `plugin list command exited ${pluginsListResult.status}`;
  }
  if (!nonNegativeNumber(measurements?.statusMs)) {
    return "status command latency was not measured";
  }
  if (!nonNegativeNumber(measurements?.pluginsListMs)) {
    return "plugin list command latency was not measured";
  }
  return null;
}

function releaseStartupResourceOk(measurements) {
  const gatewayRole = measurements?.resourceByRole?.gateway;
  return (measurements?.resourceSampleCount ?? 0) > 0 &&
    Array.isArray(measurements?.resourceSampleArtifacts) &&
    measurements.resourceSampleArtifacts.length > 0 &&
    nonNegativeNumber(gatewayRole?.peakRssMb);
}

function releaseStartupResourceReason(measurements) {
  if ((measurements?.resourceSampleCount ?? 0) <= 0) {
    return "resource samples were not collected";
  }
  if (!Array.isArray(measurements?.resourceSampleArtifacts) || measurements.resourceSampleArtifacts.length === 0) {
    return "resource sample artifact path was not recorded";
  }
  if (!nonNegativeNumber(measurements?.resourceByRole?.gateway?.peakRssMb)) {
    return "gateway role resource measurements were not captured";
  }
  return null;
}

function releaseStartupTimelineOk(measurements) {
  return measurements?.openclawTimelineAvailable === true &&
    (measurements.openclawTimelineEventCount ?? 0) > 0 &&
    (measurements.openclawTimelineParseErrors ?? 0) === 0 &&
    Array.isArray(measurements.openclawTimelineArtifacts) &&
    measurements.openclawTimelineArtifacts.length > 0;
}

function releaseStartupTimelineReason(measurements) {
  if (measurements?.openclawTimelineAvailable !== true) {
    return "OpenClaw diagnostic timeline was not available";
  }
  if ((measurements.openclawTimelineEventCount ?? 0) <= 0) {
    return "OpenClaw diagnostic timeline had no events";
  }
  if ((measurements.openclawTimelineParseErrors ?? 0) !== 0) {
    return `OpenClaw diagnostic timeline parse errors were ${measurements.openclawTimelineParseErrors}`;
  }
  if (!Array.isArray(measurements.openclawTimelineArtifacts) || measurements.openclawTimelineArtifacts.length === 0) {
    return "OpenClaw diagnostic timeline artifact path was not recorded";
  }
  return null;
}

function releaseStartupLogsProof(record, phaseId) {
  const command = findCommandResultInPhase(record, phaseId, (result) => result.command?.startsWith("ocm logs "));
  if (command) {
    return { kind: "command", command };
  }
  const phase = findPhase(record, phaseId);
  return {
    kind: "collector",
    receipt: collectorReceiptInPhase(record, phaseId, "logs"),
    metrics: phase?.metrics?.logs ?? null
  };
}

function releaseStartupLogsOk(proof) {
  if (proof && !proof.kind && proof.status !== undefined) {
    return proof.status === 0 && `${proof.stdout ?? ""}${proof.stderr ?? ""}`.trim().length > 0;
  }
  if (proof?.kind === "command") {
    return proof.command?.status === 0 && `${proof.command.stdout ?? ""}${proof.command.stderr ?? ""}`.trim().length > 0;
  }
  return proof?.receipt?.status === "PASS" &&
    proof.metrics?.commandStatus === 0 &&
    Array.isArray(proof.metrics?.artifacts) &&
    proof.metrics.artifacts.length > 0;
}

function releaseStartupLogsReason(proof) {
  if (!proof) {
    return "startup logs evidence was not captured";
  }
  if (!proof.kind && proof.status !== undefined) {
    if (proof.status !== 0) {
      return `startup logs command exited ${proof.status}`;
    }
    if (`${proof.stdout ?? ""}${proof.stderr ?? ""}`.trim().length === 0) {
      return "startup logs command emitted no output";
    }
    return null;
  }
  if (proof.kind === "command") {
    if (proof.command.status !== 0) {
      return `startup logs command exited ${proof.command.status}`;
    }
    if (`${proof.command.stdout ?? ""}${proof.command.stderr ?? ""}`.trim().length === 0) {
      return "startup logs command emitted no output";
    }
    return null;
  }
  if (!proof.receipt) {
    return "startup logs collector receipt was not captured";
  }
  if (proof.receipt.status !== "PASS") {
    return `startup logs collector status was ${proof.receipt.status}`;
  }
  if (proof.metrics?.commandStatus !== 0) {
    return `startup logs collector command status was ${proof.metrics?.commandStatus ?? "missing"}`;
  }
  if (!Array.isArray(proof.metrics?.artifacts) || proof.metrics.artifacts.length === 0) {
    return "startup logs collector artifact path was not recorded";
  }
  return null;
}

function releaseStartupLogArtifactPath(record) {
  for (const metrics of collectRecordMetricObjects(record)) {
    const artifact = metrics.logs?.artifacts?.[0];
    if (artifact) {
      return artifact;
    }
  }
  return null;
}

export function buildGatewaySessionEvidenceInvariants(record, scenario = {}) {
  if (record.status === "DRY-RUN" || record.status === "SKIPPED") {
    return [];
  }

  const turns = collectGatewaySessionTurnResults(record);
  const expectedTurnCount = scenario.id === "gateway-session-send-turn" ? 2 : Math.max(1, turns.length);
  const health = record.measurements?.health ?? {};
  const providerEvidence = record.providerEvidence ?? {};
  const agentTurns = record.measurements?.agentTurns ?? [];
  const providerArtifacts = Array.isArray(providerEvidence.artifacts) ? providerEvidence.artifacts : [];
  const missingDependencyErrors = record.measurements?.missingDependencyErrors;
  const pluginLoadFailures = record.measurements?.pluginLoadFailures;

  return [
    {
      id: "gateway-session-turn-json-captured",
      phaseId: "gateway-session-send-turn",
      required: true,
      status: turns.length >= expectedTurnCount && turns.every((turn) => turn.result?.status === 0 && turn.payload)
        ? "passed"
        : "missing",
      summary: "cold/warm Gateway session helper command JSON was captured",
      artifactPath: null,
      reason: turns.length >= expectedTurnCount
        ? missingGatewaySessionPayloadReason(turns)
        : `expected at least ${expectedTurnCount} Gateway session turn result(s), found ${turns.length}`
    },
    {
      id: "gateway-session-direct-rpc-transport",
      phaseId: "gateway-session-send-turn",
      required: true,
      status: turns.length >= expectedTurnCount && turns.every((turn) => turn.payload?.gatewayTransport?.kind === "direct-gateway-rpc")
        ? "passed"
        : "failed",
      summary: "Gateway session sends used direct Gateway RPC transport",
      artifactPath: null,
      reason: gatewaySessionTransportReason(turns)
    },
    {
      id: "gateway-session-response-content",
      phaseId: "gateway-session-send-turn",
      required: true,
      status: turns.length >= expectedTurnCount && turns.every((turn) => gatewaySessionResponseOk(turn.payload))
        ? "passed"
        : "failed",
      summary: "Gateway session turns produced the expected assistant marker and assistant-count evidence",
      artifactPath: null,
      reason: gatewaySessionResponseReason(turns)
    },
    {
      id: "gateway-session-latency-windows",
      phaseId: "gateway-session-send-turn",
      required: true,
      status: turns.length >= expectedTurnCount && turns.every((turn) => gatewaySessionLatencyOk(turn.payload))
        ? "passed"
        : "missing",
      summary: "Gateway session active-turn and response latency windows were measured",
      artifactPath: null,
      reason: gatewaySessionLatencyReason(turns)
    },
    {
      id: "gateway-session-provider-proof",
      phaseId: "gateway-session-send-turn",
      required: true,
      status: providerProofOk(providerEvidence, agentTurns, expectedTurnCount) ? "passed" : "missing",
      summary: "provider request/response evidence was captured and attributed to every Gateway session turn",
      artifactPath: providerEvidence.summaryPath ?? providerArtifacts[0] ?? null,
      reason: providerProofReason(providerEvidence, agentTurns, expectedTurnCount)
    },
    {
      id: "gateway-session-readiness-health-proof",
      phaseId: "gateway-start",
      required: true,
      status: gatewaySessionHealthOk(record, health) ? "passed" : "missing",
      summary: "Gateway readiness, post-ready health, and final service state were measured",
      artifactPath: null,
      reason: gatewaySessionHealthReason(record, health)
    },
    zeroCountInvariant({
      id: "gateway-session-no-missing-runtime-dependency-errors",
      summary: "gateway logs and command output contain no missing runtime dependency errors",
      actual: missingDependencyErrors,
      metric: "missingDependencyErrors",
      phaseId: "post-gateway-session-health"
    }),
    zeroCountInvariant({
      id: "gateway-session-no-plugin-load-failures",
      summary: "gateway logs contain no plugin load failures",
      actual: pluginLoadFailures,
      metric: "pluginLoadFailures",
      phaseId: "post-gateway-session-health"
    })
  ];
}

function collectGatewaySessionTurnResults(record) {
  const turns = [];
  for (const phase of record.phases ?? []) {
    for (const result of phase.results ?? []) {
      if (!result?.command?.includes("run-gateway-session-send-turn.mjs")) {
        continue;
      }
      turns.push({
        phaseId: phase.id,
        result,
        payload: parseJsonObject(result.stdout)
      });
    }
  }
  return turns;
}

function missingGatewaySessionPayloadReason(turns) {
  const bad = turns.find((turn) => turn.result?.status !== 0 || !turn.payload);
  if (!bad) {
    return null;
  }
  if (bad.result?.status !== 0) {
    return `${bad.phaseId} command exited ${bad.result?.status ?? "unknown"}`;
  }
  return `${bad.phaseId} did not emit parseable JSON`;
}

function gatewaySessionTransportReason(turns) {
  const bad = turns.find((turn) => turn.payload?.gatewayTransport?.kind !== "direct-gateway-rpc");
  if (!bad) {
    return null;
  }
  const transport = bad.payload?.gatewayTransport?.kind ?? "missing";
  const fallbackReason = bad.payload?.gatewayTransport?.fallbackReason;
  return `${bad.phaseId} used ${transport}${fallbackReason ? ` (${fallbackReason})` : ""}`;
}

function gatewaySessionResponseOk(payload) {
  if (!payload || payload.ok !== true || payload.expectedTextPresent !== true) {
    return false;
  }
  const assistantCount = numberOrNull(payload.assistantMessageCount);
  const minAssistantCount = numberOrNull(payload.minAssistantCount);
  return typeof payload.finalAssistantVisibleText === "string" &&
    payload.finalAssistantVisibleText.length > 0 &&
    assistantCount !== null &&
    minAssistantCount !== null &&
    assistantCount >= minAssistantCount;
}

function gatewaySessionResponseReason(turns) {
  const bad = turns.find((turn) => !gatewaySessionResponseOk(turn.payload));
  if (!bad) {
    return null;
  }
  if (!bad.payload) {
    return `${bad.phaseId} JSON payload was missing`;
  }
  if (bad.payload.ok !== true) {
    return `${bad.phaseId} payload ok was not true`;
  }
  if (bad.payload.expectedTextPresent !== true) {
    return `${bad.phaseId} did not report expected text present`;
  }
  const assistantCount = numberOrNull(bad.payload.assistantMessageCount);
  const minAssistantCount = numberOrNull(bad.payload.minAssistantCount);
  if (assistantCount === null || minAssistantCount === null || assistantCount < minAssistantCount) {
    return `${bad.phaseId} assistant count ${assistantCount ?? "missing"} was below required ${minAssistantCount ?? "missing"}`;
  }
  return `${bad.phaseId} final assistant text was missing`;
}

function gatewaySessionLatencyOk(payload) {
  return payload &&
    nonNegativeNumber(payload.activeTurnMs) &&
    nonNegativeNumber(payload.sendDurationMs) &&
    nonNegativeNumber(payload.timeToMatchedAssistantMs) &&
    nonNegativeNumber(payload.historyPollCount) &&
    numberOrNull(payload.historyErrorCount) === 0;
}

function gatewaySessionLatencyReason(turns) {
  const bad = turns.find((turn) => !gatewaySessionLatencyOk(turn.payload));
  if (!bad) {
    return null;
  }
  if (!bad.payload) {
    return `${bad.phaseId} JSON payload was missing`;
  }
  const missing = ["activeTurnMs", "sendDurationMs", "timeToMatchedAssistantMs", "historyPollCount"]
    .filter((key) => !nonNegativeNumber(bad.payload[key]));
  if (missing.length > 0) {
    return `${bad.phaseId} missing latency field(s): ${missing.join(", ")}`;
  }
  return `${bad.phaseId} historyErrorCount was ${bad.payload.historyErrorCount ?? "missing"}`;
}

function providerProofOk(providerEvidence, agentTurns, expectedTurnCount) {
  if (providerEvidence?.available !== true || providerEvidence.requestCount < expectedTurnCount) {
    return false;
  }
  const gatewayTurns = agentTurns.filter((turn) => turn.gatewaySession);
  if (gatewayTurns.length < expectedTurnCount) {
    return false;
  }
  return gatewayTurns.every((turn) =>
    turn.missingProviderRequest === false &&
    (turn.requestCount ?? 0) > 0 &&
    turn.providerAfterCommandEnd !== true &&
    turn.providerStatuses.every((status) => !Number.isFinite(Number(status.value)) || Number(status.value) < 400)
  );
}

function providerProofReason(providerEvidence, agentTurns, expectedTurnCount) {
  if (providerEvidence?.available !== true) {
    return providerEvidence?.error ?? "provider evidence was not available";
  }
  if (providerEvidence.requestCount < expectedTurnCount) {
    return `provider request count ${providerEvidence.requestCount ?? 0} was below required ${expectedTurnCount}`;
  }
  const gatewayTurns = agentTurns.filter((turn) => turn.gatewaySession);
  if (gatewayTurns.length < expectedTurnCount) {
    return `agent turn attribution count ${gatewayTurns.length} was below required ${expectedTurnCount}`;
  }
  const missing = gatewayTurns.find((turn) => turn.missingProviderRequest === true || (turn.requestCount ?? 0) === 0);
  if (missing) {
    return `${missing.phaseId} had no attributed provider request`;
  }
  const late = gatewayTurns.find((turn) => turn.providerAfterCommandEnd === true);
  if (late) {
    return `${late.phaseId} provider request arrived after command window by ${late.providerLateByMs ?? "unknown"}ms`;
  }
  const failedStatus = gatewayTurns.find((turn) =>
    turn.providerStatuses.some((status) => Number.isFinite(Number(status.value)) && Number(status.value) >= 400)
  );
  if (failedStatus) {
    return `${failedStatus.phaseId} had provider HTTP error status evidence`;
  }
  return null;
}

function gatewaySessionHealthOk(record, health) {
  return health?.readiness?.classification === "ready" &&
    Number.isFinite(health.readiness.healthReadyAtMs) &&
    (health.postReadySamples?.count ?? 0) > 0 &&
    (health.postReadySamples?.failureCount ?? 0) === 0 &&
    (health.final?.failureCount ?? 0) === 0 &&
    record.measurements?.finalGatewayState === "running";
}

function gatewaySessionHealthReason(record, health) {
  if (!health?.readiness) {
    return "readiness measurement was not collected";
  }
  if (health.readiness.classification !== "ready") {
    return `readiness classification was ${health.readiness.classification ?? "missing"}`;
  }
  if (!Number.isFinite(health.readiness.healthReadyAtMs)) {
    return "readiness health-ready timing was not collected";
  }
  if ((health.postReadySamples?.count ?? 0) <= 0) {
    return "post-ready health samples were not collected";
  }
  if ((health.postReadySamples?.failureCount ?? 0) !== 0) {
    return `post-ready health failures were ${health.postReadySamples.failureCount}`;
  }
  if ((health.final?.failureCount ?? 0) !== 0) {
    return `final health failures were ${health.final.failureCount}`;
  }
  if (record.measurements?.finalGatewayState !== "running") {
    return `final gateway state was ${record.measurements?.finalGatewayState ?? "missing"}`;
  }
  return null;
}

export function buildUpgradeLogDerivedInvariants(record) {
  if (record.status === "DRY-RUN" || record.status === "SKIPPED") {
    return [];
  }

  const missingDependencyErrors = record.measurements?.missingDependencyErrors;
  const pluginLoadFailures = record.measurements?.pluginLoadFailures;
  const doctor = findCommandResult(record, (result) => result.command?.includes(" -- doctor"));

  return [
    zeroCountInvariant({
      id: "no-missing-runtime-dependency-errors",
      summary: "gateway logs and command output contain no missing runtime dependency errors",
      actual: missingDependencyErrors,
      metric: "missingDependencyErrors"
    }),
    zeroCountInvariant({
      id: "no-plugin-load-failures",
      summary: "gateway logs contain no plugin load failures",
      actual: pluginLoadFailures,
      metric: "pluginLoadFailures"
    }),
    {
      id: "doctor-output-captured",
      phaseId: doctor?.phaseId ?? "post-upgrade",
      required: true,
      status: doctorOutputStatus(doctor),
      summary: "post-upgrade doctor output was captured for interpretation",
      artifactPath: null,
      reason: doctorOutputReason(doctor)
    }
  ];
}

function zeroCountInvariant({ id, summary, actual, metric, phaseId = "post-upgrade" }) {
  if (!Number.isFinite(actual)) {
    return {
      id,
      phaseId,
      required: true,
      status: "missing",
      summary,
      artifactPath: null,
      reason: `${metric} measurement was not collected`
    };
  }
  return {
    id,
    phaseId,
    required: true,
    status: actual === 0 ? "passed" : "failed",
    summary,
    artifactPath: null,
    reason: actual === 0 ? null : `${metric} was ${actual}`
  };
}

function doctorOutputStatus(result) {
  if (!result) {
    return "missing";
  }
  if (result.status !== 0) {
    return "failed";
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return output.length > 0 ? "passed" : "missing";
}

function doctorOutputReason(result) {
  if (!result) {
    return "doctor command result was not recorded";
  }
  if (result.status !== 0) {
    return `doctor command exited ${result.status}`;
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return output.length > 0 ? null : "doctor command produced no captured output";
}

export function attachCleanupEvidence(record) {
  if (record.status === "DRY-RUN" || record.status === "SKIPPED") {
    return record;
  }
  const retainedByRequest = record.cleanup === "retained" && record.retainedReason === "keep-env";
  if (retainedByRequest) {
    record.cleanupEvidence = [{
      id: "env-cleanup",
      required: false,
      status: "skipped",
      phaseId: "env-cleanup",
      summary: "disposable Kova env cleanup was explicitly skipped by keep-env",
      reason: "keep-env requested"
    }];
    return record;
  }

  const cleanupStatus = cleanupEvidenceStatus(record.cleanup);
  record.cleanupEvidence = [{
    id: "env-cleanup",
    required: true,
    status: cleanupStatus,
    phaseId: "env-cleanup",
    summary: "disposable Kova env cleanup completed or was explicitly accounted for",
    reason: cleanupEvidenceReason(record.cleanup)
  }];
  return record;
}

function cleanupEvidenceStatus(cleanup) {
  if (["destroyed", "already-absent", "not-needed"].includes(cleanup)) {
    return "passed";
  }
  if (cleanup === "destroy-failed") {
    return "failed";
  }
  return "missing";
}

function cleanupEvidenceReason(cleanup) {
  if (["destroyed", "already-absent", "not-needed"].includes(cleanup)) {
    return null;
  }
  if (cleanup === "destroy-failed") {
    return "env destroy command failed";
  }
  return "cleanup result was not recorded";
}

export async function attachEvidenceArtifactBudget(record) {
  if (record.status === "DRY-RUN" || record.status === "SKIPPED") {
    return record;
  }
  const maxBytes = 5 * 1024 * 1024;
  const phaseArtifactPaths = (record.phases ?? [])
    .flatMap((phase) => phase.results ?? [])
    .map((result) => result.evidenceArtifactPath)
    .filter(Boolean);
  const providerArtifactPaths = Array.isArray(record.providerEvidence?.artifacts)
    ? record.providerEvidence.artifacts.filter(Boolean)
    : [];
  const metricArtifactPaths = collectEvidenceMetricArtifactPaths(record);
  const paths = [...new Set([...phaseArtifactPaths, ...providerArtifactPaths, ...metricArtifactPaths])];
  let totalBytes = 0;
  let missingCount = 0;
  const artifacts = [];
  for (const path of paths) {
    try {
      const stats = await stat(path);
      totalBytes += stats.size;
      artifacts.push({ path, bytes: stats.size });
    } catch {
      missingCount += 1;
      artifacts.push({ path, bytes: null });
    }
  }

  record.evidenceArtifactBudget = {
    schemaVersion: "kova.evidenceArtifactBudget.v1",
    maxBytes,
    totalBytes,
    artifactCount: paths.length,
    missingCount,
    exceeded: totalBytes > maxBytes,
    artifacts: artifacts.slice(0, 20)
  };
  record.evidenceArtifacts = [{
    id: "record-budget",
    required: true,
    status: totalBytes <= maxBytes && missingCount === 0 ? "passed" : "failed",
    summary: "total retained evidence artifact bytes stay within the per-record cap",
    artifactPath: null,
    reason: artifactBudgetReason({ totalBytes, maxBytes, missingCount })
  }];
  return record;
}

function collectEvidenceMetricArtifactPaths(record) {
  const paths = [];
  for (const metrics of collectRecordMetricObjects(record)) {
    paths.push(...artifactPathArray(metrics.logs?.artifacts));
    paths.push(...artifactPathArray(metrics.timeline?.artifacts));
    paths.push(...artifactPathArray(metrics.timeline?.timelineArtifacts));
  }
  paths.push(...artifactPathArray(record.measurements?.resourceSampleArtifacts));
  paths.push(...artifactPathArray(record.measurements?.openclawTimelineArtifacts));
  paths.push(...artifactPathArray([record.measurements?.officialPluginEvidence?.artifactPath]));
  for (const run of record.measurements?.officialPluginEvidence?.runs ?? []) {
    paths.push(...artifactPathArray([run.artifactPath]));
  }
  return paths;
}

function collectRecordMetricObjects(record) {
  const metrics = [];
  for (const phase of record.phases ?? []) {
    if (phase.metrics) {
      metrics.push(phase.metrics);
    }
  }
  if (record.finalMetrics) {
    metrics.push(record.finalMetrics);
  }
  return metrics;
}

function artifactPathArray(value) {
  return Array.isArray(value) ? value.filter((path) => typeof path === "string" && path.length > 0) : [];
}

function artifactBudgetReason({ totalBytes, maxBytes, missingCount }) {
  if (missingCount > 0) {
    return `${missingCount} evidence artifact path(s) could not be statted`;
  }
  if (totalBytes > maxBytes) {
    return `evidence artifacts used ${totalBytes} bytes over cap ${maxBytes}`;
  }
  return null;
}

export function buildUpgradeStateSnapshotInvariants(record) {
  if (record.status === "DRY-RUN" || record.status === "SKIPPED") {
    return [];
  }

  const pre = findSnapshotResult(record, "snapshot:pre-upgrade-state");
  const post = findSnapshotResult(record, "snapshot:post-upgrade-state");
  const invariants = [];

  invariants.push({
    id: "upgrade-state-snapshots-present",
    phaseId: "evidence-post-upgrade-snapshots",
    required: true,
    status: pre?.snapshot && post?.snapshot ? "passed" : "missing",
    summary: "pre-upgrade and post-upgrade OpenClaw state snapshots were collected",
    artifactPath: post?.evidenceArtifactPath ?? pre?.evidenceArtifactPath ?? null,
    reason: pre?.snapshot && post?.snapshot ? null : "required upgrade state snapshot result was not recorded"
  });

  if (!pre?.snapshot || !post?.snapshot) {
    return invariants;
  }

  invariants.push(compareSnapshotCountInvariant({
    id: "plugin-install-index-preserved",
    phaseId: "evidence-post-upgrade-snapshots",
    summary: "plugin install index evidence is preserved across upgrade",
    before: pre.snapshot.pluginInstallIndexCount,
    after: post.snapshot.pluginInstallIndexCount,
    artifactPath: post.evidenceArtifactPath
  }));
  invariants.push(compareSnapshotCountInvariant({
    id: "plugin-directory-count-not-decreased",
    phaseId: "evidence-post-upgrade-snapshots",
    summary: "plugin directory evidence does not disappear across upgrade",
    before: pre.snapshot.pluginDirCount,
    after: post.snapshot.pluginDirCount,
    artifactPath: post.evidenceArtifactPath
  }));
  invariants.push(compareSnapshotSetInvariant({
    id: "provider-ids-preserved",
    phaseId: "evidence-post-upgrade-snapshots",
    summary: "provider ids present before upgrade remain present after upgrade",
    before: unionStrings(pre.snapshot.auth?.providerIds, pre.snapshot.models?.providerIds),
    after: unionStrings(post.snapshot.auth?.providerIds, post.snapshot.models?.providerIds),
    artifactPath: post.evidenceArtifactPath
  }));
  invariants.push(compareSnapshotSetInvariant({
    id: "model-ids-preserved",
    phaseId: "evidence-post-upgrade-snapshots",
    summary: "model ids present before upgrade remain present after upgrade",
    before: pre.snapshot.models?.modelIds,
    after: post.snapshot.models?.modelIds,
    artifactPath: post.evidenceArtifactPath
  }));
  invariants.push(compareSnapshotSetInvariant({
    id: "auth-method-shape-preserved",
    phaseId: "evidence-post-upgrade-snapshots",
    summary: "auth method shape present before upgrade remains present after upgrade",
    before: pre.snapshot.auth?.authMethodShapes,
    after: post.snapshot.auth?.authMethodShapes,
    artifactPath: post.evidenceArtifactPath
  }));
  invariants.push(compareSnapshotSetInvariant({
    id: "installed-plugin-ids-preserved",
    phaseId: "evidence-post-upgrade-snapshots",
    summary: "installed plugin ids present before upgrade remain present after upgrade",
    before: pre.snapshot.installedPluginIds,
    after: post.snapshot.installedPluginIds,
    artifactPath: post.evidenceArtifactPath
  }));
  invariants.push(compareSnapshotSetInvariant({
    id: "workspace-roots-preserved",
    phaseId: "evidence-post-upgrade-snapshots",
    summary: "workspace root fingerprints present before upgrade remain present after upgrade",
    before: pre.snapshot.workspace?.rootHashes,
    after: post.snapshot.workspace?.rootHashes,
    artifactPath: post.evidenceArtifactPath
  }));
  invariants.push(compareSnapshotEqualityInvariant({
    id: "runtime-target-kind-stable",
    phaseId: "evidence-post-upgrade-snapshots",
    summary: "runtime target kind remains stable across upgrade",
    before: pre.snapshot.runtime?.targetKind,
    after: post.snapshot.runtime?.targetKind,
    artifactPath: post.evidenceArtifactPath
  }));
  invariants.push(compareSnapshotEqualityInvariant({
    id: "local-build-target-hash-stable",
    phaseId: "evidence-post-upgrade-snapshots",
    summary: "local-build target path fingerprint remains stable across upgrade",
    before: pre.snapshot.runtime?.targetValueHash,
    after: post.snapshot.runtime?.targetValueHash,
    artifactPath: post.evidenceArtifactPath,
    optionalWhenMissing: true
  }));
  invariants.push(compareSnapshotEqualityInvariant({
    id: "service-desired-state-preserved",
    phaseId: "evidence-post-upgrade-snapshots",
    summary: "service desired state remains stable across upgrade",
    before: pre.snapshot.service?.desired,
    after: post.snapshot.service?.desired,
    artifactPath: post.evidenceArtifactPath,
    optionalWhenMissing: true
  }));
  invariants.push(compareSnapshotEqualityInvariant({
    id: "service-running-state-preserved",
    phaseId: "evidence-post-upgrade-snapshots",
    summary: "service running state remains stable across upgrade while pid and restart metadata may change",
    before: pre.snapshot.service?.state,
    after: post.snapshot.service?.state,
    artifactPath: post.evidenceArtifactPath,
    optionalWhenMissing: true
  }));
  invariants.push(compareSnapshotEqualityInvariant({
    id: "service-readiness-preserved",
    phaseId: "evidence-post-upgrade-snapshots",
    summary: "service readiness remains stable across upgrade while pid and restart metadata may change",
    before: pre.snapshot.service?.readiness,
    after: post.snapshot.service?.readiness,
    artifactPath: post.evidenceArtifactPath,
    optionalWhenMissing: true
  }));

  return invariants;
}

function compareSnapshotSetInvariant({ id, phaseId, summary, before, after, artifactPath }) {
  const beforeValues = sortedUnique(before ?? []);
  const afterValues = new Set(sortedUnique(after ?? []));
  const missing = beforeValues.filter((value) => !afterValues.has(value));
  return {
    id,
    phaseId,
    required: true,
    status: missing.length === 0 ? "passed" : "failed",
    summary,
    artifactPath,
    reason: missing.length === 0 ? null : `missing after upgrade: ${missing.slice(0, 5).join(", ")}`
  };
}

function compareSnapshotEqualityInvariant({ id, phaseId, summary, before, after, artifactPath, optionalWhenMissing = false }) {
  if (optionalWhenMissing && (before === null || before === undefined) && (after === null || after === undefined)) {
    return {
      id,
      phaseId,
      required: true,
      status: "passed",
      summary,
      artifactPath,
      reason: null
    };
  }
  const status = before === after ? "passed" : "failed";
  return {
    id,
    phaseId,
    required: true,
    status,
    summary,
    artifactPath,
    reason: status === "passed" ? null : `changed from ${before ?? "missing"} to ${after ?? "missing"}`
  };
}

function sortedUnique(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === "string" && value.length > 0))].sort();
}

function parseJsonObject(text) {
  try {
    const parsed = JSON.parse(String(text ?? "").trim());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value) {
  const parsed = numberOrNull(value);
  return parsed !== null && parsed >= 0;
}

function unionStrings(...groups) {
  return sortedUnique(groups.flatMap((group) => group ?? []));
}

function compareSnapshotCountInvariant({ id, phaseId, summary, before, after, artifactPath }) {
  const beforeCount = Number.isFinite(before) ? before : 0;
  const afterCount = Number.isFinite(after) ? after : 0;
  const status = beforeCount <= afterCount ? "passed" : "failed";
  return {
    id,
    phaseId,
    required: true,
    status,
    summary,
    artifactPath,
    reason: status === "passed" ? null : `count decreased from ${beforeCount} to ${afterCount}`
  };
}

function findSnapshotResult(record, evidenceId) {
  for (const phase of record.phases ?? []) {
    for (const result of phase.results ?? []) {
      if (result.evidenceId === evidenceId) {
        return result;
      }
    }
  }
  return null;
}

function findCommandResult(record, predicate) {
  for (const phase of record.phases ?? []) {
    for (const result of phase.results ?? []) {
      if (predicate(result)) {
        return {
          ...result,
          phaseId: phase.id
        };
      }
    }
  }
  return null;
}

function findCommandResultInPhase(record, phaseId, predicate) {
  const phase = findPhase(record, phaseId);
  if (!phase) {
    return null;
  }
  for (const result of phase.results ?? []) {
    if (predicate(result)) {
      return {
        ...result,
        phaseId: phase.id
      };
    }
  }
  return null;
}

function findPhase(record, phaseId) {
  return (record.phases ?? []).find((candidate) => candidate.id === phaseId) ?? null;
}

function commandReceiptOk(record, predicate) {
  const result = findCommandResult(record, predicate);
  return result?.status === 0 && result.durationMs !== undefined;
}

function commandReceiptReason(record, predicate) {
  const result = findCommandResult(record, predicate);
  if (!result) {
    return "command receipt was not captured";
  }
  if (result.status !== 0) {
    return `command exited ${result.status}`;
  }
  if (result.durationMs === undefined) {
    return "command duration was not captured";
  }
  return null;
}

function collectorReceiptInPhase(record, phaseId, collectorId) {
  const phase = findPhase(record, phaseId);
  return (phase?.metrics?.collectors ?? []).find((collector) => collector.id === collectorId) ?? null;
}

function collectorReceiptOk(record, phaseId, collectorId) {
  const receipt = collectorReceiptInPhase(record, phaseId, collectorId);
  return receipt?.status === "PASS" && receipt.durationMs !== undefined;
}

function collectorReceiptReason(record, phaseId, collectorId) {
  const receipt = collectorReceiptInPhase(record, phaseId, collectorId);
  if (!receipt) {
    return "collector receipt was not captured";
  }
  if (receipt.status !== "PASS") {
    return `collector status was ${receipt.status}`;
  }
  if (receipt.durationMs === undefined) {
    return "collector duration was not captured";
  }
  return null;
}
