/**
 * Content collection schemas.
 *
 * `releases` is the canonical store for OpenClaw release benchmark data. Each
 * entry is a JSON file in `src/content/releases/<version>.json` matching the
 * release version. The future `kova publish <run-id>` CLI command writes into
 * this directory and the site rebuilds automatically.
 *
 * Schema fields:
 *   - ver, releaseDate, sha, passed: required for every release (timeline use).
 *   - runs, host, coldReadyDeltaPct, scenarios: populated for releases whose
 *     full run data is available. Older entries may carry only the summary.
 */

import { defineCollection } from "astro:content";
import { z } from "zod";
import { glob } from "astro/loaders";

const scenarioSchema = z.object({
  id: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  threshold: z.number(),
  state: z.enum(["pass", "fail", "block"]),
  spark: z.array(z.number()).nullable(),
  /** Defaults true; set false when higher numbers are better. */
  lowerIsBetter: z.boolean().optional(),
});

const releaseSchema = z.object({
  ver: z.string(),
  releaseDate: z.coerce.date(),
  date: z.string(),
  sha: z.string(),
  passed: z.boolean(),
  runs: z.number().optional(),
  host: z.string().optional(),
  coldReadyDeltaPct: z.number().optional(),
  scenarios: z.array(scenarioSchema).optional(),
});

const releases = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/releases" }),
  schema: releaseSchema,
});

export const collections = { releases };

export type Scenario = z.infer<typeof scenarioSchema>;
export type Release = z.infer<typeof releaseSchema>;
