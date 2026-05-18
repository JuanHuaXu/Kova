import { join } from "node:path";
import { runCommand } from "../commands.mjs";
import { collectorArtifactDirs } from "../collectors/artifacts.mjs";
import { tagCommandResult } from "../measurement-contract.mjs";
import { targetSetupCommand } from "./phase-plan.mjs";

export async function executeTargetSetup(context, envName, artifactDir) {
  if (context.targetPlan.kind !== "local-build") {
    return [];
  }
  if (context.targetSetup?.completed) {
    return [];
  }

  const results = [
    tagCommandResult(await runCommand(targetSetupCommand(context.targetPlan), {
      timeoutMs: context.timeoutMs,
      env: { KOVA_ENV_NAME: envName },
      resourceSample: context.resourceSampling === false ? null : {
        envName,
        intervalMs: context.resourceSampleIntervalMs,
        processRoles: context.processRoles ?? [],
        artifactPath: join(collectorArtifactDirs(artifactDir).resourceSamples, "target-setup-1.jsonl")
      }
    }), "target-setup")
  ];
  if (results.every((result) => result.status === 0) && context.targetSetup) {
    context.targetSetup.completed = true;
  }
  return results;
}
