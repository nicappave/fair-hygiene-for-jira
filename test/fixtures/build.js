// SYNTHETIC TEST FIXTURE BUILDER. Every person, issue and note here is
// invented to exercise one scoring rule; none of it is real usage data.
// The objects follow Jira Cloud REST v3 wire format (search/jql results with
// embedded worklog, comment and changelog blocks, ADF comment bodies, and
// "+0800" timestamps exactly as Jira sends them).

export const TZ = 'Asia/Singapore'; // UTC+8, no DST
export const OFFSET = '+0800';

export const PEOPLE = {
  ana: { accountId: 'fx-acc-ana', displayName: 'Ana Ortiz', accountType: 'atlassian' },
  ben: { accountId: 'fx-acc-ben', displayName: 'Ben Okafor', accountType: 'atlassian' },
  chen: { accountId: 'fx-acc-chen', displayName: 'Chen Wei', accountType: 'atlassian' },
  dara: { accountId: 'fx-acc-dara', displayName: 'Dara Novak', accountType: 'atlassian' },
  lena: { accountId: 'fx-acc-lena', displayName: 'Lena Fischer (lead)', accountType: 'atlassian' },
  bot: { accountId: 'fx-acc-automation', displayName: 'Automation for Jira', accountType: 'app' },
};

// "2026-10-20 10:15" -> Jira timestamp in the fixture zone.
export const ts = (s) => `${s.replace(' ', 'T')}:00.000${OFFSET}`;

// ADF body. Parts: plain strings, { link }, { card }, { media: true }.
export function adf(...parts) {
  const content = parts.map((p) => {
    if (typeof p === 'string') return { type: 'text', text: p };
    if (p.link) return { type: 'text', text: p.text || p.link, marks: [{ type: 'link', attrs: { href: p.link } }] };
    if (p.card) return { type: 'inlineCard', attrs: { url: p.card } };
    return null;
  }).filter(Boolean);
  const blocks = [{ type: 'paragraph', content }];
  if (parts.some((p) => p && p.media)) {
    blocks.push({ type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'fx-media', type: 'file', collection: '' } }] });
  }
  return { type: 'doc', version: 1, content: blocks };
}

let seq = 1000;
const nextId = () => String((seq += 1));

export function comment(who, at, ...parts) {
  return { id: nextId(), author: PEOPLE[who], body: adf(...parts), created: ts(at), updated: ts(at) };
}

export function worklog(who, started, created, minutes) {
  return {
    id: nextId(), author: PEOPLE[who], started: ts(started), created: ts(created),
    updated: ts(created), timeSpentSeconds: minutes * 60,
  };
}

export function move(who, at, from, to) {
  return { id: nextId(), author: PEOPLE[who], created: ts(at), items: [{ field: 'status', fromString: from, toString: to }] };
}

const CATEGORY = { 'To Do': 'new', 'In Progress': 'indeterminate', 'In Review': 'indeterminate', Done: 'done' };

// One issue. `done` = when it moved to Done (adds the changelog entry).
export function issue(key, o) {
  const status = o.status || (o.done ? 'Done' : 'In Progress');
  const histories = [...(o.history || [])];
  if (o.done) histories.push(move(o.closedBy || o.assignee, o.done, o.from || 'In Progress', 'Done'));
  const worklogs = o.worklogs || [];
  const comments = o.comments || [];
  return {
    id: String(10000 + Number(key.split('-')[1])),
    key,
    fields: {
      summary: o.summary,
      issuetype: { name: o.type || (o.subtask ? 'Sub-task' : 'Task'), subtask: Boolean(o.subtask) },
      assignee: o.assignee ? PEOPLE[o.assignee] : null,
      created: ts(o.created),
      updated: ts(o.updated || o.done || o.created),
      resolutiondate: o.done ? ts(o.done) : null,
      duedate: o.due || null,
      status: { name: status, statusCategory: { key: CATEGORY[status] } },
      resolution: o.done ? { name: o.resolution || 'Done' } : null,
      timeoriginalestimate: o.estimate === undefined ? 3600 : o.estimate,
      labels: o.labels || [],
      parent: o.parent ? { key: o.parent } : undefined,
      subtasks: (o.subtasks || []).map((k) => ({ key: k })),
      issuelinks: (o.links || []).map((k) => ({ type: { name: 'Relates' }, outwardIssue: { key: k } })),
      attachment: (o.attachments || []).map(([who, at, filename]) => ({
        id: nextId(), author: PEOPLE[who], created: ts(at), filename,
      })),
      worklog: { startAt: 0, maxResults: 20, total: o.worklogTotal || worklogs.length, worklogs },
      comment: { startAt: 0, maxResults: 50, total: o.commentTotal || comments.length, comments },
    },
    changelog: { startAt: 0, maxResults: 100, total: histories.length, histories },
  };
}
