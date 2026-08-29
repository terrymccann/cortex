# Phase 3.2: Living Story Runtime

Status: complete; authenticated live baseline accepted and frozen
Scope: authoritative textual worlds, bounded ensemble orchestration, dialogue,
narrative rendering, designer authoring, inspection, evaluation, and replay  
Depends on:
[Phase 3.0: Core Generalization and Extension Contracts](phase-3.0-core-generalization.md),
[Phase 3.1: Bounded Emergent Autonomy](phase-3.1-bounded-emergent-autonomy.md),
[technical-design.md](technical-design.md), and
[product-architecture.md](product-architecture.md)

## 1. Purpose

Phase 3.2 proves that Cortex can power a designer-authored, text-first living
world in which autonomous characters act out a scenario that has an authored
beginning and rules but no predetermined plot.

The phase answers one question:

> Can several bounded Cortex agents produce a coherent, readable, causally
> grounded story over time without allowing a character model or narrator to
> invent world truth?

This is a product-boundary proof, not a new genre embedded in Cortex core. The
living-story host, story domain, reference scenario, and reader belong in a
separate repository and consume Cortex through public contracts.

## 2. Product thesis

A living story is not a collection of models taking turns writing fiction. It
is an authoritative simulation rendered as prose.

```text
Character cognition
  proposes goals, plans, speech, and actions
                 |
                 v
Authoritative story world
  validates actions and records consequences
                 |
                 v
Narrative Director
  selects accepted events and presentation order
                 |
                 v
Narrative renderer
  expresses grounded events as readable prose
```

Cortex supplies character agency. The story host supplies truth, time, action
resolution, ensemble scheduling, and presentation.

## 3. Prerequisites

Phase 3.2 begins only after Phase 3.1 has:

- frozen a live bounded-autonomy baseline;
- validated goal and plan proposals against registered domain semantics;
- demonstrated authoritative action outcomes and bounded replanning;
- recorded full causal trajectories;
- replayed accepted trajectories with zero model calls; and
- kept evaluation preferences out of runtime prompts.

The accepted Phase 3.1 baseline remains a regression boundary. Story-product
work must not weaken it.

## 4. Outcome

At the end of Phase 3.2, a designer can:

1. define a contained scenario, detailed Character Codices, locations, objects,
   secrets, narrative styles, and opening events using versioned authoring
   files;
2. validate that content without editing Cortex core;
3. start a text-first simulation containing at least four autonomous
   characters;
4. observe characters form goals, move between locations, investigate,
   converse, reveal or conceal information, and react to consequences;
5. pause, resume, accelerate, and inspect the simulation;
6. introduce a bounded director event without granting every character
   knowledge of it;
7. follow several interwoven story threads that can diverge, return, merge, and
   resolve without violating canonical chronology;
8. read a coherent live prose narrative grounded in accepted story events and
   choose among designer-permitted narrative styles;
9. inspect why a character acted using structured causal records rather than
   hidden chain-of-thought; and
10. replay the complete accepted story and presentation trajectory with zero
    model calls.

## 5. Non-goals

Phase 3.2 does not include:

- a visual game engine, tile renderer, animation system, or asset pipeline;
- unrestricted collaborative fiction in which generated prose becomes truth;
- a model-authored ontology, action type, policy, character, or location;
- full diplomatic negotiation, factions, institutions, or shared-plan
  protocols;
- unrestricted user edits to canonical history;
- production-scale persistent worlds or distributed scheduling;
- a marketplace for scenarios or packs;
- a polished commercial authoring application;
- exact imitation profiles named for living authors or other protected creator
  identities;
- voice synthesis, image generation, or cinematic presentation;
- autonomous code execution or self-modifying story rules; or
- continual model calls for every character after every sentence.

## 6. Authority boundary

| Concern | Owner |
| --- | --- |
| Canonical facts, time, presence, possession, and outcomes | Story world |
| Character observations | Observer projection |
| Stable authored identity, history, traits, and voice | Versioned Character Codex |
| Character memories, beliefs, goals, and plans | Cortex packs and managers |
| Legal character capabilities | Designer-authored story domain |
| Immediate character decisions | Cortex Controller |
| Action validation and consequences | Deterministic story action resolver |
| Speech intention and proposed utterance | Character reasoner or deterministic dialogue policy |
| Whether an utterance was spoken and heard | Story world |
| Scene selection and reader viewpoint | Narrative Director |
| Permitted prose characteristics | Designer-authored narrative style profiles |
| Prose expression of accepted events | Narrative renderer |
| Canonical story history | Accepted event log |

