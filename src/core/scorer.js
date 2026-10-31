// One period's hygiene report for a team: per-assignee pillars, exclusions,
// deferrals, lateness and open-work risk, plus the list of notes that still
// need a judgement. Pure: no I/O, so the same function runs in tests, in the
// Forge resolver and behind the Rovo actions.

import { mergeConfig } from './rules.js';
import { scorePillar1, scorePillar2 } from './pillars.js';
import { matchDeferral, deferralCue } from './deferral.js';
import { excludedByLabel, bornDone, closedByOther, parentContainer } from './exclusions.js';
import { classifyClosedLateness, classifyOpen } from './lateness.js';
import { localDate } from './time.js';

export const VERDICTS = Object.freeze({
  deferral: ['defer', 'excuse', 'score'],
  late: ['legitimate', 'not_legitimate'],
  open: ['legitimate', 'not_legitimate'],
});

// Short stable hash so a verdict is re-asked when the evidence changes.
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const minutes = (logs) => Math.round(logs.reduce((s, w) => s + w.seconds, 0) / 60);

// What Claude sees. People are roles, never names: the judgement is about the
// thread, and names add bias and leak data the model does not need.
export function buildContext(kind, issue, memberId, byKey, config, untilMs, cue) {
  const role = (c) => (c.authorIsApp ? 'automation' : c.authorId === memberId ? 'assignee' : 'teammate');
  const thread = issue.comments
    .filter((c) => !untilMs || c.createdMs <= untilMs)
    .slice(-12)
    .map((c) => ({
      author: role(c),
      date: localDate(c.createdMs, config.timeZone),
      copiedFromEarlierIssue: Boolean(issue.createdMs && c.createdMs < issue.createdMs),
      text: c.text.length > 700 ? `${c.text.slice(0, 700)} [...]` : c.text,
    }));
  const own = issue.worklogs.filter((w) => w.authorId === memberId);
  const ownInTime = own.filter((w) => !untilMs || w.createdMs <= untilMs);
  const related = (keys, rel) => keys.map((k) => byKey.get(k)).filter(Boolean).map((r) => ({
    key: r.key,
    relation: rel,
    summary: r.summary,
    status: r.status,
    assigneeIsMember: r.assigneeId === memberId,
    memberMinutesLogged: minutes(r.worklogs.filter((w) => w.authorId === memberId)),
  }));
  return {
    kind,
    issue: {
      key: issue.key,
      summary: issue.summary,
      type: issue.issueType,
      status: issue.status,
      resolution: issue.resolution || null,
      created: localDate(issue.createdMs, config.timeZone),
      completed: issue.completedMs ? localDate(issue.completedMs, config.timeZone) : null,
      due: issue.due || null,
    },
    time: {
      assigneeMinutesLogged: minutes(ownInTime),
      assigneeMinutesBackfilledAfterPeriod: minutes(own) - minutes(ownInTime),
      othersMinutesLogged: minutes(issue.worklogs.filter((w) => w.authorId !== memberId)),
    },
    related: [
      ...related(issue.linkedKeys, 'linked'),
      ...related(issue.subtaskKeys, 'subtask'),
      ...(issue.parentKey ? related([issue.parentKey], 'parent') : []),
    ],
    nominatedBecause: cue || null,
    thread,
  };
}

function reviewItem(kind, issue, memberId, memberName, context, verdicts) {
  const evidence = JSON.stringify([context.issue, context.time, context.thread, context.related]);
  // No raw account id in anything the app stores: the person is a hash here.
  const id = `${kind}|${issue.key}|${fnv1a(`m:${memberId}`)}|${fnv1a(evidence)}`;
  const v = verdicts[id];
  const valid = v && VERDICTS[kind].includes(v.decision);
  return {
    id, kind, issueKey: issue.key, summary: issue.summary, memberId, memberName,
    status: valid ? 'decided' : 'pending',
    decision: valid ? v.decision : null,
    reason: valid ? v.reason || '' : '',
    source: valid ? v.source || 'claude' : null,
    context,
  };
}

