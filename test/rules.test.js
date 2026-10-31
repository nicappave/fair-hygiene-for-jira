// Unit tests for each rule, on small SYNTHETIC fixture issues built in Jira's
// wire format and passed through the real normalizer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { issue, comment, worklog, move, TZ } from './fixtures/build.js';
import { normalizeIssue, adfToText, closer } from '../src/jira/normalize.js';
import { scorePillar1, scorePillar2 } from '../src/core/pillars.js';
import { matchDeferral, deferralCue } from '../src/core/deferral.js';
import { bornDone, closedByOther, parentContainer, excludedByLabel } from '../src/core/exclusions.js';
import { classifyClosedLateness, classifyOpen } from '../src/core/lateness.js';
import { weekWindow, localDate, dueEndMs, mondayOf } from '../src/core/time.js';
import { mergeConfig } from '../src/core/rules.js';

const N = (key, o) => normalizeIssue(issue(key, o));
const ANA = 'fx-acc-ana';
const END = weekWindow('2026-10-19', TZ).endMs;
const base = { summary: 'Fixture task', assignee: 'ana', created: '2026-10-19 09:00', done: '2026-10-20 17:00' };

test('time: week window is Mon 00:00 to Sun 23:59:59.999 in the team zone', () => {
  const w = weekWindow('2026-10-22', TZ);
  assert.equal(w.weekStart, '2026-10-19');
  assert.equal(w.weekEnd, '2026-10-25');
  assert.equal(new Date(w.startMs).toISOString(), '2026-10-18T16:00:00.000Z');
  assert.equal(new Date(w.endMs).toISOString(), '2026-10-25T15:59:59.999Z');
  assert.equal(mondayOf('2026-10-25'), '2026-10-19');
});

test('time: a week containing the EU clock change is 169 hours long', () => {
  const w = weekWindow('2026-10-19', 'Europe/Paris');
  assert.equal(new Date(w.startMs).toISOString(), '2026-10-18T22:00:00.000Z');
  assert.equal(new Date(w.endMs + 1).toISOString(), '2026-10-25T23:00:00.000Z');
  assert.equal((w.endMs + 1 - w.startMs) / 3_600_000, 169);
});

test('time: due date means end of that day locally', () => {
  assert.equal(new Date(dueEndMs('2026-10-20', TZ)).toISOString(), '2026-10-20T15:59:59.999Z');
  assert.equal(localDate('2026-10-20T23:30:00.000+0800', TZ), '2026-10-20');
  assert.equal(localDate('2026-10-20T23:30:00.000+0800', 'UTC'), '2026-10-20');
  assert.equal(localDate('2026-10-21T00:10:00.000+0800', 'UTC'), '2026-10-20');
});

test('normalize: ADF text, links, cards and media are read', () => {
  const a = adfToText({
    type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'See ' }, { type: 'text', text: 'PR', marks: [{ type: 'link', attrs: { href: 'https://x.test' } }] }] },
      { type: 'mediaSingle', content: [{ type: 'media', attrs: {} }] },
    ],
  });
  assert.equal(a.text, 'See PR');
  assert.equal(a.hasLink, true);
  assert.equal(a.hasMedia, true);
  assert.equal(adfToText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'inlineCard', attrs: { url: 'https://y.test/1' } }] }] }).text, 'https://y.test/1');
});

test('normalize: completion time and closer come from the changelog', () => {
  const i = N('FX-1', { ...base, closedBy: 'lena', history: [move('ana', '2026-10-19 10:00', 'To Do', 'In Progress')] });
  assert.equal(i.completedMs, Date.parse('2026-10-20T17:00:00+08:00'));
  assert.equal(closer(i).id, 'fx-acc-lena');
  assert.equal(i.statusCategory, 'done');
});

test('P1: same-day worklog passes', () => {
  const i = N('FX-2', { ...base, worklogs: [worklog('ana', '2026-10-20 09:00', '2026-10-20 17:00', 60)] });
  assert.deepEqual(scorePillar1(i, ANA, END, TZ), { pass: true, reason: 'ok', entries: 1, backdated: 0 });
});

test('P1: time logged on a later day fails as backdated', () => {
  const i = N('FX-3', { ...base, worklogs: [worklog('ana', '2026-10-19 09:00', '2026-10-20 09:00', 60)] });
  assert.equal(scorePillar1(i, ANA, END, TZ).reason, 'backdated_worklog');
});

