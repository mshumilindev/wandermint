import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import OpenAI from "openai";
import { z } from "zod";

if (getApps().length === 0) {
  initializeApp();
}

const openAiApiKey = defineSecret("OPENAI_API_KEY");

const flowSchema = z.enum([
  "trip_generation",
  "local_scenario",
  "trip_chat_replan",
  "trip_revalidation",
  "unfinished_day_recovery",
  "preference_learning",
]);

type AiFlow = z.infer<typeof flowSchema>;

const gatewayRequestSchema = z.object({
  flow: flowSchema,
  payload: z.unknown(),
});

const endpointFlowMap: Record<string, AiFlow> = {
  "/trip-options": "trip_generation",
  "/local-scenarios": "local_scenario",
  "/trip-chat": "trip_chat_replan",
  "/trip-revalidation": "trip_revalidation",
  "/unfinished-day-recovery": "unfinished_day_recovery",
  "/preference-learning": "preference_learning",
};

const flowOutputContracts: Record<AiFlow, string> = {
  trip_generation:
    "Return JSON {\"options\":[exactly 3 objects]}. Each option must include optionId, label, positioning, trip, days, tradeoffs. trip must include id,userId,title,destination,tripSegments,dateRange,flightInfo,hotelInfo,budget,preferences,status,createdAt,updatedAt,lastValidatedAt,planVersion, and should include executionProfile, anchorEvents, intercityMoves, travelSupport when payload provides them. Each day must include id,userId,tripId,segmentId,cityLabel,countryLabel,date,theme,blocks,estimatedCostRange,validationStatus,warnings,completionStatus,updatedAt. Assign each day to the correct trip segment, include transfer blocks when moving between cities, preserve locked anchor events, add realistic buffers, surface dense/risky days as warnings or support notes. Use payload.destinationDiscovery for attractions, museums, local food, traditional drinks, nearby places, day trips, and parsed user must-see requests. Never invent ratings, availability, or factual reputation; if a must-see item is low-confidence or weakly grounded, propose provider-grounded alternatives and explain the tradeoff in tradeoffs or warnings. Each activity block must include id,type,title,description,startTime,endTime,category,tags,indoorOutdoor,estimatedCost,dependencies,alternatives,sourceSnapshots,priority,locked,completionStatus.",
  local_scenario:
    "Return JSON {\"scenarios\":[1 to 4 objects]}. Each scenario must include id,userId optional,theme,locationLabel,estimatedDurationMinutes,estimatedCostRange,weatherFit,routeLogic,blocks,alternatives,createdAt. estimatedCostRange must include min,max,currency,certainty. Each scenario must have 2 to 4 blocks. Each block must include id,type(activity|meal|transfer|rest),title,description,startTime,endTime,place optional,category,tags,indoorOutdoor,estimatedCost,dependencies,alternatives,sourceSnapshots,priority,locked,completionStatus. dependencies must include weatherSensitive,bookingRequired,openingHoursSensitive,priceSensitive. Use provided places as sourceSnapshots when available; if exact price is unknown use estimated or unknown certainty.",
  trip_chat_replan:
    "Return JSON {\"assistantMessage\":\"...\",\"structuredPatchSummary\":\"...\",\"proposal\": optional ReplanProposal}. If proposing edits, proposal must include id,userId,tripId,createdAt,reason,summary,actions. Actions must be move_activity, remove_activity, replace_activity, or compress_day.",
  trip_revalidation:
    "Return JSON {\"assistantMessage\":\"...\",\"structuredPatchSummary\":\"...\",\"proposal\": optional ReplanProposal}. Explain tradeoffs from supplied warnings and provider facts only.",
  unfinished_day_recovery:
    "Return JSON {\"assistantMessage\":\"...\",\"structuredPatchSummary\":\"...\",\"proposal\": ReplanProposal}. Preserve must/locked items and completion history.",
  preference_learning:
    "Return JSON {\"assistantMessage\":\"...\",\"structuredPatchSummary\":\"...\"}. Suggest preference learning from completion and skipping patterns without modifying data directly.",
};

const createSystemPrompt = (flow: AiFlow): string =>
  [
    "You are WanderMint's structured planning layer.",
    "Do not invent factual live data. Facts must come from provider snapshots in the payload.",
    "Return strict JSON matching the requested WanderMint frontend schema.",
    "Preserve locked items, completion history, user constraints, budget boundaries, and uncertainty notes.",
    "When provider data is partial, stale, or unavailable, say so in structured fields instead of pretending certainty.",
    flowOutputContracts[flow],
    `Flow: ${flow}`,
  ].join("\n");

const getBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length);
};

const resolveFlowFromPath = (path: string, fallback: AiFlow): AiFlow => {
  const normalizedPath = path.replace(/^\/api\/ai/, "") || path;
  return endpointFlowMap[normalizedPath] ?? fallback;
};

const verifyFirebaseUser = async (authorizationHeader: string | undefined): Promise<string | null> => {
  const token = getBearerToken(authorizationHeader);
  if (!token) {
    return null;
  }

  const decoded = await getAuth().verifyIdToken(token);
  return decoded.uid;
};

export const aiGateway = onRequest(
  {
    secrets: [openAiApiKey],
    cors: true,
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  async (request, response) => {
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (request.method !== "POST") {
      response.status(405).json({ error: "Method not allowed" });
      return;
    }

    const parsed = gatewayRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid request" });
      return;
    }

    let userId: string | null = null;
    try {
      userId = await verifyFirebaseUser(request.header("authorization"));
    } catch {
      response.status(401).json({ error: "Invalid Firebase auth token" });
      return;
    }

    if (!userId) {
      response.status(401).json({ error: "Missing Firebase auth token" });
      return;
    }

    const flow = resolveFlowFromPath(request.path, parsed.data.flow);
    if (flow !== parsed.data.flow) {
      response.status(400).json({ error: "Request flow does not match endpoint" });
      return;
    }

    const client = new OpenAI({ apiKey: openAiApiKey.value() });

    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: createSystemPrompt(flow) },
          {
            role: "user",
            content: JSON.stringify({
              authenticatedUserId: userId,
              payload: parsed.data.payload,
            }),
          },
        ],
      });

      const content = completion.choices[0]?.message.content;
      if (!content) {
        response.status(502).json({ error: "Empty AI response" });
        return;
      }

      const parsedJson: unknown = JSON.parse(content);
      response.status(200).json(parsedJson);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI gateway failed";
      response.status(502).json({ error: message });
    }
  },
);
