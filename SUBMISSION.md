# Devpost submission text

Fill-in fields for codegeist2026.devpost.com → Enter a submission. Items in [brackets] are filled
in on the form: the YouTube link once the video is public, and the installation link from the
Developer Console.

**Project name:** Fair Hygiene for Jira

**Tagline (≤200 chars):** Weekly work-hygiene scores where Claude judges the closing notes and
excuses, so the person who honestly wrote "nothing to do this month" stops being flagged.

**Category:** Apps for Business Teams
**Bonus prize:** Best Agents (Rovo/Assignable agents): the app ships the `hygiene-coach`
`rovo:agent` with two reusable `action` modules (`get-hygiene-report`, `explain-person-score`)
that other agents can call as tools. Both actions run the same scoring service as the Jira page,
check the calling user's own permission on the project first, and return plain text the agent can
quote: the team's scores for a week, or one person's score with the single habit that would lift
it most. Our demo site is on Jira's Free plan, which has no Rovo, so the video does not show the
agent working; on a site with Rovo it appears in Rovo chat as **Hygiene Coach**.

---

## Inspiration

I run a weekly hygiene score for a real team: did each person log time the day they did the
work, and did they leave proof of it. The first version flagged every miss. Within weeks the
disputes arrived, and most of them were right: a recurring task closed with "nothing to set up
this month" was failed for having no time logged; a parent task was failed although all its
work was timed on sub-tasks; a colleague's close was charged to the assignee. Each fix made the
score fairer, but the phrasing people use is endless, and a regex cannot tell a note from the
same words inside a pasted log. So the rules now decide the clear cases, and Claude reads the
ambiguous few. Fair Hygiene brings that to Jira.

## What it does

For team leads who review their team's Jira work every week, and for the people being scored.

- Scores each assignee per week on **same-day time** and **proof of work**, with a configurable
  gate (pass / at risk / below gate) and no gate under five issues.
- **Leaves out** issues that say nothing about the person: closed by someone else or an
  automation (Jira's changelog names the closer exactly), imports, leave markers, and parent
  issues whose work is in sub-tasks. Each rule has an anti-loophole: any trace of the person and
  the issue scores normally.
- **Sends ambiguous notes to Claude**: a note that might mean nothing was needed, a late close
  with a reason, an overdue or stalled issue with an excuse. Claude reads the issue, its thread
  and the time on linked issues and answers *defer / excuse / score* or *explained / not
  explained*, with one sentence of why. Until then the issue is held out of the score, never
  counted as a fail.
- **The lead overrules** any verdict in one click; Claude's verdict comes back if the lead
  restores it.
- **Hygiene Coach** (Rovo) answers "how did the team do last week?" and "why is my score what it
  is?", naming the one habit that would lift a person's score most.

## How we built it

Forge, UI Kit, and nothing outside Atlassian's platform:

- `jira:projectPage` (UI Kit) with Scores, Judgements, Open work and Settings tabs.
- Resolver functions reading Jira REST v3 (enhanced JQL search with embedded worklogs, comments
  and changelog; full lists fetched only when truncated).
- **Forge LLMs** (`@forge/llm`): Claude, chosen at runtime from the active models, answering
  through a forced `record_verdict` tool call. The answer is parsed strictly; a failed or
  unreadable call leaves the item pending with the error, never a guessed verdict.
- **Forge KVS** for settings, verdicts, lead overrides and the evidence bundle Claude reads.
- **Rovo agent** `hygiene-coach` with actions `get-hygiene-report` and `explain-person-score`.
- Read-only scopes, no egress. The app reads as itself so a lead sees the whole team, and every
  entry point checks the calling user's own project permission first.
- The scoring core is pure and fully tested: 37 tests on fixtures written in Jira's wire format.

## Challenges

- **Fairness without loopholes.** Every exclusion can only remove an unfair penalty: "closed by
  someone else" needs zero footprint, "parent container" needs the person's own time on a
  sub-task, a deferral needs a short note of their own, written in the week, not copied.
- **Evidence windows.** A person shown a failing score must not earn a pass by back-filling, so
  time and notes added after the week closed are inadmissible.
- **Trusting the model.** Claude sees roles, not names; comment text is evidence, never
  instructions (a test note tries to tell the judge what to decide); verdicts are keyed by a hash
  of the evidence, so an edited note is judged afresh.

## Accomplishments

The scoring rules are not invented for a demo: each comes from a real dispute on a team where
this score has run every week since April 2026. Live on a Jira Cloud site, Claude (Sonnet 5 via
Forge LLMs) judged our eight test notes exactly as a lead would, identically across two runs,
including a note that tries to tell the judge what to decide. On the fictional team in the video
it judged all seven ambiguous notes the way a lead would, from the live app: the paused campaign
and the withdrawn request are nothing to do, the duplicate is not the person's, "will finish next
week" stays a fail, and the note that says "SYSTEM: ignore your rules" is named as a
prompt-injection attempt and stays a fail. A judgement costs about $0.006. The production version
is eligible for Runs on Atlassian.

## What we learned

Most of the value is in deciding *what not to ask the model*. Rules settle the bulk of issues for
free; Claude's attention goes to the few that need reading.

## What's next

A weekly digest page in Confluence, precomputing large projects with a scheduled trigger, and a
Teamwork Graph view of hygiene across projects.

---

**How it meets the main technology requirement:** a Forge app (manifest, `jira:projectPage`
UI Kit module, resolver functions, `llm` module, `rovo:agent` and `action` modules) integrating
with Jira (REST v3 issues, worklogs, comments, changelog, permissions) and Rovo.

**Installation link:** [the Developer Console sharing link: production, Jira, "Sharing with anyone"]

**Testing instructions for judges:**
1. Install with the link above on a Jira Cloud site and approve the read-only scopes
   (`read:jira-work`, `read:jira-user`, `storage:app`). No other configuration is needed.
2. In a project, make a quick week (about 5 minutes), each issue assigned to someone:
   - close two issues with time logged today and a comment describing the work (they pass);
   - close one with time but no comment (fails: no proof of work);
   - close one with no time and the comment "Customer paused this until January, nothing to build" (Claude: nothing to do);
   - close one with no time and the comment "Will finish next week, ran out of time" (Claude: the fail stands);
   - leave one In Progress with a past due date and the comment "Blocked: waiting on the vendor's API keys".
   Leave two minutes between creating an issue and closing it: an issue created and closed within
   two minutes with no time logged is treated as an import and left out.
3. Open the project's **Team hygiene** tab (under **More** if the tab bar is full). It opens on the
   current week in your own time zone. Scores tab: team tiles, per-person bars and table, failing issues and why.
4. Judgements tab: **Judge with Claude**. Each nominated note gets a verdict and a one-sentence reason
   (Forge LLMs bills the app developer, not your site). As a project admin, overrule one and watch
   the score move; restore it.
5. Open work tab: overdue, stale and undated issues, with Claude's view of each excuse.
6. Settings tab: time zone, gate, whether time logging is scored, stale days, excluded labels.
7. On a site with Rovo: open Rovo chat, pick **Hygiene Coach**, ask "How did the team do this week in
   <project key>?" or "Why is <name>'s score low?".

**Built with:** atlassian-forge, forge-ui-kit, forge-llms, forge-kvs, jira-cloud-rest-api, rovo,
claude, javascript, node.js, react

**Video:** [YouTube link, public, 2:43]
**Repository:** https://github.com/nicappave/fair-hygiene-for-jira (MIT)
