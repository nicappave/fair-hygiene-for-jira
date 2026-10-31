# Demo video: narration and shot list (target 2:40, hard limit under 5:00)

Screen capture of fairhygiene-dev.atlassian.net, project DEMO (Paper Kite Studio, a fictional
team), 1920×1080, no music. Voice-over in English. Every shot is the live app.

| Time | Shot | Narration |
|---|---|---|
| 0:00 | Jira issue DEMO "Monthly dependency bump" closed with "No changes needed this month" | "Every team lead wants two habits: log your time the day you do the work, and leave proof of it. Most hygiene reports flag every miss, so the person who honestly writes *nothing to do this month* gets flagged, and after one unfair flag, nobody trusts the report." |
| 0:20 | Apps → Team hygiene, Scores tab, this week picked | "Fair Hygiene is a Forge app for Jira. It scores each person's week on same-day time and proof of work. Ana passes. Ben and Chen are below the gate, and the table names each one's biggest lever." |
| 0:45 | Scroll to Ben's and Chen's failing issues | "Every fail says why: time logged on a later day, or no proof of work." |
| 0:55 | Hover or point at the excluded rows / mention | "Issues that say nothing about the person are left out: a certificate renewal an automation closed, an import, a day off, a parent whose work lives in its sub-task. Each rule has a guard: any trace of the person, and the issue scores normally." |
| 1:15 | Judgements tab, 8 waiting, click **Judge with Claude**, progress bar | "The ambiguous notes are held out of the score, never counted as fails, and Claude reads them, running on Atlassian's own infrastructure through Forge LLMs." |
| 1:30 | Verdict cards appear | "The paused campaign: nothing to do, deferred. The duplicate: the work was timed on the linked issue, excused. *Will finish next week*: that's a promise, so the fail stands. And this note tries to tell the judge what to decide; Claude treats comments as evidence, not instructions." |
| 1:55 | Scores tab again: Ben moves from below gate to at risk | "With the verdicts in, Ben moves from below the gate to at risk. Each verdict comes with one sentence a lead can read." |
| 2:05 | Judgements: click an overrule button, then restore | "And the lead has the last word: one click overrules Claude, one click restores it." |
| 2:15 | Open work tab | "Open work gets the same treatment. Ana's overdue firewall change is explained, waiting on security. Chen's *will do tomorrow* explains nothing." |
| 2:25 | Rovo chat, Hygiene Coach: "Why is Chen's score low this week?" | "And Hygiene Coach, a Rovo agent, answers the questions people actually ask, like why is my score low, and what one habit would lift it." |
| 2:38 | Settings tab, then end card text | "Read-only, no data leaves Atlassian, eligible for Runs on Atlassian. Rules for the clear cases, Claude for the judgement calls, and the lead keeps the last word. Fair Hygiene for Jira." |

## Recording steps (next run, with Chrome)
1. Chrome at 1920×1080, Jira light theme, zoom 100%, project DEMO → Apps → Team hygiene.
2. Record the screen region with ffmpeg (`gdigrab`, 30 fps) while driving each shot; one take per shot.
3. Voice-over: local TTS from the narration column, one clip per shot; cut shots to the clip lengths.
4. Assemble with ffmpeg; check duration < 5:00 (target ~2:40); save `video/fair-hygiene-demo.mp4`.
