import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { channelCapabilitiesDir } from "../paths.mjs";
import { channelCapabilityCatalogMap } from "./channel-capability-catalog.mjs";
import {
  assertNoShapeErrors,
  requireArray,
  requireKebabId,
  requireObject,
  requireString,
  validateStringArray
} from "./validate.mjs";

export async function loadChannelWorkflowCaseCatalog(selectedId) {
  const names = await readdir(channelCapabilitiesDir);
  const paths = names.filter((name) => name.endsWith(".json")).sort();
  const items = [];
  const ids = new Set();

  for (const name of paths) {
    const raw = await readFile(join(channelCapabilitiesDir, name), "utf8");
    const item = JSON.parse(raw);
    if (item.schemaVersion !== "kova.channelWorkflowCaseCatalog.v1") {
      continue;
    }
    validateChannelWorkflowCaseCatalogShape(item, name);
    if (ids.has(item.id)) {
      throw new Error(`duplicate channel workflow case catalog id '${item.id}' in ${name}`);
    }
    ids.add(item.id);
    items.push(item);
  }

  const filtered = selectedId ? items.filter((item) => item.id === selectedId) : items;
  if (filtered.length === 0) {
    throw new Error(`no channel workflow case catalog found for ${selectedId}`);
  }
  return filtered;
}

export function validateChannelWorkflowCaseCatalogShape(catalog, sourceName = "channel workflow case catalog") {
  const errors = [];
  requireString(catalog, "schemaVersion", errors);
  if (catalog?.schemaVersion !== "kova.channelWorkflowCaseCatalog.v1") {
    errors.push("schemaVersion must be kova.channelWorkflowCaseCatalog.v1");
  }
  requireKebabId(catalog, "id", errors);
  requireString(catalog, "title", errors);
  requireString(catalog, "description", errors);
  requireArray(catalog, "cases", errors);
  validateCases(catalog?.cases, errors);
  assertNoShapeErrors(errors, sourceName);
}

export function validateChannelWorkflowCaseCatalogReferences(workflowCatalogs, capabilityCatalogs) {
  const capabilityMap = channelCapabilityCatalogMap(capabilityCatalogs);
  const errors = [];
  for (const catalog of workflowCatalogs ?? []) {
    for (const testCase of catalog.cases ?? []) {
      for (const atom of testCase.atoms ?? []) {
        const key = `${atom.group}:${atom.id}`;
        if (!capabilityMap.has(key)) {
          errors.push(`${catalog.id}.${testCase.id} references unknown OpenClaw channel atom ${key}`);
        }
      }
    }
  }
  assertNoShapeErrors(errors, "channel workflow case catalog references");
}

function validateCases(cases, errors) {
  if (!Array.isArray(cases)) {
    return;
  }
  if (cases.length === 0) {
    errors.push("cases must not be empty");
    return;
  }

  const ids = new Set();
  for (const [index, testCase] of cases.entries()) {
    const prefix = `cases[${index}]`;
    requireWorkflowCaseId(testCase?.id, `${prefix}.id`, errors);
    requireKebabId(testCase, "workflow", errors, prefix);
    requireString(testCase, "userAction", errors, prefix);
    requireString(testCase, "openclawSurface", errors, prefix);
    requireString(testCase, "ownerArea", errors, prefix);
    requireString(testCase, "prompt", errors, prefix);
    requireObject(testCase, "providerScript", errors, prefix);
    requireObject(testCase, "expects", errors, prefix);
    requireArray(testCase, "atoms", errors, prefix);
    validateAtoms(testCase?.atoms, `${prefix}.atoms`, errors);
    validateStringArray(testCase?.adapterSupport, `${prefix}.adapterSupport`, errors, { optional: true });

    if (typeof testCase?.id === "string") {
      if (ids.has(testCase.id)) {
        errors.push(`duplicate channel workflow case '${testCase.id}'`);
      }
      ids.add(testCase.id);
    }
  }
}

function validateAtoms(atoms, prefix, errors) {
  if (!Array.isArray(atoms)) {
    return;
  }
  if (atoms.length === 0) {
    errors.push(`${prefix} must not be empty`);
    return;
  }

  const seen = new Set();
  for (const [index, atom] of atoms.entries()) {
    const atomPrefix = `${prefix}[${index}]`;
    requireKebabId(atom, "group", errors, atomPrefix);
    requireKebabId(atom, "id", errors, atomPrefix);
    const key = `${atom?.group}:${atom?.id}`;
    if (typeof atom?.group === "string" && typeof atom?.id === "string") {
      if (seen.has(key)) {
        errors.push(`${prefix} duplicates atom '${key}'`);
      }
      seen.add(key);
    }
  }
}

function requireWorkflowCaseId(value, label, errors) {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/.test(value)) {
    errors.push(`${label} must be a kebab/dot case id`);
  }
}
