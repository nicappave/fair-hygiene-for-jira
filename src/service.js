// The app's use cases, with every side effect injected (Jira transport, store,
// LLM). Resolvers and Rovo actions are thin wrappers around these.

import { scorePeriod, VERDICTS } from './core/scorer.js';
import { mergeConfig } from './core/rules.js';
import { weekWindow, localDate } from './core/time.js';
import { fetchPeriod } from './jira/client.js';
import { judgeItem } from './llm/judge.js';

const validZone = (tz) => {
  if (!tz || typeof tz !== 'string') return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
};

const allItems = (report) => {
  const items = [];
  for (const m of report.members) {
    for (const r of m.rows) {
      if (r.review) items.push(r.review);
      if (r.lateness && r.lateness.review) items.push(r.lateness.review);
    }
    for (const o of m.open) if (o.review) items.push(o.review);
  }
  return items;
};

// The note that triggered a review, for the UI and the digest.
const triggerNote = (item) => {
  const cue = item.context.nominatedBecause || {};
  return String(cue.note || '').slice(0, 280);
};

// Strip the evidence bundle before a report leaves the backend: the UI needs
// the verdict and the note, not the whole thread.
export function slimReport(report) {
  const slim = (item) => item && {
    id: item.id, kind: item.kind, issueKey: item.issueKey, summary: item.summary,
    memberName: item.memberName, status: item.status, decision: item.decision,
    reason: item.reason, source: item.source,
    nominatedBecause: item.context.nominatedBecause, note: triggerNote(item),
  };
  return {
    ...report,
    members: report.members.map((m) => ({
      ...m,
      rows: m.rows.map((r) => ({
        ...r, review: slim(r.review),
        lateness: r.lateness && { ...r.lateness, review: slim(r.lateness.review) },
      })),
      open: m.open.map((o) => ({ ...o, review: slim(o.review) })),
    })),
    pending: report.pending.map(slim),
  };
}

// `timeZone` is the viewer's own zone, used only until a project admin saves
// one in Settings. With no week given, the report shows the current week so far.
export async function buildReport({ request, store, projectKey, weekStart, timeZone, nowMs = Date.now() }) {
  const config = mergeConfig({ ...(validZone(timeZone) ? { timeZone } : {}), ...(await store.getConfig(projectKey)) });
  const window = weekWindow(weekStart || localDate(nowMs, config.timeZone), config.timeZone);
  const period = await fetchPeriod(request, { projectKey, window });
  const input = {
    closedIssues: [...period.closedIssues, ...period.relatedIssues],
    openIssues: period.openIssues,
    window, config, nowMs,
  };
  // Pass 1 finds every item that needs a verdict; pass 2 applies the stored ones.
  const first = scorePeriod(input);
  const ids = allItems(first).map((i) => i.id);
  const verdicts = await store.getVerdicts(projectKey, ids);
  const report = scorePeriod({ ...input, verdicts });
  await Promise.all(report.pending.map((item) => store.putContext(projectKey, item.id, {
    id: item.id, kind: item.kind, context: item.context,
  })));
  report.projectKey = projectKey;
  report.generatedAt = new Date(nowMs).toISOString();
  return report;
}

// Judge a batch of pending items. A failed call leaves its item pending with
// the error: an unreadable or missing answer never becomes a verdict.
export async function judgePending({ store, projectKey, ids, llm }) {
  const results = await Promise.all(ids.map(async (id) => {
    const item = await store.getContext(projectKey, id);
    if (!item) return { id, ok: false, error: 'evidence expired: reload the report' };
    try {
      const verdict = await judgeItem(item, llm);
      await store.putVerdict(projectKey, id, verdict);
      return { id, ok: true, verdict };
    } catch (e) {
      return { id, ok: false, error: String(e.message || e).slice(0, 200) };
    }
  }));
  return results;
}

export async function overrideVerdict({ store, projectKey, id, kind, decision, reason }) {
  if (decision === null) {
    await store.clearOverride(projectKey, id);
    return { id, cleared: true };
  }
  if (!VERDICTS[kind] || !VERDICTS[kind].includes(decision)) {
    throw new Error(`"${decision}" is not a valid ${kind} verdict`);
  }
  // Who overruled is not stored: the app keeps no user references.
  const v = { decision, reason: String(reason || 'Set by the team lead').slice(0, 140), at: new Date().toISOString() };
  await store.putOverride(projectKey, id, v);
  return { id, verdict: { ...v, source: 'lead' } };
}

// Compact text for the Rovo agent: the numbers and the one habit to fix.
export function reportForAgent(report, person) {
  const pct = (x) => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`);
  const members = report.members
    .filter((m) => !person || m.name.toLowerCase().includes(String(person).toLowerCase()));
  return {
    period: `${report.window.weekStart} to ${report.window.weekEnd} (${report.window.timeZone})`,
    team: { overall: pct(report.team.overallRate), ...report.team },
    people: members.map((m) => ({
      name: m.name,
      overall: pct(m.summary.overallRate),
      gate: m.summary.gate,
      timeSameDay: pct(m.summary.p1Rate),
      proofOfWork: pct(m.summary.p2Rate),
      onTime: pct(m.summary.lateness.onTimeRate),
      biggestLever: m.summary.topFailReason,
      openRisks: m.summary.open,
      failedIssues: m.rows.filter((r) => !r.excluded && !r.pass).map((r) => ({
        key: r.key, summary: r.summary,
        why: [r.p1 && !r.p1.pass && r.p1.reason, r.p2 && !r.p2.pass && r.p2.reason].filter(Boolean),
      })),
      judgedNotes: m.rows.filter((r) => r.review).map((r) => ({
        key: r.key, status: r.review.status, decision: r.review.decision, reason: r.review.reason,
      })),
    })),
    pendingJudgements: report.pending.length,
  };
}
