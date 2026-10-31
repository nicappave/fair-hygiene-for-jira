// "There was nothing to do this cycle." Two layers:
//   1. a fast path: short notes matching phrase sets defer automatically;
//   2. everything that merely LOOKS like such a note is nominated for Claude,
//      which reads the whole issue and decides. A cue nominates; it never decides.

import {
  DEFERRAL_PATTERNS, DEFERRAL_SHORT_PATTERNS, DEFERRAL_NOTHING_PATTERNS,
  DEFERRAL_MAX_CHARS, REVIEW_MAX_CHARS, CUE_RE, CUE_IGNORE_RE, HOLD_ONLY_RE,
  NOT_DONE_RESOLUTIONS,
} from './rules.js';
import { predatesIssue } from './pillars.js';

// The assignee's own notes, written on this issue (not copied onto it) and
// before the period closed: the only evidence a deferral may rest on.
export function ownWindowNotes(issue, memberId, windowEndMs) {
  return issue.comments.filter((c) => c.authorId === memberId
    && c.text.trim()
    && (!windowEndMs || (c.createdMs && c.createdMs <= windowEndMs))
    && !predatesIssue(c, issue));
}

export function matchDeferral(issue, memberId, windowEndMs) {
  for (const c of ownWindowNotes(issue, memberId, windowEndMs)) {
    const text = c.text.trim();
    if (text.length > DEFERRAL_MAX_CHARS) continue;
    const m = text.match(DEFERRAL_PATTERNS)
      || text.match(DEFERRAL_SHORT_PATTERNS)
      || text.match(DEFERRAL_NOTHING_PATTERNS);
    if (m) return m[0].toLowerCase().trim();
    if (HOLD_ONLY_RE.test(text)) return 'hold';
  }
  return null;
}

// Call only on a FAILING issue that matchDeferral() did not defer.
export function deferralCue(issue, memberId, windowEndMs) {
  const notes = ownWindowNotes(issue, memberId, windowEndMs);
  for (const c of notes) {
    const text = c.text.trim();
    if (text.length > DEFERRAL_MAX_CHARS) {
      const m = text.match(DEFERRAL_SHORT_PATTERNS) || text.match(DEFERRAL_NOTHING_PATTERNS)
        || text.match(DEFERRAL_PATTERNS);
      if (m) return { why: 'long_note_phrase_match', cue: m[0].toLowerCase(), note: text.slice(0, 600) };
    }
    if (text.length <= REVIEW_MAX_CHARS) {
      const m = text.replace(CUE_IGNORE_RE, ' ').match(CUE_RE);
      if (m) return { why: 'short_note_cue', cue: m[0].toLowerCase(), note: text.slice(0, 600) };
    }
  }
  const res = (issue.resolution || '').toLowerCase();
  if (NOT_DONE_RESOLUTIONS.has(res)) {
    return { why: 'not_done_resolution', cue: issue.resolution, note: notes.length ? notes[notes.length - 1].text.slice(0, 600) : '' };
  }
  return null;
}
