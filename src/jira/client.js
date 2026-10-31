// Reads a project's issues for one period. `request(method, path, body)` is
// injected: the Forge binding in jira/forge.js in the app, a recorded-fixture
// transport in the tests. Read-only by construction: only GET and the search
// POST are ever issued.

import { normalizeIssue } from './normalize.js';
import { addDays } from '../core/time.js';

export const ISSUE_FIELDS = [
  'summary', 'issuetype', 'assignee', 'created', 'updated', 'resolutiondate', 'duedate',
  'status', 'resolution', 'timeoriginalestimate', 'labels', 'parent', 'subtasks',
  'issuelinks', 'attachment', 'worklog', 'comment',
];

const jqlString = (s) => `"${String(s).replace(/["\\]/g, '\\$&')}"`;

export async function searchAll(request, jql, { max = 1000 } = {}) {
  const issues = [];
  let nextPageToken;
  do {
    const page = await request('POST', '/rest/api/3/search/jql', {
      jql, fields: ISSUE_FIELDS, expand: 'changelog', maxResults: 100,
      ...(nextPageToken ? { nextPageToken } : {}),
    });
    issues.push(...(page.issues || []));
    nextPageToken = page.isLast === false || page.nextPageToken ? page.nextPageToken : undefined;
  } while (nextPageToken && issues.length < max);
  return issues;
}

async function pagedList(request, path, listKey, pageSize) {
  const out = [];
  let startAt = 0;
  for (let guard = 0; guard < 50; guard += 1) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await request('GET', `${path}${sep}startAt=${startAt}&maxResults=${pageSize}`);
    const items = page[listKey] || [];
    out.push(...items);
    const total = Number(page.total);
    if (page.isLast === true || !items.length || (Number.isFinite(total) && out.length >= total)) break;
    startAt += items.length;
  }
  return out;
}

// A search result embeds worklogs, comments and changelog, but truncated on
// busy issues. Fetch a full list only when the embedded one is short, so a
// typical week costs a couple of search calls rather than three per issue.
const truncated = (block, listKey) => Boolean(block)
  && Number.isFinite(Number(block.total)) && Number(block.total) > (block[listKey] || []).length;

export async function hydrate(request, issue, { comments = true, changelog = true } = {}) {
  const key = encodeURIComponent(issue.key);
  const f = issue.fields || {};
  const [worklogs, commentList, histories] = await Promise.all([
    truncated(f.worklog, 'worklogs')
      ? pagedList(request, `/rest/api/3/issue/${key}/worklog`, 'worklogs', 1000) : undefined,
    comments && truncated(f.comment, 'comments')
      ? pagedList(request, `/rest/api/3/issue/${key}/comment?orderBy=created`, 'comments', 100) : undefined,
    changelog && truncated(issue.changelog, 'histories')
      ? pagedList(request, `/rest/api/3/issue/${key}/changelog`, 'values', 100) : undefined,
  ]);
  return normalizeIssue(issue, { worklogs, comments: commentList, changelog: histories });
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Everything the scorer needs for one project and one Mon-Sun window.
export async function fetchPeriod(request, { projectKey, window }) {
  const project = jqlString(projectKey);
  // `updated` is a superset of "completed in the window" (completing an issue
  // updates it); the scorer filters on the exact completion time.
  const closedRaw = await searchAll(request,
    `project = ${project} AND statusCategory = Done AND updated >= ${jqlString(addDays(window.weekStart, -1))} ORDER BY updated DESC`);
  const openRaw = await searchAll(request,
    `project = ${project} AND statusCategory != Done AND assignee is not EMPTY ORDER BY duedate ASC`, { max: 500 });

  const closedIssues = await mapLimit(closedRaw, 5, (i) => hydrate(request, i));
  const openIssues = await mapLimit(openRaw, 5, (i) => hydrate(request, i));

  // Sub-tasks and linked issues closed in an earlier week still matter: a
  // parent is judged on its sub-tasks, and Claude checks whether an "excused"
  // note's work was timed on a linked issue.
  const have = new Set([...closedIssues, ...openIssues].map((i) => i.key));
  const missing = [...new Set(closedIssues.flatMap((i) => [...i.subtaskKeys, ...i.linkedKeys]))]
    .filter((k) => !have.has(k)).slice(0, 200);
  let related = [];
  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    const raw = await searchAll(request, `key in (${chunk.map(jqlString).join(',')})`);
    related = related.concat(await mapLimit(raw, 5, (r) => hydrate(request, r, { comments: false, changelog: false })));
  }
  return { closedIssues, openIssues, relatedIssues: related };
}
