---
name: hermes-mobile-doc-discipline
description: Use before non-trivial Hermes Mobile development, debugging, deployment, architecture/product-rule changes, or work touching Growth, Gateway, ChatGPT Pro, Skill permissions, Automation, Web Push, Weixin, static client/cache, persistence, security, or production operations. Enforces reading the right durable docs first and updating docs after code or operational changes.
metadata:
  short-description: Hermes Mobile doc-first engineering discipline
---

# Hermes Mobile Documentation Discipline

Use this skill as the documentation gate for Hermes Mobile work. It is an entrypoint, not the full knowledge base.

## When To Use

Use this skill before:

- code changes, production hotfixes, deployments, or data repairs
- architecture, module boundary, persistence, queue, auth, permission, or security changes
- Growth / learning, Gateway Pool, ChatGPT Pro, Skill permissions, Automation, Web Push, Weixin, static client/cache, or deployment work
- writing or changing product rules that will affect implementation

Skip only for clearly trivial commands, short status checks, or self-contained answers that do not touch Hermes Mobile behavior.

## Preflight

1. Read `.agent-context/PROJECT_CONTEXT.md` and `.agent-context/HANDOFF.md` for current workspace state.
2. Read `docs/DOCS_INDEX.md`.
3. Select the relevant docs:
   - architecture or boundaries: `docs/ARCHITECTURE.md`, `docs/ARCHITECTURE_BOUNDARY.md`
   - product rules: `docs/PRODUCT_REQUIREMENTS.md`
   - module behavior: `docs/MODULES/<module>.md`
   - code-level feature design: `docs/IMPLEMENTATION_NOTES/<feature>.md`
   - incident/debug workflow: `docs/RUNBOOKS/<incident>.md`
   - deployment/install: `docs/AGENT_WINDOWS_PRODUCTION_DEPLOYMENT.zh-CN.md` and `docs/MODULES/deployment.md`
4. If a needed module or runbook doc is missing, note the gap and create or update the smallest useful doc while making the change.

## Update Rule

Update docs in the same change when you alter durable behavior:

- business/product rule -> `docs/PRODUCT_REQUIREMENTS.md`
- architecture or responsibility boundary -> `docs/ARCHITECTURE.md` and/or `docs/ARCHITECTURE_BOUNDARY.md`
- module behavior, routes, files, validation -> `docs/MODULES/<module>.md`
- state machine, queue, persistence, permission, or complex algorithm -> `docs/IMPLEMENTATION_NOTES/<feature>.md`
- incident diagnosis or recurring production failure -> `docs/RUNBOOKS/<incident>.md`
- production/deployment/restart procedure -> `docs/MODULES/deployment.md`

`.agent-context/HANDOFF.md` records current rollout state only. Do not use it as the long-term design document.

## Privacy

Never store raw secrets, access keys, browser credentials, OAuth tokens, push endpoints, full learner answers, transcripts, full questions, answer keys, raw prompts, long logs, or full generated private reports in docs, handoffs, or Skill files.

Prefer metadata: ids, status fields, counts, file names, route names, timestamps, validation commands, and short summaries.

## Expected Final Report

For substantive work, report:

- docs read
- docs changed
- code/production changed
- validation run
- remaining doc gaps if any
