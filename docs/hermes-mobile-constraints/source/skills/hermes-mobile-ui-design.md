---
name: hermes-mobile-ui-design
description: Use when building or modifying Hermes Mobile frontend UI, PWA screens, mobile-first web app views, chat/topic/kanban/growth/automation/file screens, status panels, permission panels, or CSS/static UI code. Keeps the app in a calm control-panel style instead of generic SaaS or AI-generated visual drift.
metadata:
  short-description: Keep Hermes Mobile UI calm and consistent
---

# Hermes Mobile UI Design

Use this skill for Hermes Mobile frontend work. The goal is stable product UI, not decorative novelty.

Hermes Mobile is a private family AI control plane: chat, topics, files, Kanban, learning growth, automations, Weixin ingress, Gateway runs, model/tool status, and permission-controlled operations. Design for repeated operational use on mobile first.

## Design Direction

Use a calm control-panel style:

- quiet, structured, precise, low-noise
- mobile-native and information-dense without crowding
- status-forward and permission-aware
- suitable for family management and learning evidence workflows
- system-tool quality, not marketing-page style

Avoid:

- generic AI SaaS landing-page composition
- purple, pink, or blue-purple gradients as a dominant theme
- glassmorphism-heavy panels, neon accents, decorative blobs, or bokeh
- oversized hero typography inside tools, cards, modals, or task panels
- random emoji, playful childish education-app styling, or ornamental illustrations
- one-off card styles when an existing pattern can be reused

## Before Editing UI

1. For substantial UI work, state one concise Hermes Design Read before editing:
   - `Reading this as: <surface/workflow> for <user role>, with a calm Hermes control-panel language, optimizing for <status/evidence/action>.`
   - Examples of surface/workflow: chat run status, task detail, learning evidence, Growth owner review, permission elevation, automation detail, file preview, Gateway health.
   - If the surface identity is ambiguous, ask one focused question instead of guessing a visual direction.
2. Set the Hermes UI posture explicitly:
   - `density`: compact, standard, or spacious
   - `motion`: none, micro-feedback, or transition-only
   - `statusCriticality`: low, medium, or high
   - High status-criticality means state visibility and next action outrank visual polish.
3. Inspect the existing local pattern first:
   - `public/styles.css`
   - the relevant `public/app-*.js` module
   - nearby tests such as `tests/task-list-ui.test.js` and focused UI tests
4. Reuse existing classes, layout structure, CSS variables, and helper modules before adding new ones.
5. Keep changes bounded to the affected screen or component.
6. Do not change API contracts, permission semantics, analytics selectors, DOM ids used by tests, or learning state machines just to satisfy layout needs.
7. If backend behavior is touched, also use the service-first architecture rule.
8. If editing text on Windows or bumping static versions, use UTF-8 safe editing practices.

## Existing UI Audit

For redesigns, visual cleanups, or any UI change that touches an existing screen, audit before changing code.

Record the current state briefly:

- existing tokens: colors, type scale, spacing, radius, shadows, icons, and recurring component classes
- information architecture: navigation labels, tabs, primary actions, route/query state, and expected back behavior
- state semantics: loading, queued, running, waiting, blocked, review, done, failed, denied, expired, low-permission, elevated
- patterns to preserve: stable mobile gestures, safe-area behavior, bottom navigation, composer behavior, status placement, learning evidence placement
- defects to fix: overflow, clipped Chinese/English text, weak contrast, unstable button/icon dimensions, missing empty/error/blocked states, duplicate visual language, non-semantic color, unsafe touch targets, desktop-only assumptions

Default to targeted evolution. Do not perform a full visual redesign, change navigation labels, replace the component vocabulary, or introduce a new design system unless the user explicitly asks for that level of change.

## Layout Rules

Mobile first:

- primary sections belong in bottom navigation when they are app-level destinations
- use compact top bars with centered context titles on root screens
- prefer vertical lists, grouped sections, filters, and drill-down details on narrow screens
- do not force desktop multi-column Kanban onto mobile width
- keep action bars sticky only when they reduce friction and do not hide content
- respect safe areas and keyboard/viewport changes
- every touch target should be at least 44px on mobile

Desktop may use wider layouts, but mobile behavior is the baseline.

## Density And Typography

Use an 8px spacing rhythm.

Recommended defaults:

- mobile page horizontal padding: 16px
- compact card/panel padding: 12-16px
- section gap: 16-24px
- dense row height: 52-72px
- task/card height: content-driven, normally 88-140px
- screen title: 20-24px semibold
- section title: 15-17px semibold
- body text: 14-16px
- metadata: 12-13px
- badges: 11-12px

Do not use viewport-scaled font sizes. Text must work for mixed Chinese and English content and must not overflow buttons, pills, cards, or toolbars.

## Color And Surfaces

Use restrained, functional color.

Preferred roles:

- neutral backgrounds with clear surface layers
- low-saturation blue or graphite-blue for primary/information
- green for success or ready states
- amber for warning, pending, or attention states
- red only for failure, denial, destructive actions, or validation errors
- blue-gray for neutral informational states

Rules:

- never rely on color alone for critical state; include text or icon support
- avoid random rainbow badge colors
- keep one accent language per surface; do not switch accent families between sibling panels unless the colors encode real semantic state
- keep shadows subtle and functional
- use radius consistently; default cards/buttons should stay at 8px or less unless an existing style requires otherwise
- avoid decorative status dots; use dots only for real live/health/presence state and pair them with text

