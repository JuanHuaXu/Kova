import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { workflowCaseCatalogFromFamilies } from "../src/registries/channel-workflow-families.mjs";

export function readChannelWorkflowCaseCatalogSync(repoRoot) {
  const dir = join(repoRoot, "channel-capabilities", "workflows");
  const families = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));
  const [catalog] = workflowCaseCatalogFromFamilies(families);
  return catalog;
}
