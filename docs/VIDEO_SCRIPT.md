# Demo video: narration and shot list (target about 2:30, hard limit under 5:00)

Screen capture of the live app on our demo site, project DEMO "Paper Kite Studio", a fictional team
(Ana, Ben, Chen, Dara are demo accounts). 1920×1080 capture of the Chrome window, no music, English
voice-over (local Kokoro TTS). Rovo is not shown: the demo site is on Jira's Free plan.

| # | Shot | Narration |
|---|---|---|
| 1 | DEMO list: "Monthly dependency bump" closed with "No changes needed this month" | Every team lead wants two habits: log your time the day you do the work, and leave proof of it. Most hygiene reports flag every miss. So the person who honestly writes, no changes needed this month, gets flagged anyway. After one unfair flag, nobody trusts the report. |
| 2 | Team hygiene tab, Scores, current week | Fair Hygiene is a Forge app for Jira. It scores each person's week on same-day time and proof of work. Ana passes. Ben and Chen are below the gate, and the table names each person's biggest lever. |
| 3 | Scroll to the failing issues | Every fail says why: time logged on a later day, or no proof of work at all. |
| 4 | Still on Scores | Issues that say nothing about a person are left out: a certificate an automation renewed, an import, a day off, a parent whose work lives in its sub-task. Each rule has a guard. Any trace of the person, and the issue scores normally. |
| 5 | Judgements tab: 7 notes waiting; click Judge with Claude | Ambiguous notes are held out of the score, never counted as fails. Claude reads them, running on Atlassian's own infrastructure through Forge LLMs. |
| 6 | Verdict cards appear | The paused campaign: nothing to do. The duplicate: the work was timed on the linked issue, so it is not counted twice. Will finish next week is a promise, so the fail stands. And this note tries to tell the judge what to decide. Claude treats comments as evidence, not instructions. |
| 7 | Scores again: Ben from below the gate to at risk | With the verdicts in, Ben moves from below the gate to at risk. Every verdict comes with one sentence a lead can read. |
| 8 | Judgements: overrule one, then restore | The lead keeps the last word. One click overrules Claude, and one click restores its verdict. |
| 9 | Open work tab | Open work gets the same care. Ana's overdue firewall change is explained: she is waiting on security. Chen's will do tomorrow explains nothing. |
| 10 | Settings tab, then the app header | Read only, nothing leaves Atlassian, and eligible for Runs on Atlassian. Rules for the clear cases, Claude for the judgement calls, and the lead has the last word. Fair Hygiene for Jira. |

## Recording (after seeding)
1. Chrome window with the DEMO project's Team hygiene tab, 100% zoom; the extension drives each shot.
2. `ffmpeg -f gdigrab -framerate 30 -i title="<window title>"` records the window; one clip per shot.
3. Narration clips: `npx hyperframes tts` (Kokoro, voice am_michael), one per shot, in `video/vo/`.
4. Each shot is trimmed or held to its narration length, then concatenated:
   `video/fair-hygiene-demo.mp4`, checked under 5:00.
