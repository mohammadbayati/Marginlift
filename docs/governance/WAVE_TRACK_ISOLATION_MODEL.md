# Wave Track Isolation Model

Status: Draft
Project: BourseSense
Primary reference: `INDEPENDENT_REVIEW_WAVES_4_13.md`

## Purpose

This document defines the Wave-track isolation model for BourseSense and
explains how it differs from, relates to, and must eventually reconcile with
the Phase-track feature-flag governance model.

The Wave track is currently an isolation model, not a promotion model. It can
show that Wave work is structurally separated, but it does not prove scoring
neutrality without runtime validation.

## Why Phases 0-13 Used Feature Flags

Phases 0-13 used feature flags because Phase-track work was closer to runtime
application behavior and scoring-sensitive paths.

Feature flags provided explicit runtime control. They allowed incomplete or
experimental work to exist in the repository while remaining disabled unless
intentionally activated. They also created a clear rollback mechanism and a
clear audit line between implemented code and promoted behavior.

The Phase track also required formal no-scoring-impact reports. Those reports
documented that disabled or unpromoted Phase work did not affect scoring
outputs. This was necessary because Phase work could share runtime paths,
configuration, dependencies, or scoring-adjacent modules.

The Phase-track model therefore governed runtime exposure.

## Why Waves 4-13 Use Boundary Tests

Waves 4-13 currently use AST boundary tests and reverse-import checks because
Wave work is being governed as isolated, pre-promotion work.

This model is appropriate while Wave modules remain outside promoted scoring
paths and while their status is local-main-only or documentation-only. The goal
is to prevent accidental coupling before runtime promotion is considered.

The Wave-track model therefore governs structural isolation.

## What AST Boundary Tests Prove

AST boundary tests can prove that prohibited direct imports are absent in
checked source files.

They can verify that Wave modules do not import scoring modules directly. They
can also verify that scoring modules do not reverse-import Wave modules. This
is stronger than simple text matching because the tests inspect parsed code
structure.

AST boundary tests provide evidence that source-level ownership boundaries are
being respected.

## What AST Boundary Tests Do Not Prove

AST boundary tests do not prove that scoring behavior is unchanged.

They do not cover:

- dynamic imports
- runtime configuration
- environment variables
- file reads
- file writes
- generated artifacts
- caches
- registries
- local persistence
- external services
- command execution
- product-surface exposure

For this reason, AST boundary tests are necessary but insufficient. They are
architecture evidence, not complete no-scoring-impact evidence.

## Persistence Side Channels

File-based persistence requires separate tests because it can bypass import
boundaries.

A Wave module can affect scoring without importing scoring code if it writes a
file, registry, cache, artifact, or local state path later consumed by scoring
or product runtime. This is the main unresolved side-channel risk for Waves
12/13.

Wave 12/13 must therefore have a persistence-boundary test before promotion
discussion. That test must prove that Wave persistence paths cannot alter
scoring inputs, scoring outputs, snapshots, runtime configuration, or promoted
product behavior unless explicitly promoted.

## Local-Main-Only Restriction

Waves 6-13 must remain local-main-only or documentation-only until validation
is executed.

This restriction exists because the current Wave-track evidence is not yet
equivalent to Phase-track no-scoring-impact governance. Static isolation does
not replace runtime validation.

## Required Artifacts Before Promotion Discussion

Before any promotion discussion, the following artifacts are required:

- `WAVE_TRACK_FINAL_REVIEW.md`
- `WAVE_{6..13}_SHADOW_VALIDATION_REPORT.md`
- `WAVE_{4..13}_NO_SCORING_IMPACT_VALIDATION.md`
- persistence-boundary test for Wave 12/13
- product-surface docs for Wave 11/12

These artifacts must show both architecture isolation and runtime
no-scoring-impact evidence.

## Relationship To Phase Governance

The Wave model and Phase model are related but not equivalent.

The Wave model proves structural containment before promotion. The Phase model
proves controlled runtime behavior through flags, validation, and
no-scoring-impact reporting.

Before Wave work can be promoted, its evidence must reconcile with the Phase
standard. The claim must move from "no forbidden static dependency exists" to
"no scoring impact exists under validated runtime conditions."

## Future Wave Governance

Future Wave work must follow this sequence:

1. Plan first.
2. Define boundary expectations.
3. Produce test evidence.
4. Produce no-scoring-impact validation.
5. Complete independent review.
6. Complete final review.
7. Pass an explicit promotion gate.

No Wave should move from isolated development into promoted behavior through
implication, naming, documentation presence, or merge proximity. Promotion must
be explicit.
