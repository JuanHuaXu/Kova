import { collectEnvMetrics } from "../metrics.mjs";
import {
  normalizeMeasurementScope,
  phaseDriverKind,
  phaseResultStatus
} from "../measurement-contract.mjs";
import { runScenarioCommand } from "./command-executor.mjs";
import { metricOptions } from "./metric-options.mjs";

export async function executeAuthPhase(phase, context, envName, artifactDir, authPolicy) {
  if (!phase) {
    return null;
  }
  const results = [];
  for (const [commandIndex, command] of phase.commands.entries()) {
    results.push(await runScenarioCommand(command, context, envName, artifactDir, phase.id, commandIndex, authPolicy));
  }
  return {
    ...phase,
    measurementScope: normalizeMeasurementScope(phase.measurementScope, phase.id),
    driverKind: phaseDriverKind(phase),
    results,
    metrics: await collectEnvMetrics(envName, metricOptions(context, null, { id: phase.id }, artifactDir, {
      kind: "auth-phase",
      measurementScope: normalizeMeasurementScope(phase.measurementScope, phase.id),
      collectionIntent: phase.collectionIntent ?? null,
      resultStatus: phaseResultStatus(results)
    }))
  };
}