function scoreClosed(issue, memberId, memberName, ctx) {
  const { config, window, byKey, verdicts } = ctx;
  const row = {
    key: issue.key, summary: issue.summary, completedMs: issue.completedMs,
    excluded: false, excludedReason: null, p1: null, p2: null,
    deferredBy: null, review: null, pass: null, lateness: null,
  };
  const exclusion = excludedByLabel(issue, config)
    || (bornDone(issue) && 'born_done')
    || closedByOther(issue, memberId)
    || (parentContainer(issue, memberId, byKey, window.endMs) && 'parent_container');
  if (exclusion) return { ...row, excluded: true, excludedReason: exclusion };

  row.p1 = config.requireWorklog
    ? scorePillar1(issue, memberId, window.endMs, config.timeZone)
    : { pass: true, reason: 'not_required' };
  row.p2 = scorePillar2(issue, memberId, window.endMs);
  row.pass = row.p1.pass && row.p2.pass;

  const late = classifyClosedLateness(issue, config, window.endMs);
  row.lateness = { status: late.status, review: null };
  if (late.status === 'late_with_note') {
    const context = buildContext('late', issue, memberId, byKey, config, window.endMs,
      { why: 'closed_after_due_date_with_a_note', note: late.note });
    const item = reviewItem('late', issue, memberId, memberName, context, verdicts);
    row.lateness.review = item;
    if (item.status === 'decided') row.lateness.status = item.decision === 'legitimate' ? 'late_excused' : 'late';
  }

  if (row.pass) return row;

  const phrase = matchDeferral(issue, memberId, window.endMs);
  if (phrase) {
    return { ...row, pass: true, deferredBy: `note: "${phrase}"` };
  }
  const cue = deferralCue(issue, memberId, window.endMs);
  if (!cue) return row;
  const context = buildContext('deferral', issue, memberId, byKey, config, window.endMs, cue);
  const item = reviewItem('deferral', issue, memberId, memberName, context, verdicts);
  row.review = item;
  if (item.status === 'pending') {
    // Held out of the pool until judged: neither pass nor fail.
    return { ...row, excluded: true, excludedReason: 'pending_review' };
  }
  if (item.decision === 'defer') return { ...row, pass: true, deferredBy: `judged: ${item.reason}` };
  if (item.decision === 'excuse') return { ...row, excluded: true, excludedReason: `excused: ${item.reason}` };
  return row; // score: the fail stands
}

function summarise(rows, open, config) {
  const live = rows.filter((r) => !r.excluded);
  const n = live.length;
  const count = (pred) => live.filter(pred).length;
  const both = count((r) => r.pass);
  const rate = (k) => (n ? Math.round((k / n) * 1000) / 1000 : null);
  const lat = (s) => count((r) => r.lateness && r.lateness.status === s);
  const withDue = n - lat('no_due_date');
  const overallRate = rate(both);
  let gate = 'insufficient_sample';
  if (n >= config.minSample) {
    gate = overallRate >= config.gatePass ? 'pass' : overallRate >= config.gateAtRisk ? 'at_risk' : 'fail';
  }
  const fails = live.filter((r) => !r.pass);
  const reasons = {};
  for (const r of fails) {
    if (r.p1 && !r.p1.pass) reasons[r.p1.reason] = (reasons[r.p1.reason] || 0) + 1;
    if (r.p2 && !r.p2.pass) reasons[r.p2.reason] = (reasons[r.p2.reason] || 0) + 1;
  }
  const topFailReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0] || null;
  const openFlag = (f) => open.filter((o) => o.flags.includes(f));
  const explained = (list, d) => list.filter((o) => o.review && o.review.decision === d).length;
  // No note at all, or a note Claude (or the lead) found wanting. Pending is neither.
  const unexplained = (o) => !o.review || o.review.decision === 'not_legitimate';
  const overdue = openFlag('overdue');
  const stale = openFlag('stale');
  return {
    tasksCounted: n,
    // A deferral passes both pillars: writing the note IS the habit.
    p1Rate: rate(count((r) => r.deferredBy || (r.p1 && r.p1.pass))),
    p2Rate: rate(count((r) => r.deferredBy || (r.p2 && r.p2.pass))),
    overallRate,
    gate,
    deferred: count((r) => r.deferredBy),
    excluded: rows.filter((r) => r.excluded && r.excludedReason !== 'pending_review').length,
    pendingReview: rows.filter((r) => r.excludedReason === 'pending_review').length,
    topFailReason: topFailReason ? { reason: topFailReason[0], count: topFailReason[1] } : null,
    lateness: {
      onTime: lat('on_time'), blocked: lat('blocked'), lateExcused: lat('late_excused'),
      lateWithNotePending: lat('late_with_note'), late: lat('late'), noDueDate: lat('no_due_date'),
      onTimeRate: withDue ? Math.round(((lat('on_time') + lat('blocked') + lat('late_excused')) / withDue) * 1000) / 1000 : null,
    },
    open: {
      total: open.length,
      overdue: overdue.length,
      overdueExplained: explained(overdue, 'legitimate'),
      overdueUnexplained: overdue.filter(unexplained).length,
      stale: stale.length,
      staleUnexplained: stale.filter(unexplained).length,
      awaitingVerdict: open.filter((o) => o.review && o.review.status === 'pending').length,
      noDueDate: openFlag('no_due_date').length,
      noEstimate: openFlag('no_estimate').length,
    },
  };
}