Generated narration is presentation, not state. A sentence cannot make a door
open, injure a character, transfer an object, reveal a secret, or establish a
fact unless an accepted source event already records that change.

## 7. Repository and dependency boundary

The initial implementation should use a separate repository, tentatively
`cortex-living-story`.

```text
cortex
  provider-neutral runtime, SDK, packs, and optional provider adapters

cortex-living-story
  story domain
  authoritative story host
  ensemble and scene scheduler
  Narrative Director
  prose renderer
  reader and inspector
  reference scenario
  living-story evaluations
```

The living-story repository may depend on published or workspace-linked Cortex
packages. Cortex production packages may not import it.

A core change is permitted only when the clean-room integration demonstrates a
general public-contract gap. Any such change must pass the existing drone,
colony, social-reference, replay, and Phase 3.1 baseline tests without adding
story-specific identifiers to production source.

## 8. Authoritative story state

The story host owns a versioned state containing at minimum:

- simulation time and scene chronology;
- characters and their current locations;
- location topology and access constraints;
- objects, ownership, possession, and visibility;
- public facts and world conditions;
- private source facts used to construct observer projections;
- accepted actions and outcomes;
- current conversations and scene membership; and
- externally introduced director events.

Story state is not a prose document. It is structured, validated data. Prose is
derived from it.

All writes use deterministic reducers or trusted action resolvers. Character
and narrator models receive snapshots and return proposals only.

## 9. Knowledge, belief, and secrets

The product must distinguish:

```text
world truth
  what the authoritative story state records

observation
  what a character could perceive from an event

belief
  what the character currently treats as likely

utterance
  what a character says, truthfully or otherwise

narration
  what the current reader viewpoint is allowed to see
```

A spoken claim does not become a world fact. A character may lie, misunderstand,
forget, infer incorrectly, or repeat a rumor. Cortex belief and memory packs
may update from those observations while the story state retains the canonical
distinction.

Secret visibility is controlled by observer projections and narrative
viewpoint policy, never by hiding text inside a shared prompt.

## 10. Story-domain vocabulary

The reference story domain should register semantic definitions for:

- character, location, object, passage, conversation, and information-source
  entity types;
- presence, visibility, audibility, possession, access, injury, and time facts;
- motivations such as safety, belonging, loyalty, curiosity, status, duty, and
  self-interest;
- goal definitions such as learn, protect, obtain, conceal, reveal, persuade,
  reconcile, escape, and expose; and
- effects and constraints used to evaluate those goals.

These definitions belong to a story pack or domain manifest. They are examples
of public extension contracts, not additions to the generic Cortex kernel.

## 11. Bounded action vocabulary

The MVP should support a small, explicit capability set:

- move to an adjacent accessible location;
- observe a visible character, object, or location feature;
- inspect or search a permitted target;
- initiate, join, leave, or interrupt a conversation;
- speak to one or more present recipients;
- ask, answer, accuse, deny, promise, warn, reveal, or deceive;
- give, take, show, hide, or use a permitted object;
- wait or disengage; and
- request assistance.

Every capability declares parameter schemas, target types, requirements,
risks, possible effects, and the deterministic skill that constructs the world
action.

The action resolver revalidates presence, access, possession, timing,
conversation membership, and other preconditions at submission time. It returns
accepted, rejected, interrupted, partial, failed, or completed outcomes with
authoritative evidence.

## 12. Dialogue contract

Dialogue is a world action with presentation content. A proposal conceptually
contains:

```ts
interface StoryUtteranceProposal {
  readonly dialogueActId: NamespacedId;
  readonly speakerId: AgentId;
  readonly recipientIds: readonly AgentId[];
  readonly topicRefs: readonly EntityRef[];
  readonly text: string;
  readonly toneTags: readonly NamespacedId[];
  readonly claimedFactRefs: readonly NamespacedId[];
  readonly reasonCode: NamespacedId;
}
```

