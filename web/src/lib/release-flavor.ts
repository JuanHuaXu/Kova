/**
 * Pre-release flavor helpers — pure functions over the version string.
 * Kova publishes any version with a SemVer pre-release suffix (anything
 * after the first `-`) as a "beta build" of an upcoming stable target.
 *
 *   2026.5.16-beta        → target 2026.5.16, iteration "beta"
 *   2026.5.16-beta.7      → target 2026.5.16, iteration "beta.7"
 *   2026.6.1-rc.1         → target 2026.6.1,  iteration "rc.1"
 *
 * The UI uses the umbrella label "beta" for all pre-release flavors per
 * product decision — if/when we start shipping a distinct rc cadence we
 * can revisit the label without changing the schema.
 */

export function isPreRelease(ver: string): boolean {
  return ver.includes("-");
}

export function isStable(ver: string): boolean {
  return !isPreRelease(ver);
}

/** Stable target this pre-release rolls up to. For a stable, returns itself. */
export function betaTarget(ver: string): string {
  const dash = ver.indexOf("-");
  return dash === -1 ? ver : ver.slice(0, dash);
}

/** Suffix after the first dash, e.g. "beta.7". Empty string for a stable. */
export function betaIteration(ver: string): string {
  const dash = ver.indexOf("-");
  return dash === -1 ? "" : ver.slice(dash + 1);
}

export type BetaGroupState = "upcoming" | "shipped" | "skipped";

/**
 * Decide a beta group's lifecycle state given the universe of stable
 * versions Kova has published.
 *
 *   shipped    — a stable matching the target exists.
 *   skipped    — no matching stable, but a LATER stable target exists
 *                in the catalogue (we moved on without shipping this one).
 *   upcoming   — no matching stable and no later target shipped yet.
 *
 * "Later" is decided by natural numeric SemVer compare on the target
 * string itself (year.month.patch style works under localeCompare with
 * `numeric: true`).
 */
export function betaGroupState(
  target: string,
  stableVersions: readonly string[],
): BetaGroupState {
  if (stableVersions.includes(target)) return "shipped";
  for (const s of stableVersions) {
    if (s.localeCompare(target, undefined, { numeric: true, sensitivity: "base" }) > 0) {
      return "skipped";
    }
  }
  return "upcoming";
}
