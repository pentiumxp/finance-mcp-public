---
name: service-first-architecture
description: Use when implementing or reviewing product features, bug fixes, or refactors that must keep business logic out of large entrypoint/controller files by extracting services/providers, route modules, tests, architecture contracts, and CI guardrails. Applies across workspaces, not only Hermes Mobile.
metadata:
  short-description: Enforce service-first architecture boundaries
---

# Service-First Architecture

Use this skill to keep new behavior out of large entrypoint files such as `server.js`, `app.js`, controllers, or route monoliths.

## Core Rule

New behavior that contains business decisions, state transitions, external calls, queue policy, file conversion, permission checks, model prompt construction, or workflow orchestration must live in a service/provider first.

The entrypoint should only keep glue:

- request/auth/context extraction;
- route registration;
- dependency wiring;
- calling services/providers;
- formatting HTTP/SSE/CLI responses;
- short compatibility wrappers during staged refactors.

## Workflow

1. Read workspace context and local agent rules before editing.
2. Identify the large entrypoint file and existing local patterns.
3. Choose or create the smallest owning module:
   - Node/Hermes default: `adapters/<domain>-service.js`
   - route groups: `server-routes/<domain>-api-routes.js`
   - tests: `tests/<domain>-service.test.js`
4. Move deterministic behavior into pure helpers where practical.
5. Pass side effects as dependencies when practical: filesystem, database, HTTP, child process, Gateway, messaging, push, clock, logger.
6. Leave the entrypoint as glue and avoid unrelated rewrites.
7. Add focused service tests, then route/API tests only for boundary behavior.
8. Add or update architecture tests that prevent regression.
9. Update durable architecture docs and workspace rules when the contract changes.

## CI Guardrails

For each workspace, prefer explicit, testable guardrails:

- maximum top-level function/class budget if useful;
- assertions that new services and route modules export stable factories;
- assertions that entrypoint code delegates to services;
- assertions that entrypoint/controller code does not regain forbidden ownership
  over business workflows, persistence policy, Gateway lifecycle, permission
  policy, model prompt construction, or plugin-specific logic;
- repository docs that state the boundary.

Do not use physical line-count ceilings as architecture gates. Line counts are
diagnostic metadata only; they should not cause CI failures or motivate
compressing blank lines, comments, or readable helper functions into dense
single-line code.

## Review Checklist

Before commit or production rollout:

- Does the new behavior have an owning service/provider?
- Does the service have focused tests?
- Is the large entrypoint mostly glue?
- Are architecture boundary tests updated?
- Are secrets, tokens, push endpoints, private user content, and full raw logs excluded from docs/tests?
- If another session may be editing the workspace, re-read status and handoff before writing shared context.

## Cross-Workspace Adaptation

Do not force Hermes naming into other projects. Map the same contract to the local structure:

- Express/Koa/Fastify: services plus route modules.
- Next.js/Remix: server actions/API handlers delegate to services.
- Python/FastAPI: routers delegate to application services.
- CLI apps: command handlers delegate to services.

Use the repository's existing naming conventions unless they conflict with the service-first rule.
