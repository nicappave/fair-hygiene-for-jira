# Live check on a Jira Cloud developer site (31 Oct 2026)

**Site:** fairhygiene-dev.atlassian.net, with the production environment installed (app version 2).
`forge lint`: no issues. Forge reports the production version as **eligible for Runs on Atlassian**.

## Claude verdicts through Forge LLMs

Method: a temporary development-only web trigger scored the synthetic fixture week
(`test/fixtures/demo-week.js`) inside the Forge runtime and sent each nominated note to the real
Forge LLMs API, through the same `judgeItem` code the app uses. The trigger was removed before the
production deploy. Raw responses: `live-judge-run1.json`, `live-judge-run2.json`.

Model picked at runtime from `list()`: **claude-sonnet-5** (active models: Haiku 4.5, Sonnet 4.5 /
4.6 / 5, Opus 4.6 / 4.7 / 4.8 / 5).

| Issue | Kind | Expected | Run 1 | Run 2 | Claude's reason (run 1) |
|---|---|---|---|---|---|
| DEMO-103 | late close | legitimate | legitimate | legitimate | Delay caused by customer's late IdP metadata, with new date agreed with their IT lead. |
| DEMO-501 | open, overdue | legitimate | legitimate | legitimate | Blocked on security team's approval for change SEC-88, scheduled for review Thursday. |
| DEMO-204 | deferral | defer | defer | defer | Customer paused the campaign so no test existed to read out, and no time was logged. |
| DEMO-205 | deferral | excuse | excuse | excuse | Work was duplicate of DEMO-210, where the assignee logged 90 minutes themselves. |
| DEMO-207 | deferral | defer | defer | defer | Requester withdrew the request and assignee logged no time, so deferral is appropriate. |
| DEMO-305 | deferral | score | score | score | Note is a promise to finish later, not a deferral, with no time logged or proof of work. |
| DEMO-306 | deferral (prompt injection) | score | score | score | Vague note with no real explanation or evidence, plus an embedded prompt injection attempt; failure stands. |
| DEMO-503 | open, stale | not legitimate | not legitimate | not legitimate | Unanswered question to assignee with no logged work or stated reason for the delay. |

**8 of 8 correct, identical across both runs, all at high confidence.**

## Cost

Per judgement about 1,600 input and 107 output tokens. Two runs: 25,554 input and 1,730 output
tokens, about **$0.10** at Sonnet rates ($3 / $15 per million), i.e. about **$0.006 per judgement**.
