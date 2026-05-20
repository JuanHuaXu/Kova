import { loadMetrics } from "./metrics.mjs";
import {
  loadChannelCapabilities,
  validateChannelCapabilityCatalogReferences,
  validateChannelCapabilityWorkflowReferences
} from "./channel-capabilities.mjs";
import { loadChannelCapabilityCatalog } from "./channel-capability-catalog.mjs";
import { loadChannelWorkflowInventory, validateChannelWorkflowInventoryReferences } from "./channel-workflow-inventory.mjs";
import { loadChannelWorkflowCaseCatalog, validateChannelWorkflowCaseCatalogReferences } from "./channel-workflow-cases.mjs";
import { loadProcessRoles } from "./process-roles.mjs";
import { loadProfiles } from "./profiles.mjs";
import { loadScenarios } from "./scenarios.mjs";
import { loadStates } from "./states.mjs";
import { loadSurfaces } from "./surfaces.mjs";
import { validateRegistryReferences } from "./validate.mjs";

export async function loadRegistryContext() {
  const [surfaces, processRoles, metrics, channelCapabilityCatalog, channelWorkflowInventory, channelWorkflowCaseCatalog, channelCapabilities, scenarios, states, profiles] = await Promise.all([
    loadSurfaces(),
    loadProcessRoles(),
    loadMetrics(),
    loadChannelCapabilityCatalog(),
    loadChannelWorkflowInventory(),
    loadChannelWorkflowCaseCatalog(),
    loadChannelCapabilities(),
    loadScenarios(),
    loadStates(),
    loadProfiles()
  ]);
  validateRegistryReferences({ scenarios, states, profiles, surfaces, processRoles, metrics });
  validateChannelCapabilityCatalogReferences(channelCapabilities, channelCapabilityCatalog);
  validateChannelWorkflowInventoryReferences(channelWorkflowInventory, channelCapabilityCatalog);
  validateChannelWorkflowCaseCatalogReferences(channelWorkflowCaseCatalog, channelCapabilityCatalog);
  validateChannelCapabilityWorkflowReferences(channelCapabilities, channelWorkflowCaseCatalog);
  return { surfaces, processRoles, metrics, channelCapabilityCatalog, channelWorkflowInventory, channelWorkflowCaseCatalog, channelCapabilities, scenarios, states, profiles };
}