The host validates speaker presence, recipients, dialogue-act registration,
length, content policy, and topic grounding. Accepted speech produces separate
observations for characters who could hear it.

`claimedFactRefs` identify what the speaker purports to assert. They do not
certify truth. Free text must never be parsed as an authoritative state patch.

## 13. Ensemble scheduler

Phase 3.2 introduces bounded multi-character orchestration without unrestricted
parallel model calls.

The scheduler must:

- activate only characters affected by a material event, present in the active
  scene, or due for bounded reflection;
- distinguish foreground, background, and dormant cognitive tiers;
- cap active reasoners per scene and model calls per simulation interval;
- serialize conflicting actions against explicit state versions;
- cancel or discard stale proposals when the world changes;
- prevent one character from monopolizing a conversation;
- allow urgent interruptions through deterministic policy; and
- advance off-screen routine behavior without prose or expensive reasoning.

Identical accepted inputs and recorded reasoner outputs must produce identical
ensemble ordering during replay.

## 14. Scene model

A scene is a presentation and scheduling boundary, not a separate reality. It
references canonical story state and includes:

- scene ID and simulation-time interval;
- location or linked locations;
- present and viewpoint characters;
- initiating event;
- unresolved tensions or active commitments;
- call, turn, and duration budgets; and
- accepted events eligible for narration.

The scene scheduler may open, continue, suspend, resume, or close a scene using
deterministic policy. A model may recommend emphasis but may not fabricate a
scene outcome.

## 15. Story Thread Manager

A story thread is a runtime grouping of accepted events, characters, locations,
goals, objects, and unresolved tensions. It helps the presentation layer follow
several developing situations without turning them into designer-authored plot
scripts.

Conceptually:

```ts
interface StoryThread {
  readonly id: StoryThreadId;
  readonly status: "emerging" | "active" | "background" | "merged" | "resolved";
  readonly characterIds: readonly AgentId[];
  readonly locationIds: readonly EntityId[];
  readonly sourceEventIds: readonly EventId[];
  readonly unresolvedTensionIds: readonly NamespacedId[];
  readonly relatedGoalIds: readonly GoalId[];
  readonly parentThreadIds: readonly StoryThreadId[];
  readonly narrativePriority: number;
  readonly openedAt: SimTime;
  readonly lastChangedAt: SimTime;
  readonly lastPresentedAt?: SimTime;
}
```

Threads emerge from canonical events and semantic associations. A designer may
seed an opening tension, but does not pre-author a required sequence of thread
events or resolution.

The deterministic Thread Manager owns:

- opening a thread when accepted events establish a material unresolved
  situation;
- attaching later events using explicit characters, locations, goals, objects,
  causal references, and tension tags;
- moving inactive threads between foreground and background status;
- merging threads when their causal situations converge;
- resolving a thread only from accepted resolution evidence;
- preventing one thread from monopolizing presentation; and
- producing safe, scored transition candidates for the Narrative Director.

Thread membership is presentation metadata. It does not change the meaning,
ordering, visibility, or authority of its source events.

### 15.1 Safe transition points

The Thread Manager may offer a transition only at a causally safe boundary,
including:

- an action outcome;
- a completed bounded dialogue exchange;
- an accepted discovery or material information change;
- a consequential decision whose immediate commit is complete;
- a scene pause, suspension, closure, or interruption; or
- an urgent accepted event in another thread.

It must not offer a transition:

- during an indivisible action or utterance;
- before a required response policy is satisfied or explicitly deferred;
- across an unresolved causal dependency;
- to a viewpoint that cannot observe the proposed narrative beat;
- before the current thread's minimum dwell budget; or
- when the destination thread has no new renderable event.

### 15.2 Transition candidates and selection

A transition candidate contains only accepted, permitted information:

```ts
interface ThreadTransitionCandidate {
  readonly threadId: StoryThreadId;
  readonly sourceEventIds: readonly EventId[];
  readonly permittedViewpointIds: readonly AgentId[];
  readonly urgency: number;
  readonly tension: number;
  readonly informationChange: number;
  readonly convergencePotential: number;
  readonly timeSincePresented: number;
  readonly continuityCost: number;
  readonly spoilerRisk: number;
}
```

