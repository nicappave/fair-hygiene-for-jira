// End-to-end scoring of the SYNTHETIC fixture week (test/fixtures/demo-week.js):
// an invented team, not real usage. Expected numbers are worked out by hand
// from the fixture comments.
import test from 'node:test';
import assert from 'node:assert/strict';
import { closed, open, related, WEEK_START, NOW } from './fixtures/demo-week.js';
import { TZ } from './fixtures/build.js';
import { normalizeIssue } from '../src/jira/normalize.js';
import { scorePeriod } from '../src/core/scorer.js';
import { weekWindow } from '../src/core/time.js';

const config = { timeZone: TZ };
const window = weekWindow(WEEK_START, TZ);
const input = (verdicts = {}) => ({
  closedIssues: [...closed, ...related].map((i) => normalizeIssue(i)),
  openIssues: open.map((i) => normalizeIssue(i)),
  window, config, nowMs: NOW, verdicts,
});
const byName = (report, first) => report.members.find((m) => m.name.startsWith(first));
const row = (m, key) => m.rows.find((r) => r.key === key);

test('week: before any verdict, rules alone', () => {
  const r = scorePeriod(input());
  assert.deepEqual(r.members.map((m) => m.name), ['Ana Ortiz', 'Ben Okafor', 'Chen Wei', 'Dara Novak']);

  const ana = byName(r, 'Ana');
  assert.equal(ana.summary.tasksCounted, 5);
  assert.equal(ana.summary.overallRate, 1);
  assert.equal(ana.summary.gate, 'pass');
  assert.equal(row(ana, 'DEMO-104').p2.reason, 'review_verdict');
  assert.equal(row(ana, 'DEMO-106').excludedReason, 'closed_by_automation');
  assert.equal(row(ana, 'DEMO-103').lateness.status, 'late_with_note');
  assert.equal(ana.summary.lateness.onTimeRate, 0.667);

  const ben = byName(r, 'Ben');
  assert.equal(ben.summary.tasksCounted, 6);
  assert.equal(ben.summary.overallRate, 0.5);
  assert.equal(ben.summary.gate, 'fail');
  assert.equal(ben.summary.pendingReview, 3);
  assert.equal(row(ben, 'DEMO-201').p1.reason, 'backdated_worklog');
  assert.equal(row(ben, 'DEMO-202').p2.reason, 'no_proof');
  assert.equal(row(ben, 'DEMO-203').deferredBy, 'note: "no changes needed"');
  assert.equal(row(ben, 'DEMO-206').p1.reason, 'no_time_logged');
  assert.equal(row(ben, 'DEMO-210'), undefined, 'closed the week before: context only');
  assert.deepEqual(ben.summary.topFailReason, { reason: 'backdated_worklog', count: 1 });

  const chen = byName(r, 'Chen');
  assert.equal(chen.summary.tasksCounted, 5);
  assert.equal(chen.summary.overallRate, 0.2);
  assert.equal(chen.summary.gate, 'fail');
  assert.equal(row(chen, 'DEMO-304').p2.reason, 'no_proof');
  assert.deepEqual(chen.summary.topFailReason, { reason: 'no_proof', count: 4 });

  const dara = byName(r, 'Dara');
  assert.equal(dara.summary.tasksCounted, 3);
  assert.equal(dara.summary.gate, 'insufficient_sample');
  assert.equal(row(dara, 'DEMO-402').excludedReason, 'born_done');
  assert.equal(row(dara, 'DEMO-403').excludedReason, 'label:time-off');
  assert.equal(row(dara, 'DEMO-404').excludedReason, 'parent_container');
  assert.equal(row(dara, 'DEMO-406').p2.reason, 'copied_comment_only');

  assert.deepEqual(r.team, {
    members: 4, tasksCounted: 19, overallRate: 0.579, gatePass: 1, gateAtRisk: 0, gateFail: 2, pendingReview: 8,
  });
});

test('week: exactly the ambiguous notes go to Claude, nothing else', () => {
  const r = scorePeriod(input());
  const pending = r.pending.map((p) => `${p.kind}:${p.issueKey}`).sort();
  assert.deepEqual(pending, [
    'deferral:DEMO-204', 'deferral:DEMO-205', 'deferral:DEMO-207', 'deferral:DEMO-305', 'deferral:DEMO-306',
    'late:DEMO-103', 'open:DEMO-501', 'open:DEMO-503',
  ]);
  const by = Object.fromEntries(r.pending.map((p) => [p.issueKey, p]));
  assert.equal(by['DEMO-204'].context.nominatedBecause.cue, 'paused');
  assert.equal(by['DEMO-207'].context.nominatedBecause.cue, "won't");
  assert.equal(by['DEMO-305'].context.nominatedBecause.cue, 'next week');
  assert.match(by['DEMO-103'].context.nominatedBecause.note, /IdP metadata/);
  // Claude sees the linked issue where Ben's 90 minutes were logged.
  assert.deepEqual(by['DEMO-205'].context.related, [{
    key: 'DEMO-210', relation: 'linked', summary: 'Password-reset links expire too early',
    status: 'Done', assigneeIsMember: true, memberMinutesLogged: 90,
  }]);
  // Authors are roles in the evidence, never names or account ids (a name
  // typed inside a comment's text is part of the thread and stays).
  const structure = JSON.stringify(r.pending.map((p) => ({
    ...p.context, nominatedBecause: null, thread: p.context.thread.map((t) => ({ ...t, text: null })),
  })));
  for (const name of ['Ana', 'Ben', 'Chen', 'Dara', 'Lena', 'fx-acc']) assert.ok(!structure.includes(name), name);
  assert.deepEqual(by['DEMO-503'].context.thread.map((t) => t.author), ['teammate']);
});

