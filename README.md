# Fair Hygiene for Jira

Weekly work-hygiene scores for each person on a Jira project, where **Claude judges the closing
notes and excuses** instead of the app flagging every late or unlogged issue blindly.

- **Two habits, scored per person:** time logged the same day the work happened, and proof of work
  (a link, file, screenshot or real note) left on the issue by the end of the week.
- **Rules decide the clear cases.** Issues closed by an automation, imports, leave markers and parent
  issues whose work lives in sub-tasks are left out. A short "nothing to do this month" note passes.
- **Claude decides the ambiguous ones**, through Forge LLMs on Atlassian's infrastructure: a note that
  *might* mean nothing was needed, a late close with a reason, an overdue issue with an excuse. It reads
  the issue, its thread and the time on linked issues, and returns a verdict with one sentence of why.
- **The lead has the last word:** every verdict can be overruled in one click.
- **Hygiene Coach**, a Rovo agent (on sites with Rovo), answers "how did the team do?" and "why is my
  score what it is?" through two Rovo actions.

Built for Atlassian Codegeist 2026. Design and rule rationale: [DESIGN.md](DESIGN.md). Live results on a
Jira Cloud site, including Claude's verdicts: [docs/LIVE_CHECK.md](docs/LIVE_CHECK.md).
Privacy: [PRIVACY.md](PRIVACY.md).

## Run the tests (no Atlassian account needed)

```bash
npm install
npm test                         # 37 tests, node:test, Node 22+
node scripts/demo.js             # the scorer on the synthetic fixture week
node scripts/demo.js --verdicts  # the same week once each note has a verdict
```

The fixtures in `test/fixtures/` are an **invented** team and week, written in Jira Cloud REST v3
wire format (ADF comments, `+0800` timestamps, embedded worklog/comment/changelog blocks) so the
normalizer is tested on what Jira actually sends. They are test data, not usage data.

## Deploy to a Jira site

Needs an Atlassian developer account and a free cloud developer site.

```bash
npm install -g @forge/cli
forge login                      # email + API token
forge register                   # writes app.id into manifest.yml
forge deploy                     # development environment
forge install --site <your-site>.atlassian.net --product jira
```

Open any Jira project → the **Team hygiene** tab (under **More** if the tab bar is full). It opens on the
current week, in your own time zone until a project admin saves one. Project admins (and Jira admins)
can change the time zone, the gate, whether time logging is scored, stale days and excluded labels on
the Settings tab, and overrule any verdict.

Forge LLMs is billed to the app developer per token (no free allowance); a judgement costs
about $0.006 on Claude Sonnet 5 (measured live). The app judges only nominated notes, and only when a user clicks
**Judge with Claude**.

## Layout

| Path | What |
|---|---|
| `manifest.yml` | Forge modules: project page, resolver, `llm`, `rovo:agent`, two `action`s |
| `src/core/` | Pure scoring rules (no I/O) |
| `src/jira/` | REST v3 client, normalizer, Forge binding |
| `src/llm/` | Judge prompts, strict verdict parser, Forge LLMs binding |
| `src/service.js` | Report, judge, overrule, agent view |
| `src/index.js` | Resolver and Rovo action handlers, with per-user permission checks |
| `src/frontend/index.jsx` | UI Kit page |
| `test/` | Tests and invented fixtures |

## Demo site tooling (not part of the app)

`demo-seeder/` is a separate, temporary Forge app used only to write a fictional team's week onto our
demo site (`scripts/seed_demo.py`), acting as each demo account so their notes carry their own names. It
holds write and impersonation scopes, so it is installed only while seeding and uninstalled right after.

## Permissions

`read:jira-work`, `read:jira-user`, `storage:app`. Read-only; no external egress.

## License

MIT, see [LICENSE](LICENSE).
