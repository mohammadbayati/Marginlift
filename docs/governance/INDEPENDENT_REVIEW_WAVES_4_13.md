# Independent Review: Waves 4-13

Status: Official governance review
Project: BourseSense
Scope: Waves 4-13

## Purpose

This document records the independent review of the Wave-track work for
BourseSense Waves 4-13. It is intended to serve as the primary governance
reference for subsequent Wave-track isolation, validation, and promotion
documents.

The review focuses on whether the current Wave-track controls are sufficient
to support promotion discussion. It does not approve promotion, staging,
deployment, scoring changes, feature-flag changes, or product-surface exposure.

## Review Conclusion

Waves 4-13 are not ready for promotion discussion yet.

The current Wave-track evidence is useful, but incomplete. AST boundary tests
and reverse-import checks provide meaningful evidence that source-level import
boundaries are being preserved. They do not, by themselves, prove that scoring
behavior is unchanged under runtime conditions.

Before any promotion discussion, Wave-track work must produce explicit
no-scoring-impact validation, shadow validation for Waves 6-13, persistence
boundary coverage for Waves 12/13, and product-surface documentation for
Waves 11/12.

## Reviewed Governance Claims

The review accepts the following claims as currently supportable:

- Wave-track work can be governed separately from Phase-track work while it
  remains isolated, local-main-only, and unpromoted.
- AST boundary tests can provide evidence that prohibited direct imports are
  absent.
- Reverse-import checks can provide evidence that scoring paths do not directly
  depend on Wave-track modules.
- Documentation-only status can be valid for unvalidated Wave work when it is
  clearly marked and blocked from promotion.

The review rejects the following claims as unsupported without further
evidence:

- AST boundary tests prove no scoring impact.
- Reverse-import checks prove runtime isolation.
- Documentation presence implies promotion readiness.
- Local-main-only work can be staged or promoted without shadow validation.
- File-based persistence cannot affect scoring unless direct imports exist.

## Phase-Track Comparison

The Phase-track governance model used feature flags and formal
no-scoring-impact reports because Phase work was closer to runtime scoring
behavior. Feature flags made runtime exposure explicit. No-scoring-impact
reports recorded that disabled or unpromoted work did not alter scoring output.

The Wave-track model is currently weaker than the Phase-track model because it
relies primarily on static boundaries and documentation gates. That is
acceptable for isolation, but not sufficient for promotion.

Wave-track work must eventually reconcile with Phase-track governance by
producing runtime evidence equivalent to a formal no-scoring-impact review.

## Boundary Evidence Assessment

AST boundary tests are valuable because they inspect code structure rather than
plain text. They can detect direct import relationships and enforce ownership
rules across modules.

However, AST boundary tests do not prove runtime behavior. They do not cover
dynamic imports, file reads, file writes, environment variables, generated
artifacts, caches, registries, external services, or command execution. They
also do not prove that user-visible product surfaces are absent or harmless.

Reverse-import checks are similarly valuable but limited. They can show that
scoring modules do not directly import Wave modules. They cannot show that
scoring modules are unaffected by shared persistence, shared configuration, or
indirect runtime side effects.

## Persistence Boundary Finding

File-based persistence is the main unresolved side-channel risk for Waves
12/13.

A Wave module can affect scoring without importing scoring code if it writes to
a file, registry, cache, artifact, or local state path later consumed by
scoring or product runtime. Because this bypasses import boundaries, it
requires separate persistence-boundary testing.

Required test plan:

- Identify all Wave 12/13 write paths, generated artifacts, caches, registries,
  and local persistence files.
- Identify all scoring and product runtime read paths.
- Assert that Wave 12/13 persistence paths are not consumed by scoring unless
  explicitly promoted.
- Assert that running Wave 12/13 routines cannot modify scoring inputs,
  registries, snapshots, or runtime configuration.
- Assert that no file created by Wave 12/13 changes scoring output in a clean
  validation run.

This test plan must be implemented and executed before promotion discussion.

## Required Artifacts Before Promotion Discussion

The following artifacts are required before any Wave-track promotion discussion:

- `WAVE_TRACK_FINAL_REVIEW.md`
- `WAVE_{6..13}_SHADOW_VALIDATION_REPORT.md`
- `WAVE_{4..13}_NO_SCORING_IMPACT_VALIDATION.md`
- persistence-boundary test for Wave 12/13
- product-surface docs for Wave 11/12

Until those artifacts exist and pass review, Waves 6-13 must remain
local-main-only or documentation-only.

## Governance Decision

The independent review establishes the following governance decision:

Wave-track work may remain in isolated development, but it must not be staged,
promoted, deployed, or treated as scoring-neutral until runtime validation
evidence exists.

Promotion requires an explicit gate. Promotion must not happen through merge
proximity, documentation presence, naming, or assumed equivalence with
Phase-track controls.

## Required Next Steps

1. Maintain Wave-track isolation until validation is complete.
2. Prepare the Wave Track Isolation Model using this review as its primary
   reference.
3. Prepare the Wave Track Final Review as a draft until validation artifacts
   exist.
4. Implement and execute the Wave 12/13 persistence-boundary test.
5. Execute the validation suite.
6. Discuss staging or promotion only after the required evidence exists.