// closedIssues / openIssues: normalized issues (see jira/normalize.js).
// verdicts: { [reviewItemId]: { decision, reason, source } }, lead overrides
// already merged over Claude's verdicts by the caller.
export function scorePeriod({ closedIssues, openIssues = [], window, config: partial, verdicts = {}, nowMs }) {
  const config = mergeConfig(partial);
  const all = [...closedIssues, ...openIssues];
  const byKey = new Map(all.map((i) => [i.key, i]));
  const ctx = { config, window, byKey, verdicts };
  const members = new Map();
  const member = (id, name) => {
    if (!members.has(id)) members.set(id, { id, name, rows: [], open: [] });
    return members.get(id);
  };

  for (const issue of closedIssues) {
    if (!issue.assigneeId) continue; // unassigned: nobody to score
    if (!issue.completedMs || issue.completedMs < window.startMs || issue.completedMs > window.endMs) continue;
    member(issue.assigneeId, issue.assigneeName).rows
      .push(scoreClosed(issue, issue.assigneeId, issue.assigneeName, ctx));
  }

  for (const issue of openIssues) {
    if (!issue.assigneeId || issue.statusCategory === 'done') continue;
    const o = classifyOpen(issue, config, nowMs);
    if (!o.flags.length) continue;
    const row = {
      key: issue.key, summary: issue.summary, due: issue.due, status: issue.status,
      flags: o.flags, idleDays: o.idleDays, review: null,
    };
    if (o.note) {
      const context = buildContext('open', issue, issue.assigneeId, byKey, config, nowMs,
        { why: o.flags.filter((f) => f === 'overdue' || f === 'stale').join('+'), idleDays: o.idleDays, note: o.note });
      row.review = reviewItem('open', issue, issue.assigneeId, issue.assigneeName, context, verdicts);
    }
    member(issue.assigneeId, issue.assigneeName).open.push(row);
  }

  const out = [...members.values()].map((m) => ({ ...m, summary: summarise(m.rows, m.open, config) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const pending = [];
  for (const m of out) {
    for (const r of m.rows) {
      if (r.review && r.review.status === 'pending') pending.push(r.review);
      if (r.lateness && r.lateness.review && r.lateness.review.status === 'pending') pending.push(r.lateness.review);
    }
    for (const o of m.open) if (o.review && o.review.status === 'pending') pending.push(o.review);
  }
  const counted = out.reduce((s, m) => s + m.summary.tasksCounted, 0);
  const passed = out.reduce((s, m) => s + m.rows.filter((r) => !r.excluded && r.pass).length, 0);
  return {
    window: { weekStart: window.weekStart, weekEnd: window.weekEnd, timeZone: config.timeZone },
    config,
    team: {
      members: out.length,
      tasksCounted: counted,
      overallRate: counted ? Math.round((passed / counted) * 1000) / 1000 : null,
      gatePass: out.filter((m) => m.summary.gate === 'pass').length,
      gateAtRisk: out.filter((m) => m.summary.gate === 'at_risk').length,
      gateFail: out.filter((m) => m.summary.gate === 'fail').length,
      pendingReview: pending.length,
    },
    members: out,
    pending,
  };
}

