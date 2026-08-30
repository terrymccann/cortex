export * from "./openai-controller-reasoner.js";
export * from "./openai-autonomy-reasoners.js";

import type { PromptIdentity } from "@cortex/contracts";
import {
  OPENAI_GOAL_PROMPT_VERSION,
  OPENAI_GOAL_RESPONSE_SCHEMA_VERSION,
  OPENAI_PLANNER_PROMPT_VERSION,
  OPENAI_PLANNER_RESPONSE_SCHEMA_VERSION
} from "./openai-autonomy-reasoners.js";
import {
  OPENAI_CONTROLLER_PROMPT_VERSION,
  OPENAI_CONTROLLER_RESPONSE_SCHEMA_VERSION
} from "./openai-controller-reasoner.js";

export const CORTEX_OPENAI_PROMPT_IDENTITIES_V1 = Object.freeze([
  { task: "controller", promptVersion: OPENAI_CONTROLLER_PROMPT_VERSION, responseSchemaVersion: OPENAI_CONTROLLER_RESPONSE_SCHEMA_VERSION },
  { task: "goal", promptVersion: OPENAI_GOAL_PROMPT_VERSION, responseSchemaVersion: OPENAI_GOAL_RESPONSE_SCHEMA_VERSION },
  { task: "planner", promptVersion: OPENAI_PLANNER_PROMPT_VERSION, responseSchemaVersion: OPENAI_PLANNER_RESPONSE_SCHEMA_VERSION }
] as const satisfies readonly PromptIdentity[]);
