<!-- KEEP THIS FILE IN SYNC — update when a doc type, status or index changes. -->
# Instructions for `docs/`

Rules for every document in this folder. The root [`AGENTS.md`](../AGENTS.md) still applies.

## What lives where

| Doc | What it is | Status |
|---|---|---|
| [`plan.md`](plan.md) | What we build, in order | The real roadmap |
| [`design.md`](design.md) | Game rules as built and wanted | The real rules |
| [`first-change.md`](first-change.md) | Guide for a new contributor | Kept working |
| [`vision.md`](vision.md) | Creative direction | Proposed |
| [`decisions/`](decisions/README.md) | One numbered record per significant decision | Each has its own status |
| [`worldbuilding/`](worldbuilding/README.md) | The world, its places and creatures. Read [`worldbuilding/AGENTS.md`](worldbuilding/AGENTS.md) first | Mostly exploratory |

Read [`README.md`](README.md) first, then only the documents the task needs.

## Statuses

Every substantive new document starts with this frontmatter:

```yaml
---
id: worldbuilding.geography   # folder.name, never changes
title: Geography
status: exploratory           # exploratory | proposed | accepted | superseded
created: 2026-11-27           # never changes
updated: 2026-11-27           # bump when the meaning changes
---
```

- **exploratory**: ideas and possibilities. Anyone can add them.
- **proposed**: a direction someone wants the team to adopt.
- **accepted**: the team has agreed. It becomes `accepted` only in a PR Joel merges; agents never set it on their own.
- **superseded**: replaced by a later decision. Keep the file and link what replaced it.

Merging a document does not make it accepted. Only its `status` does.

## Rules

- The vision and lore never override `design.md` or `plan.md` unless an accepted decision says so.
- Record a significant decision as a new file in `decisions/` (see its README for the sections), and add it to the index there.
- When a decision is accepted, update the documents it affects in the same PR.
- If two documents disagree, point it out to the person. Don't invent a resolution.
- Capture ideas freely; make them official deliberately.
- Use relative links, absolute dates (`2026-11-27`), and update the folder's index when you add a file.
