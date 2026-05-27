/**
 * Content collection schemas.
 *
 * `releases` is the canonical store for OpenClaw release benchmark data. Each
 * entry is a JSON file in `src/content/releases/<version>.json` matching the
 * release version. The future `kova publish <run-id>` CLI command writes into
 * this directory and the site rebuilds automatically.
 *
 * Schema notes:
 *   - Counts (pass/fail/blocked) are always derived from `scenarios[]` so the
 *     header and the wall cannot drift.
 *   - Bundles live on `runs[].bundle`. There is no release-level bundles
 *     array — the page aggregates them.
 *   - All entity references (scenarioId, metric, runId) are kept structured
 *     so future permalinks/RSS/comparison can resolve them without parsing
 *     prose.
 */

import { defineCollection } from "astro:content";
import { z } from "zod";
import { glob } from "astro/loaders";

const stateEnum = z.enum(["pass", "fail", "block"]);
const findingKind = z.enum(["fail", "warn", "info"]);

const scenarioSchema = z.object({
  id: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  threshold: z.number(),
  state: stateEnum,
  spark: z.array(z.number()).nullable(),
  /** Defaults true; set false when higher numbers are better. */
  lowerIsBetter: z.boolean().optional(),
  /** Optional worst contributing metric, used by scenario tile. */
  worstMetric: z
    .object({ name: z.string(), value: z.number(), unit: z.string() })
    .optional(),
});

const phaseSchema = z.object({
  name: z.string(),
  elapsedMs: z.number(),
  state: stateEnum,
});

const metricRowSchema = z.object({
  name: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  threshold: z.number().nullable(),
  state: stateEnum,
  /** Renders indented (role-scoped child of the previous metric). */
  child: z.boolean().optional(),
});

const findingSchema = z.object({
  kind: findingKind,
  text: z.string(),
  scenarioId: z.string().optional(),
  metric: z.string().optional(),
});

const proveSchema = z.object({
  state: z.enum(["pass", "fail"]),
  text: z.string(),
  scenarioId: z.string().optional(),
});

const runScenarioSchema = z.object({
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

const bundleSchema = z.object({
  name: z.string(),
  bytes: z.number(),
  href: z.string(),
});

const runSchema = z.object({
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

const headlineSchema = z.object({
  label: z.string(),
  value: z.number(),
  unit: z.string(),
  vsVer: z.string().optional(),
  deltaPct: z.number().optional(),
  lowerIsBetter: z.boolean().optional(),
  scenarioId: z.string().optional(),
  metric: z.string().optional(),
});

const comparisonRowSchema = z.object({
  scenarioId: z.string(),
  metric: z.string(),
  before: z.number(),
  after: z.number(),
  unit: z.string(),
  deltaPct: z.number(),
  lowerIsBetter: z.boolean().optional(),
});

const comparisonSchema = z.object({
  vsVer: z.string(),
  rows: z.array(comparisonRowSchema),
});

const releaseSchema = z.object({
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

const releases = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/releases" }),
  schema: releaseSchema,
});

export const collections = { releases };

export type Scenario = z.infer<typeof scenarioSchema>;
export type Release = z.infer<typeof releaseSchema>;
export type Run = z.infer<typeof runSchema>;
export type RunScenario = z.infer<typeof runScenarioSchema>;
export type Phase = z.infer<typeof phaseSchema>;
export type MetricRow = z.infer<typeof metricRowSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type Prove = z.infer<typeof proveSchema>;
export type Bundle = z.infer<typeof bundleSchema>;
export type Headline = z.infer<typeof headlineSchema>;
export type ComparisonRow = z.infer<typeof comparisonRowSchema>;
