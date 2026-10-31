# Demo video: narration and shot list (about 2:40, hard limit under 5:00)

Captured from the live app on our demo site: project DEMO "Paper Kite Studio", a fictional team
(Ana, Ben, Chen, Dara are demo accounts), week of 26 Oct 2026. Headless Chrome, 1920×1080, no
music, English voice-over (local Kokoro TTS) with captions. Rovo is not shown: the demo site is on
Jira's Free plan, which has no Rovo.

Numbers checked against the scorer on the live data before recording: Ana 100% (pass), Ben 57%
and Chen 20% (below the 75% gate), Dara 67% on three issues (too few to gate), 7 notes awaiting a
verdict. With Claude's verdicts: Ben 67% (at risk), Chen 14%.

| # | Shot | Narration |
|---|---|---|
| 0 | Title card | Fair Hygiene for Jira. Fair work-hygiene scores, with Claude judging the excuses. |
| 1 | DEMO-10 "Monthly dependency bump", closed with "No changes needed this month" | Team leads want two habits: log your time the day you do the work, and leave proof of it. Most hygiene reports flag every miss. So the person who honestly writes "no changes needed this month" gets flagged anyway. After one unfair flag, nobody trusts the report. |
| 2 | Team hygiene tab, Scores, week of 26 Oct | Fair Hygiene is a Forge app for Jira. Every week it scores each person on same-day time and proof of work. Ana passes. Ben and Chen are below the gate. Dara closed too few issues to be judged on. |
| 3 | The table | The table names each person's biggest lever. For Chen, it is leaving proof of work. |
| 4 | Failing issues | Every fail says why: no time logged, or no proof of work at all. |
| 5 | Still on Scores | Issues that say nothing about a person are left out: a certificate an automation renewed, an import, a day off, a parent whose work lives in its sub-task. Each rule has a guard. Any trace of the person, and the issue scores normally. |
| 6 | Judgements tab: 7 notes waiting; click Judge with Claude | Seven notes are ambiguous, so they are held out of the score, never counted as fails. One click sends them to Claude, running on Atlassian's own infrastructure through Forge LLMs. |
| 7 | Verdict cards | The paused campaign: nothing to do. The duplicate: the work was done on the linked issue, so it doesn't count against Ben. "Will finish next week" is a promise, so the fail stands. And this note tries to tell the judge what to decide. Claude treats comments as evidence, not instructions. |
| 8 | Scores again | With the verdicts in, Ben moves from below the gate to at risk, and Chen's two notes count as fails. Every verdict comes with one sentence a lead can read. |
| 9 | Judgements: overrule one, then restore | The lead keeps the last word. One click overrules Claude, and one click restores its verdict. |
| 10 | Open work tab | Open work gets the same care. Ana's overdue firewall change is explained: she is waiting on security. Chen's "will do tomorrow" explains nothing. |
| 11 | Settings tab, then end card | It reads Jira and nothing else, nothing leaves Atlassian, and it is eligible for Runs on Atlassian. On sites with Rovo, a Hygiene Coach agent answers the same questions in chat. Rules for the clear cases, Claude for the judgement calls, and the lead has the last word. |

## How it is made
1. `video/capture/login_window.py`: one sign-in, as the site owner, in a separate Chrome profile.
2. `video/capture/capture_demo.py`: headless walk through the shots above; PNGs, a WebM and each
   screen's text, so the narration can be checked against what the app showed.
3. HyperFrames composition over the captured screens (pans, zooms, a cursor for each click),
   narration from `npx hyperframes tts` (Kokoro, local), captions from the narration text.
4. Rendered to `video/fair-hygiene-demo.mp4`, checked under 5:00 and by sampled frames.
