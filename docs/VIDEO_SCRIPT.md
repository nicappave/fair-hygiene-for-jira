# Demo video: narration and shot list (2:43, hard limit under 5:00)

Captured from the live app on our demo site: project DEMO "Paper Kite Studio", a fictional team
(Ana, Ben, Chen, Dara are demo accounts), week of 26 Oct 2026. Headless Chrome at 2x, no music,
English voice-over (local Kokoro TTS, voice am_michael) with captions. Rovo is not shown working:
the demo site is on Jira's Free plan, which has no Rovo.

Numbers on screen, from the live app: before verdicts Ana 100% (pass), Ben 57% and Chen 20%
(below the 75% gate), Dara 67% on three issues (too few to gate), 7 notes awaiting a verdict.
With Claude's verdicts: Ben 67% (at risk), Chen 14%.

The "before" screens come from a temporary development install of the same build on the same
site (nothing judged yet); everything after the Judge click is the production app.

| # | Shot | Narration |
|---|---|---|
| 0 | Title card | Fair Hygiene for Jira. Weekly work-hygiene scores, where Claude judges the excuses. |
| 1 | DEMO-10 "Monthly dependency bump": the note, Done, "No time logged" | Team leads want two habits: log your time the day you do the work, and leave proof of it. Most hygiene reports flag every miss. So the person who honestly writes "no changes needed this month" gets flagged anyway. After one unfair flag, nobody trusts the report. |
| 2 | Team hygiene, Scores, week of 26 Oct: tiles, chart, table | Fair Hygiene is a Forge app for Jira. Every week, it scores each person on same-day time and proof of work. Ana passes. Ben and Chen are below the gate. Dara closed too few issues to be judged on. |
| 3 | The table: biggest lever (Chen: no proof of work) | The table names each person's biggest lever. For Chen, it's leaving proof of work. |
| 4 | Failing issues, each with its reason | Every fail says why: no time logged, time logged on a later day, or no proof of work at all. |
| 5 | Card over the table: DEMO-7, DEMO-19, DEMO-20, DEMO-21 left out, and the guard | Issues that say nothing about a person are left out: a certificate an automation renewed, an import, a day off, a parent whose work lives in its sub-task. Each rule has a guard: any trace of the person, and the issue scores normally. |
| 6 | Judgements: 7 notes waiting; click Judge with Claude; progress; every note has a verdict | Seven notes are ambiguous, so they're held out of the score, never counted as fails. One click sends them to Claude, running on Atlassian's own infrastructure, through Forge LLMs. |
| 7 | Verdict cards: DEMO-11, DEMO-13, DEMO-31, DEMO-32 | The paused campaign: nothing to do. The duplicate: the work was done on the linked issue, so it doesn't count against Ben. "Will finish next week" is a promise, so the fail stands. And this note tries to tell the judge what to decide. Claude treats comments as evidence, not instructions. |
| 8 | Scores with verdicts: Ben 67% at risk, Chen 14%; DEMO-15 reason | With the verdicts in, Ben moves from below the gate to at risk, and Chen's two notes count as fails. Every verdict comes with one sentence a lead can read. |
| 9 | DEMO-13: overrule to Fail stands (set by lead), then Restore Claude's verdict | The lead keeps the last word. One click overrules Claude, and one click restores its verdict. |
| 10 | Open work: DEMO-23 explained, DEMO-24 no note | Open work gets the same care. Ana's overdue firewall change is explained: she's waiting on security. Chen's overdue snapshot gives no reason. |
| 11 | Settings; read-only / no egress / Runs on Atlassian card; Hygiene Coach card (not shown live) | Each team sets its own time zone and gate. The app only reads Jira, nothing leaves Atlassian, and it's eligible for Runs on Atlassian. On sites with Rovo, a Hygiene Coach agent answers the same questions in chat. |
| 12 | End card | Rules for the clear cases, Claude for the judgement calls, and the lead has the last word. Fair Hygiene for Jira. |

## How it is made (tooling kept out of the repo, under the git-ignored video/ folder)
1. `video/capture/login_window.py`: one sign-in, as the site owner, in a separate Chrome profile.
2. `video/capture/capture_demo.py before|after|problem`: headless walk through the shots; PNGs,
   each screen's text and the boxes of key elements.
3. `video/hf/make_vo.py`: one local Kokoro clip per caption line, so captions are timed exactly.
4. `video/hf/build.py`: the HyperFrames composition (camera moves, highlights, cursor, captions).
5. `npx hyperframes render` to `video/fair-hygiene-demo.mp4`, then checked by sampled frames.