test('week: open work flags', () => {
  const r = scorePeriod(input());
  const open = Object.fromEntries(r.members.flatMap((m) => m.open).map((o) => [o.key, o]));
  assert.deepEqual(Object.keys(open).sort(), ['DEMO-501', 'DEMO-502', 'DEMO-503', 'DEMO-504']);
  assert.deepEqual(open['DEMO-501'].flags, ['overdue']);
  assert.deepEqual(open['DEMO-502'].flags, ['overdue']);
  assert.equal(open['DEMO-502'].review, null, '"Will do tomorrow." explains nothing: no judgement needed');
  assert.deepEqual(open['DEMO-503'].flags, ['stale']);
  assert.deepEqual(open['DEMO-504'].flags, ['no_due_date', 'no_estimate']);
  assert.deepEqual(byName(r, 'Chen').summary.open, {
    total: 2, overdue: 1, overdueExplained: 0, overdueUnexplained: 1, stale: 1, staleUnexplained: 0,
    awaitingVerdict: 1, noDueDate: 0, noEstimate: 0,
  });
});

test('week: verdicts move people across the gate', () => {
  const first = scorePeriod(input());
  const ids = Object.fromEntries(first.pending.map((p) => [p.issueKey, p.id]));
  const v = (decision) => ({ decision, reason: 'fixture verdict', source: 'claude' });
  const verdicts = {
    [ids['DEMO-204']]: v('defer'),
    [ids['DEMO-205']]: v('excuse'),
    [ids['DEMO-207']]: v('defer'),
    [ids['DEMO-305']]: v('score'),
    [ids['DEMO-306']]: v('score'),
    [ids['DEMO-103']]: v('legitimate'),
    [ids['DEMO-501']]: v('legitimate'),
    [ids['DEMO-503']]: v('not_legitimate'),
  };
  const r = scorePeriod(input(verdicts));
  assert.equal(r.pending.length, 0);
  const ben = byName(r, 'Ben');
  // 9 closed, 205 excused out -> 8 counted; 5 pass (203, 204, 207, 208, 209).
  assert.equal(ben.summary.tasksCounted, 8);
  assert.equal(ben.summary.overallRate, 0.625);
  assert.equal(ben.summary.gate, 'at_risk', 'was fail on rules alone');
  // Deferred issues pass both pillars: 6 of 8 for time (201, 206 fail), 7 of 8 for proof.
  assert.equal(ben.summary.p1Rate, 0.75);
  assert.equal(ben.summary.p2Rate, 0.875);
  assert.equal(row(ben, 'DEMO-205').excludedReason, 'excused: fixture verdict');
  assert.equal(row(ben, 'DEMO-204').deferredBy, 'judged: fixture verdict');
  const chen = byName(r, 'Chen');
  assert.equal(chen.summary.tasksCounted, 7);
  assert.equal(chen.summary.overallRate, 0.143);
  const ana = byName(r, 'Ana');
  assert.equal(row(ana, 'DEMO-103').lateness.status, 'late_excused');
  assert.equal(ana.summary.lateness.onTimeRate, 1);
  assert.equal(ana.summary.open.overdueExplained, 1);
  assert.equal(chen.summary.open.staleUnexplained, 1);
});

test('week: an edited note is judged afresh; an invalid stored verdict is ignored', () => {
  const first = scorePeriod(input());
  const id = first.pending.find((p) => p.issueKey === 'DEMO-204').id;
  const edited = input({ [id]: { decision: 'defer', reason: 'x' } });
  const i = edited.closedIssues.find((x) => x.key === 'DEMO-204');
  i.comments[0].text += ' Confirmed by the account manager.';
  const again = scorePeriod(edited);
  const item = again.pending.find((p) => p.issueKey === 'DEMO-204');
  assert.ok(item, 'still pending after the edit');
  assert.notEqual(item.id, id);
  const bogus = scorePeriod(input({ [id]: { decision: 'legitimate', reason: 'wrong kind' } }));
  assert.ok(bogus.pending.some((p) => p.id === id));
});

test('week: teams that do not log time are scored on proof of work alone', () => {
  const r = scorePeriod({ ...input(), config: { timeZone: TZ, requireWorklog: false } });
  const ben = byName(r, 'Ben');
  // 201 and 206 have proof; 202 still has none.
  assert.equal(row(ben, 'DEMO-201').pass, true);
  assert.equal(row(ben, 'DEMO-202').pass, false);
  assert.equal(row(ben, 'DEMO-205').pass, true, 'link counts as proof, so no judgement is needed');
});
