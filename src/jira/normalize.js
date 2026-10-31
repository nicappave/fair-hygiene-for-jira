// Jira Cloud REST v3 JSON -> the plain shape the scorer reads. Keeping the
// scorer free of Jira's wire format means the rules are tested on the same
// objects in tests and in production.

import { toMs } from '../core/time.js';

// Atlassian Document Format -> { text, hasMedia, hasLink }.
export function adfToText(adf) {
  if (adf === null || adf === undefined) return { text: '', hasMedia: false, hasLink: false };
  if (typeof adf === 'string') {
    return { text: adf, hasMedia: false, hasLink: /https?:\/\//i.test(adf) };
  }
  const out = { parts: [], hasMedia: false, hasLink: false };
  const BLOCK = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock', 'tableCell', 'panel']);
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const t = node.type;
    if (t === 'text') {
      out.parts.push(node.text || '');
      if ((node.marks || []).some((m) => m.type === 'link')) out.hasLink = true;
    } else if (t === 'media' || t === 'mediaSingle' || t === 'mediaGroup' || t === 'mediaInline') {
      out.hasMedia = true;
    } else if (t === 'inlineCard' || t === 'blockCard' || t === 'embedCard') {
      out.hasLink = true;
      if (node.attrs && node.attrs.url) out.parts.push(node.attrs.url);
    } else if (t === 'hardBreak') {
      out.parts.push('\n');
    } else if (t === 'mention') {
      out.parts.push((node.attrs && node.attrs.text) || '@someone');
    } else if (t === 'emoji') {
      out.parts.push((node.attrs && (node.attrs.text || node.attrs.shortName)) || '');
    }
    for (const child of node.content || []) walk(child);
    if (BLOCK.has(t)) out.parts.push('\n');
  };
  walk(adf);
  const text = out.parts.join('').replace(/\n{2,}/g, '\n').trim();
  return { text, hasMedia: out.hasMedia, hasLink: out.hasLink || /https?:\/\//i.test(text) };
}

// Automation for Jira and Forge/Connect apps act as accountType "app".
const isApp = (user) => Boolean(user && user.accountType === 'app');

function person(user) {
  if (!user) return { id: '', name: '', isApp: false };
  return { id: user.accountId || '', name: user.displayName || '', isApp: isApp(user) };
}

// `issue` is a /search/jql or /issue result; `extra` carries the full lists
// fetched separately (worklogs, comments and changelog are paginated and the
// embedded copies on a search result are truncated).
export function normalizeIssue(issue, extra = {}) {
  const f = issue.fields || {};
  const assignee = person(f.assignee);
  const worklogs = (extra.worklogs || (f.worklog && f.worklog.worklogs) || []).map((w) => ({
    authorId: (w.author && w.author.accountId) || '',
    startedMs: toMs(w.started),
    createdMs: toMs(w.created),
    seconds: Number(w.timeSpentSeconds) || 0,
  }));
  const comments = (extra.comments || (f.comment && f.comment.comments) || []).map((c) => {
    const body = adfToText(c.body);
    const author = person(c.author);
    return {
      id: String(c.id || ''),
      authorId: author.id,
      authorName: author.name,
      authorIsApp: author.isApp,
      createdMs: toMs(c.created),
      text: body.text,
      hasMedia: body.hasMedia,
      hasLink: body.hasLink,
    };
  }).sort((a, b) => a.createdMs - b.createdMs);
  const attachments = (f.attachment || []).map((a) => ({
    authorId: (a.author && a.author.accountId) || '',
    createdMs: toMs(a.created),
    filename: a.filename || '',
  }));
  const histories = extra.changelog || (issue.changelog && issue.changelog.histories) || [];
  const changes = [];
  for (const h of histories) {
    const author = person(h.author);
    for (const item of h.items || []) {
      changes.push({
        field: String(item.field || '').toLowerCase(),
        from: item.fromString || '',
        to: item.toString || '',
        authorId: author.id,
        authorName: author.name,
        authorIsApp: author.isApp,
        atMs: toMs(h.created),
      });
    }
  }
  changes.sort((a, b) => a.atMs - b.atMs);
  const status = f.status || {};
  const statusCategory = (status.statusCategory && status.statusCategory.key) || '';

  return {
    key: issue.key,
    summary: f.summary || '',
    issueType: (f.issuetype && f.issuetype.name) || '',
    isSubtask: Boolean(f.issuetype && f.issuetype.subtask),
    assigneeId: assignee.id,
    assigneeName: assignee.name,
    createdMs: toMs(f.created),
    updatedMs: toMs(f.updated),
    resolvedMs: toMs(f.resolutiondate),
    completedMs: completionMs(status.name, statusCategory, changes, toMs(f.resolutiondate)),
    due: f.duedate || '',
    status: status.name || '',
    statusCategory,
    resolution: (f.resolution && f.resolution.name) || '',
    estimateSeconds: Number(f.timeoriginalestimate) || 0,
    labels: f.labels || [],
    parentKey: (f.parent && f.parent.key) || '',
    subtaskKeys: (f.subtasks || []).map((s) => s.key),
    linkedKeys: (f.issuelinks || [])
      .map((l) => (l.outwardIssue && l.outwardIssue.key) || (l.inwardIssue && l.inwardIssue.key))
      .filter(Boolean),
    worklogs,
    comments,
    attachments,
    changes,
  };
}

// When the issue entered its current done status. The changelog is exact; the
// resolution date is used only when the changelog has no status move (issues
// created directly in a done status by an import).
export function completionMs(statusName, statusCategory, changes, resolvedMs) {
  if (statusCategory !== 'done') return 0;
  for (let i = changes.length - 1; i >= 0; i -= 1) {
    const c = changes[i];
    if (c.field === 'status' && c.to.toLowerCase() === String(statusName).toLowerCase()) return c.atMs;
  }
  return resolvedMs || 0;
}

// Who moved the issue into its current done status.
export function closer(issue) {
  for (let i = issue.changes.length - 1; i >= 0; i -= 1) {
    const c = issue.changes[i];
    if (c.field === 'status' && c.atMs === issue.completedMs) {
      return { id: c.authorId, name: c.authorName, isApp: c.authorIsApp };
    }
  }
  return null;
}
