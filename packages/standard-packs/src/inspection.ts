import type { AcceptedDecisionRecord, AgentState } from "@cortex/runtime";
import type {
  AcceptedGoalRecord,
  GoalFormationDiagnostic
} from "./goals.js";
import {
  readPlanningState,
  type AcceptedPlanRecord,
  type PlanDiagnostic,
  type PlanEscalation,
  type Plan
} from "./planning.js";

export const CORTEX_COGNITION_INSPECTION_SCHEMA_VERSION = "cortex-cognition-inspection-v1" as const;

export interface CognitionInspectionReport {
  readonly schemaVersion: typeof CORTEX_COGNITION_INSPECTION_SCHEMA_VERSION;
  readonly goals: readonly GoalInspection[];
  readonly plans: readonly PlanInspection[];
  readonly decisions: readonly DecisionInspection[];
  readonly lifecycle: readonly PlanLifecycleInspection[];
  readonly escalations: readonly PlanEscalation[];
  readonly rejected: readonly RejectedCognitionInspection[];
}

export interface GoalInspection {
  readonly frameId: string;
  readonly basedOnVersion: number;
  readonly resultingStateVersion: number;
  readonly triggerId: string;
  readonly offeredDefinitionIds: readonly string[];
  readonly selectedDefinitionId: string;
  readonly goalId: string;
  readonly motivationIds: readonly string[];
  readonly evidenceEventIds: readonly string[];
  readonly activeObligationIds: readonly string[];
  readonly outcome: "activated" | "merged";
  readonly frameHash: string;
  readonly reasonerMetadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface PlanInspection {
  readonly frameId: string;
  readonly basedOnVersion: number;
  readonly resultingStateVersion: number;
  readonly goalId: string;
  readonly planId: string;
  readonly strategyId?: string;
  readonly offeredCapabilityIds: readonly string[];
  readonly selectedCapabilities: readonly string[];
  readonly successConditionRefs: readonly string[];
  readonly failureConditionRefs: readonly string[];
  readonly acknowledgedObligationIds: readonly string[];
  readonly frameHash: string;
  readonly source: string;
  readonly reasonerMetadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface DecisionInspection {
  readonly frameId: string;
  readonly basedOnVersion: number;
  readonly decisionId: string;
  readonly eligibleIntentionIds: readonly string[];
  readonly selectedIntentionId: string;
  readonly reasonCode: string;
  readonly commitment: number;
  readonly enforcedObligationIds: readonly string[];
  readonly usedFallback: boolean;
  readonly fallbackReason?: string;
  readonly frameHash: string;
}

export interface PlanLifecycleInspection {
  readonly planId: string;
  readonly goalId: string;
  readonly status: string;
  readonly statusReason?: string;
  readonly steps: readonly {
    readonly stepId: string;
    readonly capabilityId: string;
    readonly status: string;
    readonly attempts: number;
    readonly decisionId?: string;
    readonly actionId?: string;
    readonly outcomeEventIds: readonly string[];
    readonly statusReason?: string;
  }[];
}

export interface RejectedCognitionInspection {
  readonly kind: "goal" | "plan";
  readonly basedOnVersion: number;
  readonly outcome: string;
  readonly reason?: string;
  readonly subjectId?: string;
}

export class CognitionInspector {
  inspect(input: {
    readonly acceptedGoals?: readonly AcceptedGoalRecord[];
    readonly acceptedPlans?: readonly AcceptedPlanRecord[];
    readonly acceptedDecisions?: readonly AcceptedDecisionRecord[];
    readonly goalDiagnostics?: readonly GoalFormationDiagnostic[];
    readonly planDiagnostics?: readonly PlanDiagnostic[];
    readonly finalState?: Readonly<AgentState>;
  }): CognitionInspectionReport {
    const planning = input.finalState === undefined ? undefined : readPlanningState(input.finalState);
    const lifecyclePlans = [
      ...(planning?.recentPlans ?? []),
      ...(planning?.activePlan === undefined ? [] : [planning.activePlan])
    ];
    return {
      schemaVersion: CORTEX_COGNITION_INSPECTION_SCHEMA_VERSION,
      goals: (input.acceptedGoals ?? []).map(inspectGoal),
      plans: (input.acceptedPlans ?? []).map(inspectPlan),
      decisions: (input.acceptedDecisions ?? []).map(inspectDecision),
      lifecycle: lifecyclePlans.map(inspectLifecycle),
      escalations: structuredClone(planning?.escalations ?? []),
      rejected: [
        ...(input.goalDiagnostics ?? []).filter((item) => item.outcome === "rejected" || item.outcome === "deferred").map((item) => ({
          kind: "goal" as const, basedOnVersion: item.basedOnVersion, outcome: item.outcome,
          ...(item.reason === undefined ? {} : { reason: item.reason }),
          ...(item.definitionId === undefined ? {} : { subjectId: item.definitionId })
        })),
        ...(input.planDiagnostics ?? []).filter((item) => item.outcome === "rejected" || item.outcome === "no-plan").map((item) => ({
          kind: "plan" as const, basedOnVersion: item.basedOnVersion, outcome: item.outcome,
          ...(item.reason === undefined ? {} : { reason: item.reason }), subjectId: item.goalId
        }))
      ]
    };
  }
}

const inspectGoal = (record: AcceptedGoalRecord): GoalInspection => ({
  frameId: record.frameId, basedOnVersion: record.basedOnVersion,
  resultingStateVersion: record.resultingStateVersion, triggerId: record.trigger.id,
  offeredDefinitionIds: record.offeredDefinitions.map((item) => item.id),
  selectedDefinitionId: record.proposal.definitionId, goalId: record.goal.id,
  motivationIds: [...record.proposal.motivationIds],
  evidenceEventIds: record.proposal.evidenceRefs.map((item) => item.eventId),
  activeObligationIds: [...record.activeObligationIds], outcome: record.outcome,
  frameHash: record.frameHash,
  ...(record.reasonerMetadata === undefined ? {} : { reasonerMetadata: structuredClone(record.reasonerMetadata) })
});

const inspectPlan = (record: AcceptedPlanRecord): PlanInspection => ({
  frameId: record.frameId, basedOnVersion: record.basedOnVersion,
  resultingStateVersion: record.resultingStateVersion, goalId: record.plan.goalId,
  planId: record.plan.id,
  ...(record.plan.strategyId === undefined ? {} : { strategyId: record.plan.strategyId }),
  offeredCapabilityIds: record.offeredCapabilities.map((item) => item.id),
  selectedCapabilities: record.plan.steps.map((step) => step.capabilityId),
  successConditionRefs: [...record.plan.successConditionRefs],
  failureConditionRefs: [...record.plan.failureConditionRefs],
  acknowledgedObligationIds: [...record.plan.acknowledgedObligationIds],
  frameHash: record.frameHash, source: record.plan.source,
  ...(record.reasonerMetadata === undefined ? {} : { reasonerMetadata: structuredClone(record.reasonerMetadata) })
});

const inspectDecision = (record: AcceptedDecisionRecord): DecisionInspection => ({
  frameId: record.frameId, basedOnVersion: record.basedOnVersion,
  decisionId: record.decisionId, eligibleIntentionIds: [...record.eligibleIntentionIds],
  selectedIntentionId: record.output.intentionId, reasonCode: record.output.reasonCode,
  commitment: record.output.commitment, enforcedObligationIds: [...record.enforcedObligationIds],
  usedFallback: record.usedFallback,
  ...(record.fallbackReason === undefined ? {} : { fallbackReason: record.fallbackReason }),
  frameHash: record.frameHash
});

const inspectLifecycle = (plan: Readonly<Plan>): PlanLifecycleInspection => ({
  planId: plan.id, goalId: plan.goalId, status: plan.status,
  ...(plan.statusReason === undefined ? {} : { statusReason: plan.statusReason }),
  steps: plan.steps.map((step) => ({
    stepId: step.stepId, capabilityId: step.capabilityId, status: step.status,
    attempts: step.attempts ?? 0,
    ...(step.committedDecisionId === undefined ? {} : { decisionId: step.committedDecisionId }),
    ...(step.actionId === undefined ? {} : { actionId: step.actionId }),
    outcomeEventIds: [...(step.outcomeEventIds ?? [])],
    ...(step.statusReason === undefined ? {} : { statusReason: step.statusReason })
  }))
});