test('P1: "same day" is judged in the team zone, not UTC', () => {
  // 23:30 and 00:10 local are different days in Singapore, the same day in UTC.
  const i = N('FX-4', { ...base, worklogs: [worklog('ana', '2026-10-20 23:30', '2026-10-21 00:10', 30)] });
  assert.equal(scorePillar1(i, ANA, END, TZ).pass, false);
  assert.equal(scorePillar1(i, ANA, END, 'UTC').pass, true);
});

test('P1: time entered after the week closed is inadmissible', () => {
  const i = N('FX-5', { ...base, worklogs: [worklog('ana', '2026-10-27 09:00', '2026-10-27 09:00', 60)] });
  assert.equal(scorePillar1(i, ANA, END, TZ).reason, 'no_time_logged');
});

test('P1: a teammate\'s time does not count for the assignee', () => {
  const i = N('FX-6', { ...base, worklogs: [worklog('ben', '2026-10-20 09:00', '2026-10-20 17:00', 60)] });
  assert.equal(scorePillar1(i, ANA, END, TZ).reason, 'no_time_logged');
});

test('P2: descriptive note, link, image and attachment pass; acknowledgements fail', () => {
  const at = '2026-10-20 16:00';
  const p2 = (o) => scorePillar2(N('FX-7', { ...base, ...o }), ANA, END);
  assert.equal(p2({ comments: [comment('ana', at, 'Migrated the cron jobs and verified the first run.')] }).reason, 'descriptive_comment');
  assert.equal(p2({ comments: [comment('ana', at, { link: 'https://git.test/pr/1' })] }).reason, 'link_in_comment');
  assert.equal(p2({ comments: [comment('ana', at, 'see', { media: true })] }).reason, 'image_in_comment');
  assert.equal(p2({ attachments: [['ana', at, 'out.pdf']] }).reason, 'attachment');
  assert.equal(p2({ comments: [comment('ana', at, 'Done.')] }).reason, 'no_proof');
  assert.equal(p2({ comments: [comment('ana', at, 'all set')] }).reason, 'no_proof');
  assert.equal(p2({ comments: [comment('lena', at, 'Great work, this fixed the whole pipeline for us.')] }).reason, 'no_proof');
});

test('P2: a short verdict passes on a review issue only', () => {
  const c = [comment('ana', '2026-10-20 16:00', 'LGTM')];
  assert.equal(scorePillar2(N('FX-8', { ...base, summary: 'Code review: PR #9', comments: c }), ANA, END).reason, 'review_verdict');
  assert.equal(scorePillar2(N('FX-9', { ...base, comments: c }), ANA, END).reason, 'no_proof');
  assert.equal(scorePillar2(N('FX-10', { ...base, summary: 'QC the landing page', comments: [comment('ana', '2026-10-20 16:00', 'ok')] }), ANA, END).pass, false);
});

test('P2: proof posted after the week closed, or copied from an older issue, does not count', () => {
  const late = N('FX-11', { ...base, comments: [comment('ana', '2026-10-26 09:00', 'Shipped it last week, all verified in production.')] });
  assert.equal(scorePillar2(late, ANA, END).reason, 'no_proof');
  const copied = N('FX-12', { ...base, comments: [comment('ana', '2026-09-20 09:00', 'Reviewed all accounts and removed two leavers.')] });
  assert.equal(scorePillar2(copied, ANA, END).reason, 'copied_comment_only');
});

test('deferral: short phrase-matched note defers; the same phrase inside a long paste does not', () => {
  const short = N('FX-13', { ...base, comments: [comment('ana', '2026-10-20 16:00', 'No new integrations this month, nothing to set up.')] });
  assert.equal(matchDeferral(short, ANA, END), 'no new integrations');
  const paste = `Recommendations export:\n${'Campaign row with metrics and a suggestion. '.repeat(6)}No action needed on rows 4-9.`;
  const long = N('FX-14', { ...base, comments: [comment('ana', '2026-10-20 16:00', paste)] });
  assert.ok(paste.length > 200);
  assert.equal(matchDeferral(long, ANA, END), null);
  assert.equal(deferralCue(long, ANA, END).why, 'long_note_phrase_match');
});

