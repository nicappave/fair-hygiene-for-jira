// Scoring rules and their defaults. Every number here was calibrated on a real
// team's weekly runs before it was ported: the thresholds sit in the gap between
// genuine cases and noise, so change them only with data in front of you.

export const DEFAULT_CONFIG = Object.freeze({
  // IANA zone the team works in. "Same day" and week boundaries use it.
  timeZone: 'UTC',
  // Pillar 1 (time logged the same day the work happened). Teams that do not
  // log time in Jira switch it off and are scored on Pillar 2 alone.
  requireWorklog: true,
  // Gate on the pooled per-assignee rate.
  gatePass: 0.75,
  gateAtRisk: 0.6,
  // Fewer closed issues than this in the period: rate shown, gate not applied.
  minSample: 5,
  // Open issues untouched by their assignee for this many days count as stale.
  staleDays: 7,
  // Issues carrying any of these labels are dropped from the pool entirely.
  excludeLabels: ['time-off', 'hygiene-exclude'],
  // Time spent in these statuses turns a late close into "blocked".
  blockingStatuses: [
    'waiting for feedback', 'awaiting feedback', 'in review', 'review',
    'code review', 'client review', 'qa', 'waiting on customer',
    'waiting for customer', 'waiting on client', 'blocked', 'on hold',
  ],
  // Model families to try, in order, from the models Forge LLMs lists as active.
  modelPreference: ['sonnet', 'haiku', 'opus'],
});

// Pillar 2: what counts as proof of work.
export const DESCRIPTIVE_MIN_CHARS = 20;
export const PERFUNCTORY = new Set([
  'done', 'ok', 'okay', 'k', 'finished', 'complete', 'completed', 'fixed',
  'yes', 'y', 'no', 'n', 'thanks', 'thank you', 'ty', 'noted', 'resolved',
]);
export const URL_RE = /https?:\/\/\S+/i;
export const NON_ALPHA_RE = /^[\W_]+$/u;
// On a review/QC issue the verdict IS the deliverable, so a short verdict
// ("all good", "LGTM") is proof. Bare acknowledgements still are not.
export const QC_NAME_RE = /\bQC\b|\bcode review\b|\binternal review\b|\breview\b.*\bPR\b/i;

// Exclusions.
export const BORN_DONE_MAX_MS = 120_000;

// Deferral: an assignee's own note saying there was nothing to do this cycle
// passes both pillars, because writing that note IS the hygiene signal.
// Three phrase sets, matched on the assignee's own in-window notes only.
export const DEFERRAL_PATTERNS = new RegExp(
  '\\b(' + [
    'not\\s+(this\\s+)?(cycle|sprint)(\\s+yet)?',
    'next\\s+(cycle|sprint)',
    'not\\s+yet\\s+time',
    'too\\s+early',
    'no\\s+longer\\s+(a\\s+)?(client|customer)',
    '(client|customer)\\s+(has\\s+)?(cancell?ed|churned|gone)',
    'on\\s+hold',
    'not\\s+applicable',
    'not\\s+required',
    'n\\s*/\\s*a',
  ].join('|') + ')\\b', 'i');

export const DEFERRAL_SHORT_PATTERNS = new RegExp(
  '\\b(' + [
    'no\\s+new\\s+\\w+',
    'no\\s+\\w+(\\s+\\w+){0,3}\\s+(is\\s+|are\\s+|was\\s+|were\\s+)?(required|needed|necessary)',
    'nothing\\s+to\\s+(do|set\\s*up|report|update|action|change|fix)',
  ].join('|') + ')\\b', 'i');

export const DEFERRAL_NOTHING_PATTERNS = new RegExp(
  '\\b(' + [
    'no\\s+need(?:\\s+(?:this|for|to\\s+do|any|as|since|because|yet)\\b|[\\s.!]*$)',
    'no\\s+(\\w+\\s+){0,2}work\\s+(for|this|needed|required|to\\s+do)\\b',
    'no\\s+(\\w+\\s+){0,2}(changes?|reports?|tasks?|updates?|fix(es)?)' +
      '\\s+(this|for|as|at|since|because|required|needed|today|yet)\\b',
  ].join('|') + ')', 'i');

// A deferral bypasses BOTH pillars, so the phrase has to BE the note, not sit
// somewhere inside a pasted block: every genuine deferral seen in production
// was under 100 characters, the false positives were pasted dumps over 200.
export const DEFERRAL_MAX_CHARS = 200;

// Notes that might mean "nothing to do" but match no phrase are not decided by
// a regex. They are nominated for Claude, which reads the whole issue.
export const REVIEW_MAX_CHARS = 300;
export const CUE_RE = new RegExp(
  '\\b(no|not|nothing|none|n\\s*/\\s*a|skip(?:ped)?|hold|paus(?:e|ed)|' +
  'cancel\\w*|postpon\\w*|waiting|blocked|already|unnecessary|without|' +
  'abandon\\w*|duplicat\\w*|superseded|obsolete|won\'?t|stopped|churn\\w*|' +
  'next\\s+(?:month|sprint|week)|(?:do|does|did|is|are|was|were|has|have|ca)n\'?t)\\b',
  'i');
// Hedges that carry a cue word but never mean "nothing to do".
export const CUE_IGNORE_RE = /\b(no\s+problem|no\s+worries|not\s+sure|if\s+not|why\s+not|not\s+only)\b/gi;
export const HOLD_ONLY_RE = /^\s*hold[.!\s]*$/i;

// Jira resolutions that say "we did not do this". The resolution alone is not
// an excuse; it nominates the issue so Claude can check the note behind it.
export const NOT_DONE_RESOLUTIONS = new Set([
  "won't do", 'wont do', "won't fix", 'duplicate', 'cannot reproduce',
  'declined', 'obsolete', 'abandoned',
]);

export function mergeConfig(partial = {}) {
  const out = { ...DEFAULT_CONFIG };
  for (const [k, v] of Object.entries(partial || {})) {
    if (v !== undefined && v !== null && k in DEFAULT_CONFIG) out[k] = v;
  }
  return out;
}
