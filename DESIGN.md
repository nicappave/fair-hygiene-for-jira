# Fair Hygiene for Jira: design

A Forge app for Jira that scores each assignee's weekly work hygiene: did they log time the
day they did the work, and did they leave proof of it. Rules decide the clear cases. Claude,
running on Atlassian's own infrastructure through Forge LLMs, judges only the ambiguous ones:
a closing note that might mean "there was nothing to do", a late close with a stated reason,
an overdue or stalled issue with an excuse on the thread. A lead can overrule any verdict.

It is a port of a scorer the author built for ClickUp and has run weekly on a real team since
April 2026. Every rule below exists because the blunt version produced an unfair score and
someone disputed it. None of that team's data, names or identifiers is in this repository; the
test fixtures are an invented team.

## The problem

Most "hygiene" dashboards flag every late or unlogged issue. That fails in two ways:

1. **It punishes the right behaviour.** The person who closes a recurring issue with "no new
   integrations this month, nothing to set up" did exactly what a lead wants, and gets flagged for
   logging no time on it. People learn to log fake minutes instead of writing honest notes.
2. **It cannot be trusted, so it is ignored.** One unfair flag in a weekly digest and the whole
   report loses credibility. The fix is never a longer regex list: people phrase things
   endlessly, and a phrase inside a pasted log is not the same as the phrase as a note.

The answer is to let rules handle the bulk and send the genuinely ambiguous few to a reader
that understands context, with the lead keeping the last word.

## Judging criteria → design decisions

| Criterion (20% each) | What we built for it |
|---|---|
| **Technological implementation** | Forge UI Kit project page; resolvers; Forge KVS for settings, verdicts and evidence (with a TTL); **Forge LLMs** (`@forge/llm`, Claude, forced tool call, model picked from `list()`); a **Rovo agent** with two **Rovo actions**; Jira REST v3 enhanced search with pagination and conditional hydration; per-user permission checks (`asUser` `mypermissions`) in front of every app-scoped read; 36 offline tests on Jira-shaped fixtures. Official Forge manifest validator passes. |
| **Design** | One page, four tabs: Scores, Judgements, Open work, Settings. A lead reads the team in ten seconds (three stat tiles, one stacked bar per person, one sortable table), then drills into each person's failing issues. Judgement cards show the note, the verdict, Claude's one-sentence reason and one-click overrule buttons. Nothing ambiguous is ever counted as a fail while it waits. |
| **Potential impact** | Every team that runs weekly reviews in Jira: agencies, ops, support, engineering. The rules come from a scorer run weekly on a real team: the cases people disputed there are exactly the cases this app now sends to Claude instead of flagging. |
| **Innovation** | A two-layer judge. Deterministic rules decide most issues instantly and for free; Claude sees only what rules nominate, so cost is bounded by ambiguity rather than volume. Verdicts are keyed by a hash of the evidence, so an edited note is judged afresh. Claude sees roles ("assignee", "teammate"), never names. Comment text is treated as evidence, never instructions (there is a fixture that tries to instruct the judge). |
| **Presentation** | A 2:45 video (see SUBMIT.md for the storyboard): the unfair-flag problem in 20 seconds, then the app working end to end on a live developer site, then the Rovo coach. |

**Theme fit (Build with context).** The whole point is context: a regex sees a phrase, Claude
sees the issue, its thread, the time logged on it and on its linked issues, and decides what the
note means. **Category:** Apps for Business Teams (the origin team is a client-delivery team, and
the fixtures mix engineering, marketing and ops work). **Bonus:** Best Agents (Rovo).

## Rules (ported from the ClickUp scorer)

A closed issue counts toward the assignee who holds it when it is completed in the Mon–Sun
week (team time zone). Completion time is when it entered its current Done status, read from
the changelog.

**Pillar 1, same-day time** (switchable off for teams that do not log time). Pass if the
assignee logged time on it and every worklog's `started` date equals its `created` date in the
team's zone. Worklogs entered after the week closed are inadmissible.

**Pillar 2, proof of work.** Pass on the assignee's own attachment, an image or link in their
comment, or a descriptive comment (≥20 characters, not "done"/"ok"/"noted"). On a review/QC
issue a short verdict ("LGTM, merged") is the deliverable and passes. Evidence posted after
the week closed does not count. A comment dated before the issue was created was copied onto it
(clones, recurring templates) and does not count.

**Gate.** Pooled rate per person: ≥75% pass, 60–75% at risk, below 60% fail; fewer than 5
counted issues shows the rate without a gate.

**Left out of the pool entirely (neither pass nor fail):**

