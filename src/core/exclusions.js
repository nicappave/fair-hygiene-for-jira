// Issues that say nothing about the assignee's habits are dropped from the pool:
// neither pass nor fail. Each rule carries an anti-loophole test so it can only
// ever remove an UNFAIR penalty, never hide a genuine miss.

import { BORN_DONE_MAX_MS } from './rules.js';
import { closer } from '../jira/normalize.js';

export function excludedByLabel(issue, config) {
  const wanted = new Set((config.excludeLabels || []).map((l) => l.toLowerCase()));
  const hit = issue.labels.find((l) => wanted.has(String(l).toLowerCase()));
  return hit ? `label:${hit}` : null;
}

// Created and closed within two minutes with no time from anyone: an import,
// a backfill or a bulk clean-up, not a work item.
export function bornDone(issue) {
  if (!issue.completedMs || !issue.createdMs) return false;
  return issue.completedMs - issue.createdMs <= BORN_DONE_MAX_MS && issue.worklogs.length === 0;
}

// Any trace of the member on the issue at all.
export function hasFootprint(issue, memberId) {
  return issue.worklogs.some((w) => w.authorId === memberId)
    || issue.comments.some((c) => c.authorId === memberId)
    || issue.attachments.some((a) => a.authorId === memberId)
    || issue.changes.some((c) => c.authorId === memberId);
}

// Someone else, or an automation, closed an issue the member never touched.
// Both pillars assume the assignee did the close; charging them for another
// person's act is the unfairness. Jira's changelog names the closer exactly.
// Zero footprint is the anti-loophole: any trace of the member and it scores.
export function closedByOther(issue, memberId) {
  const who = closer(issue);
  if (!who || !who.id || who.id === memberId) return null;
  if (hasFootprint(issue, memberId)) return null;
  return who.isApp ? 'closed_by_automation' : 'closed_by_other';
}

// A parent whose work lives in its sub-tasks would be judged twice: fairly on
// each sub-task and impossibly on the parent. The member's own time on one of
// their sub-tasks is the anti-loophole: an empty sub-task buys nothing.
export function parentContainer(issue, memberId, byKey, windowEndMs) {
  if (!issue.subtaskKeys.length) return false;
  if (issue.worklogs.length) return false;
  return issue.subtaskKeys.some((k) => {
    const sub = byKey.get(k);
    return sub && sub.assigneeId === memberId && sub.worklogs.some((w) => w.authorId === memberId
      && (!windowEndMs || w.createdMs <= windowEndMs));
  });
}
