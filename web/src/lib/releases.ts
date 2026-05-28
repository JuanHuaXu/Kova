/**
 * Aggregations over the `releases` content collection. Centralized so pages
 * don't repeat sort/filter logic.
 *
 * Stable vs beta: public "latest" surfaces operate on stable releases only.
 * The releases list page surfaces betas in a dedicated grouped view. See
 * `release-flavor.ts` for the version-parsing helpers.
 */

import { getCollection } from "astro:content";
import type { Release, Scenario } from "../content.config";
import { isStable, isPreRelease } from "./release-flavor";

export async function allReleases(): Promise<Array<Release & { id: string }>> {
  const entries = await getCollection("releases");
  return entries
    .map((e) => ({ id: e.id, ...e.data }))
    .sort((a, b) => {
      const byDate = b.releaseDate.getTime() - a.releaseDate.getTime();
      if (byDate !== 0) return byDate;
      return b.ver.localeCompare(a.ver, undefined, { numeric: true, sensitivity: "base" });
    });
}

/** Stable releases only, newest first. */
export async function stableReleases(): Promise<Array<Release & { id: string }>> {
  return (await allReleases()).filter((r) => isStable(r.ver));
}

/** Pre-release (beta/rc/alpha) builds only, newest first. */
export async function betaReleases(): Promise<Array<Release & { id: string }>> {
  return (await allReleases()).filter((r) => isPreRelease(r.ver));
}

/**
 * Newest release with populated scenarios. Used by pages that need any
 * release record (e.g. the [version] detail page's "compare to current
 * latest"). Includes betas so a beta page can still reference itself.
 */
export async function latestRelease(): Promise<Release & { id: string }> {
  const all = await allReleases();
  const withScenarios = all.find((r) => r.scenarios && r.scenarios.length > 0);
  if (!withScenarios) {
    throw new Error("No release in src/content/releases has scenarios populated");
  }
  return withScenarios;
}

/**
 * Newest stable release, even if it is a history stub without detailed
 * scenarios. This is the only helper /latest should use; pre-releases must
 * not become the canonical latest target because stable data is incomplete.
 */
export async function latestStableRelease(): Promise<Release & { id: string }> {
  const stable = await stableReleases();
  const latest = stable[0];
  if (!latest) {
    throw new Error("No stable release found in web/src/content/releases");
  }
  return latest;
}

export function scenarioCounts(scenarios: Scenario[]) {
  let pass = 0, fail = 0, block = 0;
  for (const s of scenarios) {
    if (s.state === "pass") pass++;
    else if (s.state === "fail") fail++;
    else block++;
  }
  return { pass, fail, block, total: scenarios.length };
}
