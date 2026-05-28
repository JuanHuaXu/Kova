/**
 * Kova → web payload contract (single source of truth).
 *
 * Defines the shape every release JSON in `web/src/content/releases/<ver>.json`
 * must conform to. Consumed by:
 *
 *   - Astro site (`web/src/content.config.ts`) for content-collection schema.
 *   - Kova CLI `kova publish <run-id>` projector for produce-side validation
 *     before writing into the web tree.
 *   - `kova check:contract` self-check which fails CI if the live release
 *     JSONs ever drift from this schema.
 *
 * One file = one contract. Both ends of the pipeline (CLI producer and
 * Astro consumer) MUST import schemas from here so they cannot drift.
 *
 * Versioning rule: any change that adds a required field is a major bump
 * of `WEB_PAYLOAD_SCHEMA_VERSION`. Adding an optional field is a minor
 * bump. The schema version is intentionally separate from Kova's internal
 * `kova.report.v1` schemaVersion — the report is the *input* to publish,
 * the web payload is the *output*.
 *
 * Plain ESM with JSDoc typedefs so Kova CLI (.mjs) can `import` it
 * directly. The web side (TypeScript) gets full types via `z.infer`.
 */

import { z } from "zod";

export const WEB_PAYLOAD_SCHEMA_VERSION = "kova.web-payload.v1";

/* ─── Atomic enums ────────────────────────────────────────────── */

export const stateEnum = z.enum(["pass", "fail", "block"]);
export const findingKind = z.enum(["fail", "warn", "info"]);
export const proveState = z.enum(["pass", "fail"]);

/* ─── Per-scenario summary (top-level on a release) ───────────── */

export const scenarioSchema = z.object({
  id: z.string(),
  /** Public label for the headline metric, e.g. "startup" or "full turn". */
  metric: z.string().optional(),
  value: z.number().nullable(),
  unit: z.string(),
  threshold: z.number(),
  state: stateEnum,
  /** Trailing-window samples; null when no sample. */
  spark: z.array(z.number()).nullable(),
  /** Defaults true; set false when higher numbers are better. */
  lowerIsBetter: z.boolean().optional(),
  /** Worst contributing metric, used by scenario tile. */
  worstMetric: z
    .object({ name: z.string(), value: z.number(), unit: z.string() })
    .optional(),
});

/* ─── Per-run details (drill-down on /releases/<ver>) ─────────── */

export const phaseSchema = z.object({
  name: z.string(),
  elapsedMs: z.number(),
  state: stateEnum,
});

export const metricRowSchema = z.object({
  name: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  threshold: z.number().nullable(),
  state: stateEnum,
  /** Renders indented (role-scoped child of the previous metric). */
  child: z.boolean().optional(),
});

export const findingSchema = z.object({
  kind: findingKind,
  text: z.string(),
  scenarioId: z.string().optional(),
  metric: z.string().optional(),
});

export const proveSchema = z.object({
  state: proveState,
  text: z.string(),
  scenarioId: z.string().optional(),
});

export const runScenarioSchema = z.object({
  id: z.string(),
  state: stateEnum,
  sampleCount: z.number(),
  /** Headline number for this scenario in this run, before unit formatting. */
  sampleValue: z.number().optional(),
  sampleUnit: z.string().optional(),
  phases: z.array(phaseSchema).optional(),
  metrics: z.array(metricRowSchema).optional(),
  findings: z.array(findingSchema).optional(),
  proves: z.array(proveSchema).optional(),
});

export const bundleSchema = z.object({
  name: z.string(),
  bytes: z.number(),
  href: z.string(),
});

export const runSchema = z.object({
  id: z.string(),
  runtime: z.string(),
  profile: z.string(),
  startedAt: z.coerce.date(),
  durationMs: z.number(),
  entryCount: z.number(),
  state: stateEnum,
  host: z.string().optional(),
  command: z.string().optional(),
  expandedByDefault: z.boolean().optional(),
  scenarios: z.array(runScenarioSchema).optional(),
  bundle: bundleSchema.optional(),
});

/* ─── Headline + comparison (publish-time projections) ────────── */

export const headlineSchema = z.object({
  label: z.string(),
  value: z.number(),
  unit: z.string(),
  vsVer: z.string().optional(),
  deltaPct: z.number().optional(),
  lowerIsBetter: z.boolean().optional(),
  scenarioId: z.string().optional(),
  metric: z.string().optional(),
});

export const comparisonRowSchema = z.object({
  scenarioId: z.string(),
  metric: z.string(),
  before: z.number(),
  after: z.number(),
  unit: z.string(),
  deltaPct: z.number(),
  lowerIsBetter: z.boolean().optional(),
});

export const comparisonSchema = z.object({
  vsVer: z.string(),
  rows: z.array(comparisonRowSchema),
});

/* ─── Root release schema ─────────────────────────────────────── */

export const releaseSchema = z.object({
  ver: z.string(),
  releaseDate: z.coerce.date(),
  date: z.string(),
  sha: z.string(),
  passed: z.boolean(),
  /** Number of runs executed. Kept even when `runs[]` is populated. */
  runCount: z.number().optional(),
  host: z.string().optional(),
  coldReadyDeltaPct: z.number().optional(),
  scenarios: z.array(scenarioSchema).optional(),
  runtimeTargets: z.array(z.string()).optional(),
  headline: z.array(headlineSchema).optional(),
  runs: z.array(runSchema).optional(),
  comparison: comparisonSchema.optional(),
});

/* ─── Convenience helpers ─────────────────────────────────────── */

/**
 * Parse-or-throw with a descriptive error pointing at the offending file.
 * Use this on the publish side before writing into web/src/content/releases.
 *
 * @param {unknown} data
 * @param {string} sourceLabel  Human label, e.g. an artifact path or "<run-id>".
 * @returns {z.infer<typeof releaseSchema>}
 */
export function parseRelease(data, sourceLabel = "<unknown>") {
  const result = releaseSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid web-payload (${WEB_PAYLOAD_SCHEMA_VERSION}) at ${sourceLabel}:\n${issues}`,
    );
  }
  return result.data;
}

/** Non-throwing variant returning `{ ok, data?, errors? }`. */
export function safeParseRelease(data) {
  const result = releaseSchema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => ({
      path: i.path.join(".") || "<root>",
      message: i.message,
      code: i.code,
    })),
  };
}

/* ─── JSDoc typedefs (for IDE intellisense in plain .mjs callers) ─ */

/** @typedef {z.infer<typeof releaseSchema>}       WebPayloadRelease */
/** @typedef {z.infer<typeof scenarioSchema>}      WebPayloadScenario */
/** @typedef {z.infer<typeof runSchema>}           WebPayloadRun */
/** @typedef {z.infer<typeof runScenarioSchema>}   WebPayloadRunScenario */
/** @typedef {z.infer<typeof phaseSchema>}         WebPayloadPhase */
/** @typedef {z.infer<typeof metricRowSchema>}     WebPayloadMetricRow */
/** @typedef {z.infer<typeof findingSchema>}       WebPayloadFinding */
/** @typedef {z.infer<typeof proveSchema>}         WebPayloadProve */
/** @typedef {z.infer<typeof bundleSchema>}        WebPayloadBundle */
/** @typedef {z.infer<typeof headlineSchema>}      WebPayloadHeadline */
/** @typedef {z.infer<typeof comparisonRowSchema>} WebPayloadComparisonRow */
/** @typedef {z.infer<typeof comparisonSchema>}    WebPayloadComparison */
