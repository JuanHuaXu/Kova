/**
 * Astro content collection wiring.
 *
 * The actual release shape is defined in the repo-shared contract at
 * `../../src/web-payload-contract.mjs` — DO NOT duplicate schemas here.
 * Adding fields belongs in the shared contract so the Kova publish
 * pipeline cannot drift from what the site expects to render.
 *
 * This file only:
 *   - wires the shared `releaseSchema` into `defineCollection`
 *   - chooses the glob loader for `src/content/releases/*.json`
 *   - re-exports the inferred TypeScript types for convenience.
 */

import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";

import {
  releaseSchema,
  scenarioSchema,
  runSchema,
  runScenarioSchema,
  phaseSchema,
  metricRowSchema,
  findingSchema,
  proveSchema,
  bundleSchema,
  headlineSchema,
  comparisonRowSchema,
} from "../../src/web-payload-contract.mjs";
import type { z } from "zod";

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
