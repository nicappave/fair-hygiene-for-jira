// Lateness of closed issues and the state of open ones. Neither gates the
// score: they are shown beside it, with Claude judging whether a stated reason
// actually explains the delay.

import { dueEndMs, localMidnightMs } from './time.js';
import { isProofText } from './pillars.js';

// Did the issue ever sit in a status where the assignee waits on someone else?
export function wasBlocked(issue, config) {
  const blocking = new Set((config.blockingStatuses || []).map((s) => s.toLowerCase()));
  return issue.changes.some((c) => c.field === 'status' && blocking.has(c.to.toLowerCase()));
}

// A human comment that may explain a delay, written between `fromMs` and
// `untilMs` by anyone (a reviewer saying "customer missed the upload" is as
// good a reason as the assignee's own). `pick` chooses the first such note
// (the explanation written when the issue slipped) or the latest.
export function delayNote(issue, fromMs, untilMs, pick = 'last') {
  const notes = issue.comments.filter((c) => !c.authorIsApp && c.createdMs >= fromMs
    && (!untilMs || c.createdMs <= untilMs) && isProofText(c.text));
  if (!notes.length) return null;
  return pick === 'first' ? notes[0] : notes[notes.length - 1];
}

export function classifyClosedLateness(issue, config, windowEndMs) {
  if (!issue.due) return { status: 'no_due_date' };
  const dueEnd = dueEndMs(issue.due, config.timeZone);
  if (issue.completedMs <= dueEnd) return { status: 'on_time' };
  if (wasBlocked(issue, config)) return { status: 'blocked' };
  const note = delayNote(issue, localMidnightMs(issue.due.slice(0, 10), config.timeZone), windowEndMs, 'first');
  if (note) return { status: 'late_with_note', note: note.text.slice(0, 600) };
  return { status: 'late' };
}

// Most recent activity on the issue by the member: comment, worklog or edit.
export function lastOwnActivityMs(issue, memberId) {
  let last = 0;
  for (const c of issue.comments) if (c.authorId === memberId) last = Math.max(last, c.createdMs);
  for (const w of issue.worklogs) if (w.authorId === memberId) last = Math.max(last, w.createdMs);
  for (const c of issue.changes) if (c.authorId === memberId) last = Math.max(last, c.atMs);
  return last;
}

export function classifyOpen(issue, config, nowMs) {
  const flags = [];
  const dueEnd = issue.due ? dueEndMs(issue.due, config.timeZone) : 0;
  if (dueEnd && dueEnd < nowMs) flags.push('overdue');
  if (!issue.due) flags.push('no_due_date');
  if (!issue.estimateSeconds && !issue.isSubtask) flags.push('no_estimate');
  const idleSince = lastOwnActivityMs(issue, issue.assigneeId) || issue.createdMs;
  const idleDays = Math.floor((nowMs - idleSince) / 86_400_000);
  if (issue.statusCategory === 'indeterminate' && idleDays >= config.staleDays) flags.push('stale');
  // The latest human note on the thread is the candidate excuse: "parked until
  // the vendor sends keys" is often written before the issue goes idle.
  const note = (flags.includes('overdue') || flags.includes('stale')) ? delayNote(issue, 0, nowMs) : null;
  return { flags, idleDays, note: note ? note.text.slice(0, 600) : '' };
}