The deterministic fallback score is conceptually:

```text
urgency
+ tension
+ information change
+ convergence potential
+ time since presented
- continuity cost
- spoiler risk
- recent repetition
```

Designer pacing policy supplies bounded weights and minimum or maximum dwell
limits. It may create profiles such as balanced ensemble, single protagonist,
thriller, slow burn, mystery, or chronological chronicle. It cannot alter
character goals, action outcomes, knowledge, or canonical event order.

An optional Director reasoner may select from the eligible candidates and
choose a registered transition style such as continue, intercut, return,
viewpoint-shift, summarize, or close. The validator rejects any unoffered
thread, event, viewpoint, or transition style.

### 15.3 Starvation, cliffhangers, merging, and resolution

The Thread Manager enforces:

- a maximum interval before an active unresolved thread is reconsidered;
- a maximum number of unresolved cutaways before a promised return;
- no repeated cut immediately before the same deferred payoff;
- a cap on concurrent foreground threads;
- deterministic background summarization after inactivity;
- explicit causal evidence for thread merging; and
- explicit accepted evidence before resolution.

A cliffhanger is a presentation disposition, not a world-state transition. It
cannot delay an urgent character action or preserve a situation that the
simulation has already resolved.

### 15.4 Accepted presentation record

Every thread selection produces a versioned record containing:

- current and selected thread IDs;
- all eligible candidate thread IDs;
- selected source event IDs and viewpoint;
- deterministic score components;
- pacing-policy and schema versions;
- transition style and bounded reason code;
- whether selection came from a reasoner or fallback; and
- resulting scene and presentation sequence numbers.

Replay consumes the accepted record and performs no Director model call.

## 16. Narrative Director

The Narrative Director decides what the reader sees, not what becomes true.

It may:

- select only from safe thread-transition candidates offered by the Thread
  Manager;
- select a viewpoint allowed by reader mode;
- choose accepted events for foreground narration;
- group causally adjacent events into a narrative beat;
- request a scene transition;
- summarize uneventful elapsed time;
- suppress redundant presentation; and
- identify unresolved tensions for inspection.

It may not:

- change world or Cortex state;
- make a character choose an action;
- mark a goal, plan, action, or obligation successful;
- expose facts unavailable to the selected viewpoint;
- select an unoffered thread, source event, viewpoint, or transition style;
- reorder events across a causal dependency; or
- introduce an unregistered event.

Director output is strict, bounded, versioned, auditable, and optional. A
deterministic fallback selects the highest eligible thread score and can render
the accepted event stream without a model.

## 17. Narrative renderer

The renderer receives a bounded narrative beat containing source event IDs,
viewpoint permissions, a permitted narrative style profile, character
presentation and voice projections, and accepted speech. It always returns
reader-facing prose plus explicit source references.

The renderer may add non-canonical connective language, sensory style already
supported by visible facts, and dialogue attribution. It must quote or preserve
accepted utterances according to policy and must not add consequential actions
or facts. Narrative style may alter prose cadence, perspective, tense,
description, interiority, and pacing; it may not rewrite canonical history or
silently change a character's accepted utterance.

If prose validation fails, the system renders deterministic template-based
prose. A plain structured event ledger remains available for accessibility,
inspection, and debugging, but is not the normal reader presentation. The
canonical transcript always retains source event links so a reader can
distinguish simulation history from presentation.

## 18. Designer authoring contract

The MVP authoring format should provide versioned files for:

- scenario metadata and opening conditions;
- Character Codices and presentation descriptions;
- character voice and narrative style profiles;
- motivations, traits, relationships, and initial beliefs;
- private and public knowledge;
- locations, passages, objects, and access rules;
- domain and pack configuration;
- allowed director interventions;
- pacing profiles, thread limits, cognition, and content budgets; and
- evaluation fixtures and expected invariants.

The toolchain must validate references, namespaces, schema versions, duplicate
ownership, impossible locations, inaccessible required objects, missing skills,
invalid secrets, and incompatible packs before a run starts.

Author files provide conditions, opening tensions, and behavioral envelopes.
They do not contain a hidden required plot, prescribe thread resolutions, or
leak evaluation answers into character frames.