test('deferral: a teammate\'s note, a late note or a copied note cannot defer', () => {
  const lead = N('FX-15', { ...base, comments: [comment('lena', '2026-10-20 16:00', 'Not required this cycle.')] });
  assert.equal(matchDeferral(lead, ANA, END), null);
  const after = N('FX-16', { ...base, comments: [comment('ana', '2026-10-27 09:00', 'Not required this cycle.')] });
  assert.equal(matchDeferral(after, ANA, END), null);
  const copied = N('FX-17', { ...base, comments: [comment('ana', '2026-09-20 09:00', 'Not required this cycle.')] });
  assert.equal(matchDeferral(copied, ANA, END), null);
  assert.equal(deferralCue(copied, ANA, END), null);
});

test('deferral cue: hedges are ignored; a Won\'t Do resolution nominates', () => {
  const hedge = N('FX-18', { ...base, comments: [comment('ana', '2026-10-20 16:00', 'Yes no problem, sure')] });
  assert.equal(deferralCue(hedge, ANA, END), null);
  const wont = N('FX-19', { ...base, resolution: "Won't Do" });
  assert.deepEqual(deferralCue(wont, ANA, END), { why: 'not_done_resolution', cue: "Won't Do", note: '' });
});

test('exclusion: closed by someone else only when the member left no trace', () => {
  const untouched = N('FX-20', { ...base, closedBy: 'lena' });
  assert.equal(closedByOther(untouched, ANA), 'closed_by_other');
  const bot = N('FX-21', { ...base, closedBy: 'bot' });
  assert.equal(closedByOther(bot, ANA), 'closed_by_automation');
  const touched = N('FX-22', { ...base, closedBy: 'lena', comments: [comment('ana', '2026-10-19 12:00', 'q?')] });
  assert.equal(closedByOther(touched, ANA), null);
  const self = N('FX-23', base);
  assert.equal(closedByOther(self, ANA), null);
});

test('exclusion: born done, label, and parent container with its anti-loophole', () => {
  assert.equal(bornDone(N('FX-24', { ...base, created: '2026-10-20 17:00', done: '2026-10-20 17:01' })), true);
  assert.equal(bornDone(N('FX-25', { ...base, created: '2026-10-20 17:00', done: '2026-10-20 17:01', worklogs: [worklog('ana', '2026-10-20 17:00', '2026-10-20 17:00', 1)] })), false);
  assert.equal(excludedByLabel(N('FX-26', { ...base, labels: ['Time-Off'] }), mergeConfig()), 'label:Time-Off');
  const parent = N('FX-27', { ...base, subtasks: ['FX-28'] });
  const timed = N('FX-28', { ...base, subtask: true, worklogs: [worklog('ana', '2026-10-20 09:00', '2026-10-20 10:00', 60)] });
  const empty = N('FX-28', { ...base, subtask: true });
  assert.equal(parentContainer(parent, ANA, new Map([['FX-28', timed]]), END), true);
  assert.equal(parentContainer(parent, ANA, new Map([['FX-28', empty]]), END), false);
});

test('lateness: on time, blocked, late with a note, late', () => {
  const cfg = mergeConfig({ timeZone: TZ });
  const at = (o) => classifyClosedLateness(N('FX-29', { ...base, ...o }), cfg, END).status;
  assert.equal(at({ due: '2026-10-20' }), 'on_time');
  assert.equal(at({ due: '2026-10-19', history: [move('ana', '2026-10-19 12:00', 'In Progress', 'Waiting on customer')] }), 'blocked');
  assert.equal(at({ due: '2026-10-19', comments: [comment('lena', '2026-10-19 18:00', 'Vendor delayed the API keys to Tuesday.')] }), 'late_with_note');
  assert.equal(at({ due: '2026-10-19' }), 'late');
  assert.equal(at({}), 'no_due_date');
});

test('open work: overdue, stale, missing date and estimate', () => {
  const cfg = mergeConfig({ timeZone: TZ });
  const now = Date.parse('2026-10-28T10:00:00+08:00');
  const o = classifyOpen(N('FX-30', {
    summary: 'x', assignee: 'ana', created: '2026-10-01 09:00', due: '2026-10-20', estimate: 0,
    history: [move('ana', '2026-10-02 09:00', 'To Do', 'In Progress')],
  }), cfg, now);
  assert.deepEqual(o.flags, ['overdue', 'no_estimate', 'stale']);
  assert.equal(o.idleDays, 26);
});
