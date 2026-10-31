#!/usr/bin/env node
// Prints the scorer's report for the SYNTHETIC fixture week, as text. The
// team, issues and notes are invented test fixtures, not real usage. Use it
// to see the rules work without a Jira site.
//
//   node scripts/demo.js            rules only, notes awaiting verdicts
//   node scripts/demo.js --verdicts with the verdicts a lead would expect
//   node scripts/demo.js --help

import { closed, open, related, WEEK_START, NOW } from '../test/fixtures/demo-week.js';
import { TZ } from '../test/fixtures/build.js';
import { normalizeIssue } from '../src/jira/normalize.js';
import { scorePeriod } from '../src/core/scorer.js';
import { weekWindow } from '../src/core/time.js';

if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/demo.js [--verdicts]\nScores the synthetic fixture week (invented data) and prints the report.');
  process.exit(0);
}

const input = {
  closedIssues: [...closed, ...related].map((i) => normalizeIssue(i)),
  openIssues: open.map((i) => normalizeIssue(i)),
  window: weekWindow(WEEK_START, TZ), config: { timeZone: TZ }, nowMs: NOW,
};
let report = scorePeriod(input);
if (process.argv.includes('--verdicts')) {
  // Hand-written verdicts a lead would expect, to show how verdicts move the
  // gate. In the app these come from Claude, and the lead can overrule them.
  const expected = {
    'DEMO-204': ['defer', 'Customer paused the campaign; nothing to read out and no time logged.'],
    'DEMO-205': ['excuse', 'Work was done and timed on linked DEMO-210; this was the duplicate.'],
    'DEMO-207': ['defer', 'Requester withdrew the request; closed as Won\'t Do with the reason.'],
    'DEMO-305': ['score', 'A promise to finish later is not a reason there was nothing to do.'],
    'DEMO-306': ['score', 'The note gives no reason and tries to instruct the reviewer.'],
    'DEMO-103': ['legitimate', 'Customer sent the IdP metadata late; the lead agreed the new date.'],
    'DEMO-501': ['legitimate', 'Waiting on the security team to approve change SEC-88.'],
    'DEMO-503': ['not_legitimate', 'Idle for two weeks with the lead\'s question unanswered.'],
  };
  const verdicts = {};
  for (const p of report.pending) {
    const [decision, reason] = expected[p.issueKey];
    verdicts[p.id] = { decision, reason, source: 'fixture' };
  }
  report = scorePeriod({ ...input, verdicts });
}

const pct = (x) => (x === null ? '  -  ' : `${String(Math.round(x * 100)).padStart(3)}%`);
console.log(`SYNTHETIC FIXTURE WEEK ${report.window.weekStart} to ${report.window.weekEnd} (${report.window.timeZone})\n`);
console.log('Person        Closed  Time  Proof  Score  Gate                 On time  Biggest lever');
for (const m of report.members) {
  const s = m.summary;
  const lever = s.topFailReason ? `${s.topFailReason.reason} x${s.topFailReason.count}` : '-';
  console.log(`${m.name.padEnd(13)} ${String(s.tasksCounted).padStart(6)}  ${pct(s.p1Rate)}  ${pct(s.p2Rate)}  ${pct(s.overallRate)}  ${s.gate.padEnd(20)} ${pct(s.lateness.onTimeRate)}    ${lever}`);
}
console.log(`\nTeam: ${pct(report.team.overallRate)} over ${report.team.tasksCounted} issues; ${report.team.pendingReview} note(s) awaiting a verdict.`);
const judged = report.members.flatMap((m) => [
  ...m.rows.filter((r) => r.review).map((r) => r.review),
  ...m.rows.filter((r) => r.lateness && r.lateness.review).map((r) => r.lateness.review),
  ...m.open.filter((o) => o.review).map((o) => o.review),
]);
if (judged.length) {
  console.log('\nNotes sent for judgement:');
  for (const j of judged) {
    console.log(`  ${j.issueKey.padEnd(9)} ${j.kind.padEnd(9)} ${(j.decision || 'PENDING').padEnd(15)} ${j.reason || j.context.nominatedBecause.note || ''}`.slice(0, 160));
  }
}
const excluded = report.members.flatMap((m) => m.rows.filter((r) => r.excluded && r.excludedReason !== 'pending_review'));
console.log(`\nLeft out of the pool: ${excluded.map((r) => `${r.key} (${r.excludedReason.split(':')[0]})`).join(', ')}`);