### 18.1 Character Codex

Each authored character has one immutable, versioned Character Codex. The Codex
is the detailed source definition of who the character was when the run began;
it is not the character's entire mutable mind.

Conceptually:

```ts
interface CharacterCodex {
  readonly id: NamespacedId;
  readonly version: number;
  readonly agentId: AgentId;
  readonly displayName: string;
  readonly identityTags: readonly NamespacedId[];
  readonly biographyEntries: readonly CharacterBiographyEntry[];
  readonly valueIds: readonly NamespacedId[];
  readonly traitSeeds: Readonly<Record<NamespacedId, number>>;
  readonly motivationSeeds: Readonly<Record<NamespacedId, number>>;
  readonly fearIds: readonly NamespacedId[];
  readonly desireIds: readonly NamespacedId[];
  readonly competencyIds: readonly NamespacedId[];
  readonly habitIds: readonly NamespacedId[];
  readonly relationshipSeeds: readonly CharacterRelationshipSeed[];
  readonly knowledgeRefs: readonly CharacterKnowledgeRef[];
  readonly voiceProfileId: NamespacedId;
  readonly presentationProfileId: NamespacedId;
  readonly contentBoundaryIds: readonly NamespacedId[];
}
```

A Codex may describe:

- identity, age range, role, culture, and social position;
- canonical biography and formative events;
- values, loyalties, fears, desires, prejudices, and moral boundaries;
- registered personality and motivational seeds;
- competencies, limitations, habits, mannerisms, and preferences;
- initial relationships and their source history;
- canonical, private, claimed, and uncertain knowledge references;
- physical and sensory presentation details used by the renderer; and
- a stable character voice profile.

The following do not belong in the immutable Codex:

- newly observed events;
- current memories or beliefs;
- evolving relationships;
- current emotional state;
- active goals, plans, decisions, or obligations;
- injuries, possession, presence, or other mutable world facts; or
- future plot instructions and required choices.

Those belong to authoritative world state or owned Cortex state slices. This
separation lets a character change through experience without rewriting their
authored identity.

### 18.2 Codex projections and retrieval

The complete Codex is never copied into every model request. A deterministic
Codex compiler validates it, fingerprints it, and produces bounded projections:

- a cognitive projection containing situation-relevant stable traits, values,
  biography, knowledge, and relationships;
- a dialogue projection containing voice, register, habits, boundaries, and
  relevant relationship context;
- a narrative projection containing permitted appearance and presentation
  details; and
- a reader projection containing only information unlocked for the selected
  reader mode.

Every projection records Codex version, selected facet IDs, visibility basis,
and token or size budget. Secret facets never enter an unauthorized character,
Director, renderer, or reader frame. Codex prose is untrusted data and cannot
alter instructions or policies.

### 18.3 Character voice profiles

Character voice is separate from narrative style. A versioned voice profile may
define vocabulary register, formality, sentence rhythm, directness, humor,
favorite constructions, taboo expressions, dialect constraints, and dialogue
length limits.

The designer owns the permitted character voice. A reader changing narrative
style does not rewrite accepted speech or make every character sound like the
narrator. Character development may influence dialogue through mutable Cortex
state, but it does not silently mutate the immutable voice profile.

### 18.4 Narrative style profiles

Narrative style is a versioned presentation contract. Conceptually:

```ts
interface NarrativeStyleProfile {
  readonly id: NamespacedId;
  readonly version: number;
  readonly perspective: "first-person" | "third-limited" | "omniscient";
  readonly tense: "past" | "present";
  readonly psychicDistance: "intimate" | "close" | "moderate" | "distant";
  readonly sentenceCadence: "clipped" | "varied" | "flowing";
  readonly descriptionDensity: number;
  readonly dialogueDensity: number;
  readonly interiority: number;
  readonly pacing: "slow-burn" | "balanced" | "urgent";
  readonly toneTags: readonly NamespacedId[];
  readonly vocabularyTags: readonly NamespacedId[];
  readonly contentLimitIds: readonly NamespacedId[];
}
```

