import { collectEnvMetrics } from "../metrics.mjs";
import {
  normalizeMeasurementScope,
  phaseDriverKind,
  phaseResultStatus
} from "../measurement-contract.mjs";
import { metricOptions } from "./metric-options.mjs";
import {
  materializeLifecycleCommands,
  materializeLifecycleStepCommands
} from "./phase-commands.mjs";
import {
  stateLifecycleCollectionIntent,
  stateLifecycleCommandScope,
  stateLifecycleIntent,
  stateLifecycleTitle,
  stateStepMatchesPhase
} from "./phase-plan.mjs";
import { runScenarioCommand } from "./command-executor.mjs";

export async function executeStateSetupAfterPhase(context, envName, phaseId, scenario, artifactDir, authPolicy) {
  const steps = (context.state?.setup ?? []).filter((step) => stateStepMatchesPhase(step, phaseId));
  if (steps.length === 0) {
    return null;
  }

  return executeStateLifecycleSteps(context, envName, scenario, `state-${phaseId}`, steps, artifactDir, phaseId, authPolicy);
}

export async function executeStateLifecycleSteps(context, envName, scenario, kind, steps, artifactDir, phaseId = null, authPolicy = null) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return null;
  }

  const results = [];
  const { commands, evidence } = materializeLifecycleCommands(steps, context, envName, artifactDir);

  for (const step of steps) {
    const stepCommands = materializeLifecycleStepCommands(step, context, envName, artifactDir);
    for (const [commandIndex, command] of stepCommands.entries()) {
      results.push(await runScenarioCommand(command, context, envName, artifactDir, kind, commandIndex, authPolicy));
    }
  }

  return {
    id: kind,
    title: stateLifecycleTitle(context.state?.id, kind, phaseId),
    intent: stateLifecycleIntent(context.state?.id, kind, phaseId),
    measurementScope: normalizeMeasurementScope(null, kind),
    driverKind: phaseDriverKind(null, commands),
    commands,
    evidence,
    results,
    metrics: await collectEnvMetrics(envName, metricOptions(context, scenario, { id: phaseId }, artifactDir, {
      kind: "state-lifecycle",
      measurementScope: normalizeMeasurementScope(null, kind),
      lifecycleKind: kind,
      lifecycleCommandScope: stateLifecycleCommandScope(commands),
      collectionIntent: stateLifecycleCollectionIntent(steps),
      resultStatus: phaseResultStatus(results)
    }))
  };
}
