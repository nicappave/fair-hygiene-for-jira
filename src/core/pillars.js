// The two pillars a closed issue is held to, per assignee.
//   P1  time logged the same day the work happened (worklog started == logged)
//   P2  proof of work: the assignee's own attachment, link, image or a
//       descriptive note, posted by the end of the scored period
// Evidence added after the period closed is inadmissible: a person shown a
// failing report must not earn a retroactive pass by back-filling.

import { localDate } from './time.js';
import {
  DESCRIPTIVE_MIN_CHARS, PERFUNCTORY, URL_RE, NON_ALPHA_RE, QC_NAME_RE,
} from './rules.js';

export function scorePillar1(issue, memberId, windowEndMs, timeZone) {
  const own = issue.worklogs.filter((w) => w.authorId === memberId
    && (!windowEndMs || (w.createdMs && w.createdMs <= windowEndMs)));
  if (!own.length) return { pass: false, reason: 'no_time_logged', entries: 0, backdated: 0 };
  const backdated = own.filter((w) => !w.startedMs || !w.createdMs
    || localDate(w.startedMs, timeZone) !== localDate(w.createdMs, timeZone)).length;
  return {
    pass: backdated === 0,
    reason: backdated === 0 ? 'ok' : 'backdated_worklog',
    entries: own.length,
    backdated,
  };
}

export function isProofText(text) {
  if (!text) return false;
  if (URL_RE.test(text)) return true;
  const s = text.trim();
  if (!s || NON_ALPHA_RE.test(s)) return false;
  if (PERFUNCTORY.has(s.toLowerCase().replace(/[.!?]+$/, ''))) return false;
  return s.length >= DESCRIPTIVE_MIN_CHARS;
}

export function isQcIssue(issue) {
  return QC_NAME_RE.test(issue.summary || '');
}

export function isQcVerdict(text) {
  const s = (text || '').trim();
  if (!s || NON_ALPHA_RE.test(s)) return false;
  return !PERFUNCTORY.has(s.toLowerCase().replace(/[.!?]+$/, ''));
}

// A comment older than its own issue was copied there (clones and recurring
// issue templates carry comments over with their original timestamps).
export function predatesIssue(c, issue) {
  return Boolean(issue.createdMs) && c.createdMs < issue.createdMs;
}

const inWindow = (ms, windowEndMs) => Boolean(ms) && (!windowEndMs || ms <= windowEndMs);

export function scorePillar2(issue, memberId, windowEndMs) {
  const ownFiles = issue.attachments.filter((a) => a.authorId === memberId
    && inWindow(a.createdMs, windowEndMs));
  if (ownFiles.length) return { pass: true, reason: 'attachment' };

  const qc = isQcIssue(issue);
  let qcVerdict = false;
  let copied = false;
  for (const c of issue.comments) {
    if (c.authorId !== memberId || !inWindow(c.createdMs, windowEndMs)) continue;
    const wouldPass = c.hasMedia || c.hasLink || isProofText(c.text) || (qc && isQcVerdict(c.text));
    if (predatesIssue(c, issue)) {
      if (wouldPass) copied = true;
      continue;
    }
    if (c.hasMedia) return { pass: true, reason: 'image_in_comment' };
    if (c.hasLink || URL_RE.test(c.text)) return { pass: true, reason: 'link_in_comment' };
    if (isProofText(c.text)) return { pass: true, reason: 'descriptive_comment' };
    if (qc && isQcVerdict(c.text)) qcVerdict = true;
  }
  if (qcVerdict) return { pass: true, reason: 'review_verdict' };
  return { pass: false, reason: copied ? 'copied_comment_only' : 'no_proof' };
}
