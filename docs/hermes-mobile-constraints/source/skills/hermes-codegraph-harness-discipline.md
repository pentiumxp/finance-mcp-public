---
name: hermes-codegraph-harness-discipline
description: Use before Hermes Mobile H1/H2 workflow changes, service/provider/route edits, harness planning, CodeGraph impact analysis, or focused test selection. Requires CodeGraph structural triage for backend symbols while preserving rg/direct-read backup for frontend closure functions, DOM strings, static versions, service-worker behavior, and docs.
---

# Hermes CodeGraph Harness Discipline

Use this skill to make CodeGraph useful without overstating it. CodeGraph is the
first structural pass for Hermes Mobile backend work; it is not the only source
of truth for UI strings, closure-local functions, docs, or static cache files.

## Workflow

1. Read the current workspace context and relevant durable docs:
   - `.agent-context/PROJECT_CONTEXT.md`
   - `.agent-context/HANDOFF.md`
   - `docs/DOCS_INDEX.md`
   - `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
   - `docs/TEST_MATRIX.md`
2. Classify the change as H1/H2/H3 before editing.
3. Check CodeGraph health:
   - Prefer MCP `codegraph_status` when available.
   - Use `codegraph status` as the CLI fallback.
4. For backend service/provider/route symbols, run structural triage:
   - Use `codegraph_context` for broad feature or bug context.
   - Use `codegraph_search` for a known symbol.
   - Use `codegraph_callers` and `codegraph_callees` to map wiring.
   - Use `codegraph_impact` to propose affected files and focused tests.
5. For frontend UI, DOM strings, static versions, service-worker behavior, and
   docs, use CodeGraph only as a coarse locator. Confirm with targeted `rg`,
   direct file reads, and focused tests.
6. If `codegraph impact` and text search disagree on tests, run the union of
   relevant focused tests unless the mismatch is clearly unrelated.
7. After code edits, refresh or verify the graph before making new structural
   claims:
   - `codegraph sync`
   - `codegraph status`

## Context Read Budget

Use this budget before H1/H2 implementation, debugging, or navigation analysis.
The goal is to make CodeGraph reduce context loading instead of adding another
step before broad file reads.

- Prefer MCP CodeGraph tools. Use CLI `codegraph` only as a fallback when MCP
  tools are unavailable.
- Before the first source-file read, run no more than three CodeGraph structural
  queries unless the result is ambiguous:
  - `codegraph_context` for broad feature, bug, or flow context.
  - `codegraph_trace` for a path question.
  - `codegraph_search` plus `codegraph_callers`/`codegraph_impact` for a known
    route, opener, service, or provider symbol.
- During the first triage pass, open no more than four source files.
- Read only the symbol body or about 80-120 lines around the relevant symbol.
- For `.agent-context/HANDOFF.md` and long docs, use `Select-String`/`rg` on
  current keywords first, then read only the matching small section.
- For route/navigation bugs, use a route-first sequence:
  - CodeGraph context for the visible flow.
  - callers/search for the route opener or return-route symbol.
  - one targeted `rg` pass for `data-*`, URL query keys, static versions, and
    test assertions.
- If the budget is insufficient, state the missing fact and widen the search
  deliberately instead of silently reading large files.

## Harness Gate

- H1 changes require an existing or newly added workflow harness scenario.
- H2 changes require contract/projection coverage.
- H3 changes may use focused tests only when they do not alter state, async
  behavior, permissions, routing, release artifacts, navigation, scroll, or
  service-worker behavior.
- CodeGraph evidence can support the classification, but it does not downgrade
  an H1/H2 flow to H3.
- Gateway toolset selection and run telemetry are H1 when changed. Do not
  hard-prune callable toolsets before a first-round model decision. The safe
  pattern is model-first toolset selection: first show a compact capability
  catalog and authorized policy summary, then expand the model-selected
  authorized toolsets for execution, with an explicit escalation path for
  additional authorized toolsets. Blocked developer, shell, source, process,
  broad MCP, or cross-workspace toolsets remain denied unless the request enters
  an explicit Owner maintenance path.
- If the execution model emits `HERMES_TOOLSET_ESCALATION_REQUIRED` for
  toolsets that were omitted but authorized, Mobile must retry the same
  assistant message with the previous selected toolsets plus the requested
  authorized toolsets and skip the selector for that retry. Harness coverage
  must assert `run.toolset_escalation_required`,
  `run.toolset_escalation_retrying`, no raw marker leak, no premature terminal
  notification, and a bounded retry cap. Unauthorized or blocked escalation
  requests remain a controlled insufficient-toolset result.
- Gateway permission and toolset selection must enter the same model-side
  preflight. Do not add local natural-language permission routing before the
  model. The selector should use a ChatGPT low-cost model, a bounded timeout
  large enough for reliable completion, must fall back to the original
  authorized toolsets on failure, and should best-effort stop a known selector
  run id after timeout or abort. If the model returns
  `HERMES_PERMISSION_APPROVAL_REQUIRED`, execution must wait for explicit Owner
  approval.
- The selector is an internal JSON-only preflight. It must not browse, search,
  call tools, or load Skills. Harness coverage must assert tool calls are
  disabled for selector requests, live selector sessions contain no tool-role
  messages, repeated streamed JSON candidates parse successfully, and actual
  selector-model claims come from Gateway session/log evidence rather than only
  the request body's `model` field. Tens-of-seconds selector latency is
  acceptable if the decision reliably returns and fallback remains non-blocking.
- After a successful model-first permission/toolset selector decision, the main
  execution prompt must not load `productivity/hermes-mobile-permission-boundary-check`
  again or call `skill_view` for that Skill. The run-status UI should describe
  this as one combined permission and toolset preflight, not two separate
  user-visible steps.
- Gateway run telemetry harnesses must distinguish model-selection start/end,
  tool-call start/end, final-message start/end, terminal status, and liveness
  failure without storing raw prompts, raw model responses, secrets, endpoints,
  or user private content.
- Run-status UI harnesses must verify terminal history is available from the
  first retained event in a scrollable footer panel, portrait popovers stay
  inside the viewport, unnamed function events are omitted instead of shown as
  generic `Function`, and Skill footer chips render only real loaded Skills or
  `skill_view` evidence, never a synthetic Response fallback.
- Completed run-status history popovers on mobile should prefer the space above
  the tapped status chip and stay scrollable inside the viewport. Do not default
  them to a bottom-fixed sheet that covers the lower conversation or composer
  area.
- Run-status inline refresh must preserve the user's previous viewport bottom
  offset. Do not repeatedly force `scrollTop = scrollHeight` or call the generic
  bottom-scroll helper from the status refresh path; harnesses should detect
  this because it causes one-line mobile scroll jitter.
- Run-status high-frequency preflight events must update the inline panel in
  place. Do not trigger one generic full-thread render for every model-selected
  or toolset-selection event. If the target assistant message is not visible yet,
  schedule one short delayed fallback thread refresh and coalesce later preflight
  events into it. Compact `run.toolset_selection_started` with the matching
  terminal toolset-selection row for the same run so the phone UI does not flash
  two instant rows.
- Action Inbox list processing belongs on the inline status badge after
  source/type. Tapping the compact status/action badge opens the viewport-level
  action sheet. The visible label must show the real status such as `待处理`,
  `稍后`, or `已完成`, not a generic `处理` command. Keep it at compact metadata
  weight: small text, subtle chevron, transparent or near-transparent surface,
  no large filled pill, no heavy border, and no high-contrast action color. Do
  not add a separate right-side `处理` button or in-card clipped menu.
- Action Inbox default list sorting is newest first by update/event/create time.
  Source/type priority must not bury a newer Automation receipt under older
  Todo/reminder rows.
- Automation Web Push clicks must route directly to Automation detail when
  `automationId` is present. `inboxItemId` on an Automation payload is metadata
  for return context/foreground refresh, not the primary click destination.
- Static client settings that affect theme must keep a three-state
  device-local contract: `system`, `light`, and `dark`. Apply `data-theme`
  before CSS loads, store the mode in localStorage, update mobile
  `theme-color` / `apple-mobile-web-app-status-bar-style`, and only react to OS
  color-scheme changes while the selected mode is `system`.
- Wardrobe-bound topic runs treat `wardrobe`, `vision`, and `file` as an
  inseparable authorized companion set when all three are suggested and
  authorized. If the selector chooses any one of them, execution must keep all
  authorized companions so image analysis, Wardrobe MCP, and Markdown/file
  receipts remain available.
- For Gateway toolset selection runtime changes, include
  `node tests\gateway-run-model-toolset-selection-service.test.js`,
  `node tests\gateway-run-start-service.test.js`,
  `node tests\gateway-run-event-service.test.js`,
  `node tests\gateway-run-lifecycle-service.test.js`, and
  `node tests\task-list-ui.test.js` in the focused validation set.
- Cross-shell production operations are H1. Do not pass inline or multi-line
  Bash through PowerShell `bash -lc` or `bash -c`; write a UTF-8 no-BOM script
  file, convert the path with `wslpath`, execute `bash <script-path>`, and run
  `node tests\cross-shell-command-harness.test.js` when touching startup,
  Gateway Pool, WSL, hotfix, backup, or connector provisioning scripts.

## Known Boundaries

The 2026-05-26 local benchmark in `C:\Users\xuxin\Documents\Agent` found:

- MCP structural calls for `createLearningGrowthSubmissionService` returned in
  roughly `12-18ms`.
- CLI `codegraph` calls returned in roughly `196-218ms` due to process startup.
- `rg` was faster for literal text (`20-61ms`) but returned text matches rather
  than caller/callee/impact semantics.
- `codegraph_impact createLearningGrowthSubmissionService` directly found
  `server-routes/mobile-api-composition.js` and
  `tests/learning-growth-submission-service.test.js`.
- `codegraph affected public/app-learning-growth-task-ui.js -q` returned no UI
  tests, while targeted `rg` found related UI test references.

Use these results as current guidance, not a permanent benchmark. Re-test after
major CodeGraph, repository, or test layout changes.

## Final Report

Report:

- H1/H2/H3 classification.
- CodeGraph queries used and the structural result.
- Whether the Context Read Budget was followed, and what was widened if not.
- Any `rg` or direct-read backup used because CodeGraph missed UI/text edges.
- Focused tests selected and why.
- Whether `codegraph status` was current after edits.
