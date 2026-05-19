import { resolveMatrixPlan } from "../matrix/plan-resolution.mjs";
import { profileSummary } from "../matrix/profile.mjs";
import { renderMatrixPlan } from "../reporting/render-matrix-plan.mjs";

export async function runMatrixPlan(flags) {
  const { profile, target, targetPlan, fromPlan, platform, entries, resolvedCoverage, controls } = await resolveMatrixPlan(flags);
  const targetSelector = targetPlan.selector ?? target;
  const fromSelector = fromPlan?.selector ?? flags.from ?? null;
  const response = {
    schemaVersion: "kova.matrix.plan.v1",
    generatedAt: new Date().toISOString(),
    platform,
    profile: profileSummary(profile),
    target: targetSelector,
    from: fromSelector,
    controls,
    resolvedCoverage,
    entries: entries.map((entry) => entry.plan)
  };

  if (flags.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  if (!flags.plain) {
    console.log(renderMatrixPlan(response, flags));
    return;
  }

  console.log(`${profile.id}: ${profile.title}`);
  console.log(`Target: ${targetSelector}`);
  if (fromSelector) {
    console.log(`From: ${fromSelector}`);
  }
  for (const entry of entries) {
    const suffix = entry.skipReason ? ` [SKIP: ${entry.skipReason}]` : "";
    console.log(`- ${entry.scenario.id} / ${entry.state.id}: ${entry.scenario.title}${suffix}`);
  }
}
