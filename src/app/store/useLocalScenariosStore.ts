import { create } from "zustand";
import type { LocalScenario } from "../../entities/local-scenario/model";
import type { PlaceExperienceMemory } from "../../entities/place-memory/model";
import type { TravelMemory } from "../../entities/travel-memory/model";
import type { UserPreferences } from "../../entities/user/model";
import { savedLocalScenariosRepository } from "../../services/firebase/repositories/savedLocalScenariosRepository";
import { nowIso } from "../../services/firebase/timestampMapper";
import type { RightNowSpendTier } from "../../services/ai/promptBuilders/localScenarioPromptBuilder";
import { localScenarioService } from "../../services/planning/localScenarioService";
import { debugLogError, getErrorDevDetails, getErrorMessage } from "../../shared/lib/errors";
import { cacheDurations, createIdleCacheMeta, isCacheFresh, type CacheMeta } from "../../shared/types/cache";

type LocalScenarioProgressStep =
  | "locating_precisely"
  | "checking_weather"
  | "finding_nearby_places"
  | "estimating_movement"
  | "composing_scenarios"
  | "refining_with_ai"
  | "polishing_itinerary";

interface LocalScenariosState {
  scenarioIds: string[];
  scenariosById: Record<string, LocalScenario>;
  savedScenarioIds: string[];
  flowMeta: CacheMeta;
  savedMeta: CacheMeta;
  progressStep: LocalScenarioProgressStep | null;
  expectedScenarioCount: number;
  ensureSavedScenarios: (userId: string) => Promise<void>;
  generateScenarios: (request: {
    userId?: string;
    locationLabel: string;
    latitude?: number;
    longitude?: number;
    vibe: string;
    availableMinutes: number;
    rightNowSpendTier?: RightNowSpendTier;
    userPreferences?: UserPreferences | null;
    travelMemories?: TravelMemory[];
    placeMemories?: PlaceExperienceMemory[];
  }) => Promise<void>;
  saveScenario: (userId: string, scenarioId: string) => Promise<void>;
  patchScenario: (scenarioId: string, scenario: LocalScenario) => void;
}

export const useLocalScenariosStore = create<LocalScenariosState>((set) => ({
  scenarioIds: [],
  scenariosById: {},
  savedScenarioIds: [],
  flowMeta: createIdleCacheMeta(),
  savedMeta: createIdleCacheMeta(),
  progressStep: null,
  expectedScenarioCount: 0,

  ensureSavedScenarios: async (userId) => {
    if (!userId.trim()) {
      return;
    }
    const current = useLocalScenariosStore.getState();
    if (isCacheFresh(current.savedMeta, cacheDurations.medium)) {
      return;
    }

    set((state) => ({ savedMeta: { ...state.savedMeta, status: "loading", error: null } }));
    try {
      const scenarios = await savedLocalScenariosRepository.getSavedScenarios(userId);
      set((state) => ({
        scenariosById: { ...state.scenariosById, ...Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario])) },
        savedScenarioIds: scenarios.map((scenario) => scenario.id),
        savedMeta: { status: "success", lastFetchedAt: Date.now(), lastValidatedAt: null, isDirty: false, error: null },
      }));
    } catch (error) {
      debugLogError("local_scenarios_ensure_saved", error);
      set((state) => ({ savedMeta: { ...state.savedMeta, status: "error", error: getErrorMessage(error) } }));
    }
  },

  generateScenarios: async (request) => {
    set((state) => ({
      scenarioIds: [],
      scenariosById: {},
      progressStep: "locating_precisely",
      expectedScenarioCount: 0,
      flowMeta: { ...state.flowMeta, status: "loading", error: null },
    }));
    try {
      const result = await localScenarioService.generateScenarios(request, {
        onStep: (step) => {
          set({ progressStep: step });
        },
        onBatch: async (scenarios, total) => {
          set((state) => {
            const nextScenariosById = { ...state.scenariosById };
            const nextIds = [...state.scenarioIds];

            scenarios.forEach((scenario) => {
              nextScenariosById[scenario.id] = scenario;
              if (!nextIds.includes(scenario.id)) {
                nextIds.push(scenario.id);
              }
            });

            return {
              scenarioIds: nextIds,
              scenariosById: nextScenariosById,
              expectedScenarioCount: total,
              progressStep: state.progressStep,
              flowMeta: { ...state.flowMeta, status: "loading", error: null },
            };
          });
        },
      });
      set({
        scenarioIds: result.scenarios.map((scenario) => scenario.id),
        scenariosById: Object.fromEntries(result.scenarios.map((scenario) => [scenario.id, scenario])),
        progressStep: null,
        expectedScenarioCount: result.scenarios.length,
        flowMeta: { status: "success", lastFetchedAt: Date.now(), lastValidatedAt: null, isDirty: false, error: null },
      });
    } catch (error) {
      debugLogError("local_scenarios_generate", error);
      const message = getErrorMessage(error);
      const dev = getErrorDevDetails(error);
      const combined = import.meta.env.DEV && dev ? `${message}\n\n${dev}` : message;
      set((state) => ({
        progressStep: null,
        flowMeta: { ...state.flowMeta, status: "error", error: combined },
      }));
    }
  },

  patchScenario: (scenarioId, scenario) => {
    set((state) => ({
      scenariosById: { ...state.scenariosById, [scenarioId]: scenario },
      scenarioIds: state.scenarioIds.includes(scenarioId) ? state.scenarioIds : [scenarioId, ...state.scenarioIds],
    }));
  },

  saveScenario: async (userId, scenarioId) => {
    if (!userId.trim()) {
      return;
    }
    const scenario = useLocalScenariosStore.getState().scenariosById[scenarioId];
    if (!scenario) {
      throw new Error("Scenario not found");
    }

    const savedScenario: LocalScenario = {
      ...scenario,
      userId,
      savedAt: nowIso(),
    };
    await savedLocalScenariosRepository.saveScenario(savedScenario);
    set((state) => ({
      scenariosById: { ...state.scenariosById, [scenarioId]: savedScenario },
      savedScenarioIds: state.savedScenarioIds.includes(scenarioId) ? state.savedScenarioIds : [scenarioId, ...state.savedScenarioIds],
    }));
  },
}));