| Rule | Anti-loophole |
|---|---|
| Closed by someone else or an automation (changelog names the closer) | Only when the assignee left **zero** footprint: no worklog, comment, attachment or edit |
| Born done: created and closed within 120 s with no time | Any worklog and it scores |
| Parent container: work lives in its sub-tasks | The assignee must have their **own** time on one of their sub-tasks |
| Labelled `time-off` / `hygiene-exclude` (configurable) | Label, never title, matching |

**Deferral ("nothing to do this cycle").** Passes both pillars, because writing that note is the
habit. A short (≤200 characters) own, in-week, non-copied note matching a phrase set defers
automatically ("no changes needed this month", "not required", "client cancelled"). The length
guard exists because a phrase inside a pasted log is not a note.

**Nomination for Claude.** A failing issue whose own note is short and carries a cue word
(paused, already, duplicate, won't, next sprint, blocked...; hedges like "no problem" ignored), a
long note a phrase set matched, or a Jira resolution of Won't Do / Duplicate / Declined.
Also a late close with a human note written once it slipped, and an open overdue or stale issue
with a note on the thread. A nominated closed issue is **held out of the pool** until judged.

**Lateness and open work** are shown beside the score and never gate it: on time / blocked
(sat in a waiting status) / late but explained (Claude) / late; and open issues that are
overdue, stale (assignee idle ≥7 days while in progress), or missing a due date or estimate.

### ClickUp → Jira mapping

| ClickUp scorer | Jira app |
|---|---|
| `date_done` | changelog time of entering the current Done status |
| Time entry `start` vs `date_added` | worklog `started` vs `created` |
| Comments + threaded replies | issue comments (ADF parsed for text, links, media) |
| Attachments | `attachment` field (author + created) |
| "Closed by other" inferred from a comment within 120 s of the close | **exact**: the changelog names who made the transition |
| Multi-assignee review | not needed: Jira issues have one assignee |
| Holiday list name | label |
| Due date / AM date | `duedate` |
| Waiting statuses from `time_in_status` | status moves in the changelog |
| Weekly review file judged by Claude Code | Forge LLMs, in-app, per item, cached in KVS |

## The judge

Three verdict sets: deferral → `defer` / `excuse` / `score`; late close and open work →
`legitimate` / `not_legitimate`. The system prompt encodes the precedents the origin team set:
defer only when nothing was needed **and** no time was logged; excuse only when a related issue
shows the assignee's own time (or it was misassigned); a promise, a status update or "already
done" with no time anywhere is `score`; back-filled time is not timely; when unsure between
defer and score, score. The answer is a forced tool call (`record_verdict`), parsed strictly:
an unreadable answer or a failed call leaves the item pending with the error shown, never a
guessed verdict. Reasons are one sentence of at most 110 characters, written for a lead.

**Cost.** Forge LLMs bills the developer per token with no free allowance. Measured live
(docs/LIVE_CHECK.md): a judgement is about 1,600 input and 110 output tokens, about $0.006 on
Sonnet 5 at Sonnet rates ($3/$15 per million). On the fixture week 8 of 27 issues are nominated; on a real team most weeks
are mostly clear-cut, so the share is smaller.

## Architecture

```
src/
  core/        pure scoring: rules, time zones, pillars, deferral, exclusions, lateness, scorer
  jira/        REST v3 client (injected transport) + normalizer + Forge binding
  llm/         judge prompts, request, strict parser, model choice + Forge LLMs binding
  store/       Forge KVS store + in-memory twin for tests
  service.js   use cases: buildReport, judgePending, overrideVerdict, reportForAgent
  index.js     Forge resolver + Rovo action handlers (permission checks here)
  frontend/    UI Kit page
test/          node:test suites; fixtures are invented, in Jira wire format
```

Everything with a side effect is injected, so the same scorer runs in tests, the resolver and
the Rovo actions. Reports are computed on demand; judgements run in batches of four per resolver
call so each call stays inside the resolver time limit, with the UI showing progress.

**Data and privacy.** Read-only scopes (`read:jira-work`, `read:jira-user`, `storage:app`); no
egress, so the app can qualify for Runs on Atlassian. The app reads as itself so a lead sees the
whole team, and every entry point first checks the calling user's permission in that project
(browse to read, project admin to change settings or overrule).

## Known limits and next steps

- A very large week (hundreds of closed issues with long threads) could exceed the 25-second
  resolver limit. Next: precompute weekly with a scheduled trigger and an async event queue.
- Parent-container detection sees sub-tasks closed in the window or linked from closed issues.
- The P2 text heuristic is deliberately simple; the judge, not the heuristic, carries nuance.
- A weekly digest (Confluence page or email) is the natural next surface.
