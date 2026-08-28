# Phase 3.0 Slice E: Reference-World Conformance

Status: implemented on `phase-3.0-core-generalization`

## Outcome

Slice E closes Phase 3.0 with three unrelated reference domains using the same
public contracts, SDK registry, runtime lifecycle, execution port, authoritative
outcome observation, and deterministic replay mechanism.

| Reference | Installed cognition | Proof |
| --- | --- | --- |
| Social/political | memory, social, goals, conversation | decision, speech, action, observed effect, accepted-decision replay |
| Reconnaissance drone | traits and drone mission pack | two decisions, enforced withdrawal obligation, two actions, observed effects, exact full-trajectory replay |
| Colony logistics | colony logistics pack only | four legal domain intentions, reroute decision, action, observed delivery, exact full-trajectory replay |

The colony domain lives only in `cortex-sandbox-sim`. It contributes custom
facility, resource-node, transport-route, and hazard entity types plus its own
constraints, effects, slice, frame section, skill, and fake-world adapter. No
colony-specific branch or identifier was added to Cortex production source.

## Replay compatibility

Schema-v2 cognitive frames and accepted-decision records now carry a sorted
compatibility-component manifest in addition to its canonical fingerprint. The
manifest identifies installed domains, packs, state-slice schemas,
frame-section schemas, constraint matchers, and effect matchers. Replay compares
both the explicit metadata and its fingerprint before accepting controller
output.

The drone runtime scenario is now `drone-live-runtime-v2`. New live runs create
v2 bundles with complete compatibility metadata. Frozen schema-v1 bundles keep
their original `drone-live-runtime-v1` identity and continue through the
explicit legacy replay adapter; they are never rewritten.

## Registration and boundary checks

`PackRegistry.registerAll` supports unordered batch installation while failing
closed on missing dependencies, incompatible versions, duplicate packs, and
dependency cycles. Compatibility construction rejects duplicate or invalid
component declarations.

The runtime controller no longer owns a social-specific request field. Packs
receive optional namespaced `sectionInputs`, so social signals are just one
pack-owned input and future domains can contribute their own data without a
kernel contract change.

An automated production-source scan prevents drone, colony, social-reference
fixtures, social-specific controller inputs, and standard-pack imports from
appearing in contracts, runtime, or provider production source.

## Offline verification

The completed default matrix makes no provider calls:

- Cortex: typecheck and 62 tests across 13 files;
- sandbox: typecheck, build, and 34 tests across 7 files;
- colony replay mismatch: altered pack or matcher version fails before commit;
- drone replay: zero model calls and exact trajectory/state equality;
- social replay: accepted output revalidates against the recorded frame;
- legacy replay: frozen v1 artifact follows the explicit compatibility path;
- Phase 2 baseline fixtures remain immutable.

A bounded live drone run is intentionally not part of this matrix. It may be
used later to create the first provider-backed `drone-live-runtime-v2` replay
artifact without changing the frozen Phase 2 evaluation baseline.