Profiles should be named for characteristics or genres such as psychological
horror, military techno-thriller, gothic mystery, cozy detective, intimate
literary, pulp adventure, or hardboiled noir. The product must not depend on
imitating a living author's exact style. Public-domain profiles and
designer-authored style guides remain subject to the same grounding, content,
and authority rules.

The designer selects the allowed profiles and default. The reader may select
among allowed profiles. The Director may recommend an offered profile for a
scene, but cannot invent one or weaken content limits.

## 19. Reader modes

The reference application supports:

- **novel:** let the Director interleave all materially active threads;
- **observer:** read the selected narrative without controlling a character;
- **viewpoint:** follow one character and see only permitted information;
- **thread:** remain with one selected storyline while it has renderable events;
- **chronicle:** read accepted events primarily in canonical time order;
- **style selection:** render accepted beats through another
  designer-permitted narrative profile;
- **director:** introduce one of the scenario's registered external events;
- **character:** optionally control one character while Cortex runs the rest;
  and
- **inspection:** pause prose and inspect structured state and causal records.

Director input is treated as an external event proposal. It is validated,
recorded, and projected separately to each observer. A natural-language reader
message cannot directly mutate canonical state.

Changing style creates or selects a presentation edition. It does not rerun
character cognition, action resolution, or canonical simulation history.

## 20. Time, pacing, and cost

Simulation time is authoritative and independent of wall-clock latency. The
reader may pause, resume, or select supported speed tiers.

The host enforces budgets for:

- active scenes;
- active and foreground story threads;
- minimum dwell and maximum thread-absence intervals;
- unresolved cutaways;
- foreground characters;
- dialogue turns;
- goal and planning reconsiderations;
- provider calls and tokens;
- narrative beats;
- Codex projection and narrative-style rendering budgets;
- retries and timeouts; and
- elapsed simulation time without meaningful change.

Routine movement, waiting, known greetings, and other low-significance actions
should use deterministic policies where appropriate. Model reasoning is
reserved for choices whose context or consequences justify it.

Budget exhaustion produces an observable deterministic disposition such as
waiting, summarizing, deferring, or closing the scene. It never grants the
narrator or a character additional authority.

## 21. Persistence, replay, and branching

The MVP may remain local and file-backed, but it records:

- scenario, pack, Character Codex, voice-profile, and narrative-style
  fingerprints;
- ordered world events and state versions;
- observer projections;
- accepted goals, plans, decisions, actions, outcomes, and utterances;
- scene and Director records;
- thread lifecycle, transition-candidate, and accepted presentation records;
- narrative beats and source event IDs;
- presentation-edition lineage and style-profile versions;
- provider metadata and usage; and
- final state hashes.

Replay performs zero model calls and reproduces canonical state, accepted
character trajectories, thread lifecycle and merging, scene ordering, accepted
thread transitions, narrative-source selections, and final hashes. Exact prose
reproduction requires recorded renderer output; canonical replay does not
depend on regenerating prose.

Branching creates a new run with an explicit parent checkpoint and new external
event. It never edits the parent history in place.

A presentation edition may re-render existing accepted beats with another
allowed style without creating a canonical story branch. Exact replay uses
recorded prose. Generating a new edition may call a renderer, but never calls
character reasoners or changes story state.

## 22. Inspector

The inspector presents a causal timeline:

```text
world event
  -> observer projection
  -> memory or belief update
  -> goal opportunity
  -> accepted goal
  -> accepted plan
  -> immediate decision
  -> action or utterance
  -> authoritative outcome
  -> thread lifecycle or transition
  -> narrative beat
```

It shows structured factors such as motivations, relevant memory summaries,
active relationships, obligations, policy constraints, alternatives offered,
Codex facet references, voice and narrative style versions, provider usage, and
validation outcomes. It does not store or display hidden chain-of-thought.

## 23. Security and trust boundaries

Character biographies, memories, utterances, object text, scenario prose,
Codex prose, style guides, reader input, and generated narration are untrusted
data.

Tests must demonstrate that embedded instructions cannot:

- register an action, goal, fact, entity, or pack;
- expose a private fact to an unauthorized observer;
- bypass action validation or conversation membership;
- mutate world or Cortex state;
- alter scheduling, budget, content, or safety policy;
- cause a replay to call a model; or
- convert narrative prose into canonical history;
- expose secret Codex facets through cognition, narration, inspection, or style
  switching; or