## Anti-Template Rules

Avoid common AI-generated UI tells unless the existing product already uses them for a real reason:

- no marketing-page hero composition inside app screens
- no fake dashboard/product screenshots built from decorative placeholder divs
- no three-equal-card feature rows when the screen needs operational hierarchy
- no atmospheric locale, clock, weather, version, beta, or build strips as decoration
- no section-number labels such as `Section 01`, `Stage 2`, or decorative step counters when the real action label is clearer
- no decorative pills, floating badges, or meta labels over images
- no generic glass panels, mesh gradients, bokeh, glow, or ornamental crosshair/grid lines
- no new icon family or animation library unless the project already depends on it or the user approves the dependency

Use visual variety only when it improves scanning, comparison, or action selection. For Hermes Mobile, novelty is not a goal.

## Component Rules

Prefer reusable components or existing helpers over one-off fragments.

Core surfaces that should stay visually consistent:

- message cards and receipts
- run/progress/status panels
- thread/topic cards
- Kanban task cards and card detail panels
- Growth learning task panels
- permission and owner-elevation panels
- file/artifact preview cards
- automation rows and audit/event rows
- empty, loading, and error states

When adding a new repeated UI shape, add a reusable class/helper and a focused test. Do not create a second visual language for the same kind of object.

## Status Semantics

Make state visible and stable. Use consistent wording, placement, and severity for:

- queued
- running
- waiting for model/tool
- blocked
- needs approval
- review required
- done
- failed
- expired
- denied
- elevated
- low permission

Permission-sensitive states must never be hidden behind vague copy. Show whether a run is low-permission, owner-maintenance, elevated, denied, or expired. Dangerous actions such as delete, overwrite, cross-workspace access, external send, owner-maintenance, shell/process/code execution, or credential/path-sensitive actions need clear confirmation and audit-friendly wording.

## Learning Workflow UI

Learning UI must show evidence and next action, not just card completion.

A study task should make these visible when available:

- assigned material or activity type
- submission status
- uploaded recording or file
- transcript or analysis availability
- AI feedback and score
- weak points and required revision
- generated exercise or retry state
- pass/fail gate
- spoken reflection or parent review gate
- reward/coin settlement state

Do not show a task as fully complete just because the Kanban card moved. Completion should follow the learning state machine and evidence ledger.

## Run And Tool Status UI

For chat and agent runs, show concrete progress when available:

- model or provider when known
- source or model override when selected
- tool/function names when tools run
- skill names when skills load
- relative elapsed time from run start
- concise error text when a tool/model fails

Keep the status panel layout stable during streaming updates. Action icons such as copy, share, usage, and skill chips must not jump horizontally when progress content changes.

## Motion And Feedback

Use motion for state feedback, not spectacle.

- prefer instant or 120-220ms micro-feedback for press, busy, selected, expanded, collapsed, and completed states
- avoid scroll hijacking, pinned storytelling, cinematic transitions, WebGL, GSAP, or large parallax effects unless the user explicitly requests a visual demo surface
- honor reduced-motion settings where animation is more than a simple opacity/color/transform feedback
- do not use React state for continuous pointer or scroll animation; use CSS, IntersectionObserver, or an isolated animation helper if the existing stack already has one
- loading skeletons should match the final layout shape; avoid generic spinners when the resulting content shape is known

## File And Artifact UI

File/artifact surfaces should show:

- user-facing file name
- type or media kind
- source context such as thread, task, workspace, or generated/uploaded status
- read-only vs writable state when relevant
- last modified or produced time if available

Do not expose raw sensitive local paths in normal UI. Prefer explicit Chinese user-facing names for generated learning deliverables instead of generic filenames.

## Frontend QA Checklist

Before finalizing a UI change, check the affected screen at mobile width and desktop width when feasible.

Verify:

- Hermes Design Read was stated and the implementation matches it
- existing UI audit was performed for redesign or cleanup work
- no generic SaaS/AI visual drift
- no unnecessary gradients, blobs, glass panels, or decorative cards
- text does not overlap, wrap badly, or overflow controls
- buttons and icon controls keep stable dimensions
- button labels remain readable and do not wrap into broken multi-line controls
- contrast is sufficient for primary actions, destructive actions, disabled states, placeholders, and status text
- important status, permission, and next-action states are visible
- loading, empty, failure, and blocked states are present where relevant
- mobile safe area, keyboard, and bottom navigation behavior are preserved
- mobile has no accidental horizontal scroll or white underlay exposure during gestures
- copy/share/usage/skill/action icons do not shift during live updates
- learning completion remains evidence-based
- destructive and permission-sensitive actions are visually distinct
- no critical state depends on color alone
- substantial UI changes were visually checked with screenshots or browser inspection when feasible

Treat these as hard failures, not polish notes:

- a user can submit, wait, fail, or need review without seeing the current state or next action
- AI feedback, score, recording, transcript, reflection, parent review, or reward state exists but is hidden or stale
- a permission/elevation/destructive state is visually ambiguous
- Chinese or mixed Chinese/English text overlaps, clips, or makes a control unusable
- the mobile flow works only by relying on desktop layout assumptions
- the implementation changes state semantics or backend contracts to make the layout easier

In the final response for UI work, report:

- changed files
- affected screens
- reused or new UI patterns
- Hermes Design Read and UI posture for substantial changes
- mobile behavior
- desktop impact
- validation performed
- any remaining visual risk