- use a style or voice profile to override authority, safety, or content policy.

## 24. Reference scenario

The initial proof should use one contained setting with:

- four characters with detailed Codices and recognizably distinct voices;
- five connected locations;
- at least two private secrets and one false belief;
- one scarce or contested object;
- conflicting but non-scripted motivations;
- at least one promise or obligation;
- at least one lie or misleading utterance;
- at least one interrupted or rejected action;
- at least one off-screen event with selective observation;
- at least three threads that interleave, with two later merging; and
- multiple defensible story trajectories.

An isolated manor, stranded spacecraft, diplomatic residence, lifeboat, or
frontier outpost is suitable. The setting is chosen in the living-story
repository and must not appear in Cortex production source.

## 25. Delivery slices

### Slice A — Story host and authoring contracts (complete)

- create the separate living-story repository;
- define scenario, character, location, object, knowledge, thread, pacing, and
  policy schemas;
- define Character Codex, voice-profile, narrative-style, and projection
  schemas;
- implement authoring validation and deterministic story state; and
- add an offline reference scenario fixture.

### Slice B — Actions, dialogue, and observer projections (complete)

- register the bounded story-domain vocabulary;
- implement deterministic action and speech resolvers;
- apply bounded Character Codex and voice projections to cognition and speech;
- generate observer-specific perceptions; and
- prove secrets, lies, presence, audibility, and possession remain grounded.

### Slice C — Ensemble and scene orchestration (complete)

- implement cognitive tiers and event-driven activation;
- add bounded conversation turns and interruptions;
- serialize conflicting actions and stale proposals;
- implement thread emergence, association, starvation, merging, and resolution;
- produce deterministic safe-transition candidates and fallback scores; and
- record deterministic scene and thread lifecycle events.

### Slice D — Narrative Director, renderer, and reader (complete)

- implement provider-neutral Director and renderer contracts;
- implement prose-first rendering and designer-permitted style selection;
- preserve character voice independently of narrative style;
- validate Director selection against offered thread transitions and permitted
  viewpoints;
- add deterministic fallbacks;
- build a local live reader with pause, speed, novel, thread, viewpoint,
  chronicle, style, and inspection modes; and
- link every narrative beat to accepted source events.

### Slice E — Replay, evaluation, and product proof (complete)

- replay a complete story with zero model calls;
- add controlled ensemble, continuity, secret-leakage, thread interleaving,
  starvation, character consistency, voice separation, style invariance,
  pacing, diversity, and cost evaluations;
- run a bounded live reference scenario;
- freeze the first accepted Phase 3.2 baseline; and
- document all public-contract gaps discovered by the clean-room integration.

## 26. Required test matrix

The automated suite includes:

- invalid author references, namespaces, schemas, and pack dependencies;
- impossible movement, access, possession, and conversation actions;
- selective visibility and audibility;
- lies that update belief without mutating truth;
- private information that never appears in unauthorized frames or narration;
- invalid, oversized, incompatible, or instruction-bearing Character Codices;
- situation-relevant Codex retrieval within deterministic budgets;
- secret Codex facet isolation across character, Director, renderer, reader,
  and inspector projections;
- distinct character voices under the same narrative style;
- multiple narrative styles over identical canonical events;
- style changes that preserve facts, accepted speech, viewpoint permissions,
  event ordering, and final state hash;
- simultaneous conflicting actions and stale-result rejection;
- dialogue interruption, turn limits, and monopolization prevention;
- dormant and off-screen cognitive tiers;
- three simultaneous threads with bounded foreground selection;
- safe-cut gating during actions and dialogue;
- starvation prevention and overdue-thread return;
- bounded cliffhangers and prohibited repeated deferral;
- causal thread merging and evidence-backed resolution;
- pacing-profile changes that do not alter canonical history;
- thread and chronicle reader modes with viewpoint secrecy;
- scene call, token, turn, and duration exhaustion;
- narrator attempts to add actions, facts, or outcomes;
- reader prompt-injection and unauthorized director events;
- deterministic rendering fallback;
- exact canonical and thread-presentation replay with zero model calls;
- branch lineage and immutable parent history;
- multi-character goal, plan, action, and outcome trajectories;
- controlled scenario variants with multiple defensible developments; and
- production-source scans for reference-story identifiers in Cortex core.

Live provider evaluations never run in the default unit suite.

## 27. Acceptance criteria

Phase 3.2 is complete only when:

1. A new story scenario can be authored and run without editing Cortex core.
2. Canonical state changes occur only through trusted reducers and action
   outcomes.
3. Characters act only through registered, revalidated capabilities.
4. At least four agents sustain a bounded multi-scene trajectory with selective
   knowledge and no omniscient frame leakage.
5. At least one character lies or is mistaken without changing canonical truth.
6. At least one promise or obligation constrains a later decision.
7. Concurrent or interrupted actions produce deterministic, observable results.
8. At least three active story threads interleave, no active unresolved thread
   starves, and at least two threads merge from accepted causal evidence.
9. Every thread switch occurs at a safe transition point and preserves canonical
   event order and viewpoint secrecy.
10. Different pacing profiles change presentation selection without changing
    canonical world or character history.
11. Each character's versioned Codex produces bounded, relevant, auditable
    projections without leaking secret facets or becoming mutable runtime state.
12. At least four characters remain recognizably distinct in controlled
    dialogue evaluations without requiring scripted utterances.
13. At least three narrative styles render the same accepted beats as prose
    while preserving facts, accepted speech meaning, viewpoint permissions,
    event order, and final state hash.
14. Reader style selection creates a presentation edition without rerunning
    character cognition or canonical simulation.
15. The Narrative Director and renderer cannot mutate state or invent a
   consequential accepted event.
16. Every rendered narrative beat links to accepted source events and a permitted
   viewpoint.
17. Pause, resume, speed, novel, thread, viewpoint, chronicle, style, director,
    and inspection controls preserve authority and replay semantics.
18. Provider failure, timeout, invalid output, and budget exhaustion have
    deterministic fallbacks.
19. Injection attempts do not leak secrets, change policies, register
    vocabulary, or create canonical facts.
20. A complete accepted story replays with identical canonical events,
    character trajectories, thread lifecycle and selection sequence, scene
    order, and final state hash using zero model calls.
21. Behavioral evaluation reports continuity, causal grounding, secret
    containment, character consistency, voice separation, style invariance,
    ensemble and thread participation, starvation, diversity, repetition,
    safety, latency, tokens, and cost.
22. The first live Phase 3.2 quality baseline is reviewed and frozen without
    treating every non-preferred but defensible story development as failure.

## 28. Stop conditions

Phase 3.2 stops when the acceptance criteria pass and the initial living-story
baseline is frozen.

The phase does not continue merely because:

- a narrator could produce prettier prose;
- a designer prefers a different ending;
- every character does not receive equal page time;
- a defensible character choice complicates the story;
- a larger cast or setting would be more impressive; or
- visual, voice, hosted, or marketplace features remain desirable.

Work continues only for a demonstrated authority breach, secret leak,
continuity defect, thread starvation, unsafe or causally invalid transition,
unbounded loop, invalid action, replay mismatch, unsafe output, material
ensemble collapse, unusable authoring contract, or failure of the clean-room
product boundary.

## 29. Exit artifacts

Phase 3.2 produces:

- a separate living-story reference application repository;
- versioned story scenario and authoring schemas;
- versioned Character Codex, voice, narrative-style, and projection schemas;
- a bounded story-domain pack;
- authoritative action, speech, and observer-projection adapters;
- ensemble, scene, and Story Thread Managers;
- safe-transition and accepted thread-presentation records;
- provider-neutral Narrative Director and renderer interfaces;
- deterministic Director and rendering fallbacks;
- prose-first rendering and immutable presentation editions;
- a local live reader and structured causal inspector;
- canonical story replay and immutable branch lineage;
- ensemble behavioral evaluation tooling;
- one accepted four-character reference story and frozen baseline; and
- a report of public SDK improvements required by external product integration.

Completing Phase 3.2 proves that Cortex can support a coherent text-first living
world and a credible designer workflow. It does not yet prove production-scale
persistence, large populations, institutional simulation, or a finished hosted
product.
