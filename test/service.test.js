// The Jira client and the app's use cases, run against an in-process Jira
// transport that serves the SYNTHETIC fixture week (test/fixtures/demo-week.js)
// and records every call. Not real usage data; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { closed, open, related, WEEK_START, NOW } from './fixtures/demo-week.js';
import { TZ, issue, comment } from './fixtures/build.js';
import { fetchPeriod } from '../src/jira/client.js';
import { weekWindow } from '../src/core/time.js';
import { buildReport, judgePending, overrideVerdict, slimReport, reportForAgent } from '../src/service.js';
import { memoryStore } from '../src/store/memory.js';

// Serves searches from the fixture set, 10 issues per page, plus the
// per-issue list endpoints. Records calls so tests can check what was read.
function fixtureJira(extra = {}) {
  const calls = [];
  const all = [...closed, ...related, ...open];
  const request = async (method, path, body) => {
    calls.push({ method, path: path.split('?')[0], body });
    if (method === 'POST' && path === '/rest/api/3/search/jql') {
      let pool;
      if (/statusCategory = Done/.test(body.jql)) pool = closed;
      else if (/statusCategory != Done/.test(body.jql)) pool = open;
      else if (/^key in/.test(body.jql)) {
        const keys = [...body.jql.matchAll(/"([A-Z]+-\d+)"/g)].map((m) => m[1]);
        pool = all.filter((i) => keys.includes(i.key));
      } else throw new Error(`unexpected JQL ${body.jql}`);
      const start = Number(body.nextPageToken || 0);
      const page = pool.slice(start, start + 10);
      const more = start + 10 < pool.length;
      return { issues: page, isLast: !more, ...(more ? { nextPageToken: String(start + 10) } : {}) };
    }
    const m = path.match(/^\/rest\/api\/3\/issue\/([A-Z]+-\d+)\/(worklog|comment|changelog)/);
    if (method === 'GET' && m && extra[m[1]] && extra[m[1]][m[2]]) return extra[m[1]][m[2]](path);
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { request, calls };
}

test('client: pages through search, reads only, and pulls in linked issues', async () => {
  const jira = fixtureJira();
  const period = await fetchPeriod(jira.request, { projectKey: 'DEMO', window: weekWindow(WEEK_START, TZ) });
  assert.equal(period.closedIssues.length, closed.length);
  assert.equal(period.openIssues.length, open.length);
  assert.deepEqual(period.relatedIssues.map((i) => i.key), ['DEMO-210']);
  const searches = jira.calls.filter((c) => c.path === '/rest/api/3/search/jql');
  assert.equal(searches.filter((c) => /statusCategory = Done/.test(c.body.jql)).length, 3, '27 closed issues = 3 pages');
  assert.match(searches[0].body.jql, /^project = "DEMO" AND statusCategory = Done AND updated >= "2026-10-18"/);
  assert.equal(searches[0].body.expand, 'changelog');
  assert.ok(searches[0].body.fields.includes('worklog'));
  assert.ok(jira.calls.every((c) => c.method === 'GET' || c.path === '/rest/api/3/search/jql'), 'read-only');
  assert.equal(jira.calls.filter((c) => c.method === 'GET').length, 0, 'nothing truncated, so no per-issue calls');
});

test('client: a truncated comment list is fetched in full, across pages', async () => {
  const busy = issue('DEMO-901', {
    summary: 'Busy thread', assignee: 'ana', created: '2026-10-19 09:00', done: '2026-10-21 10:00',
    comments: [comment('ana', '2026-10-21 09:00', 'first page only')], commentTotal: 3,
  });
  closed.push(busy);
  try {
    const pages = [
      { comments: [comment('lena', '2026-10-19 10:00', 'one'), comment('lena', '2026-10-20 10:00', 'two')], total: 3, startAt: 0 },
      { comments: [comment('ana', '2026-10-21 09:00', 'Shipped the fix with a regression test.')], total: 3, startAt: 2 },
    ];
    const jira = fixtureJira({ 'DEMO-901': { comment: (p) => pages[/startAt=0/.test(p) ? 0 : 1] } });
    const period = await fetchPeriod(jira.request, { projectKey: 'DEMO', window: weekWindow(WEEK_START, TZ) });
    const got = period.closedIssues.find((i) => i.key === 'DEMO-901');
    assert.equal(got.comments.length, 3);
    assert.equal(jira.calls.filter((c) => c.path === '/rest/api/3/issue/DEMO-901/comment').length, 2);
  } finally {
    closed.pop();
  }
});

test('service: report -> judge -> report, with verdicts persisted', async () => {
  const store = memoryStore();
  await store.setConfig('DEMO', { timeZone: TZ });
  const jira = fixtureJira();
  const r1 = await buildReport({ request: jira.request, store, projectKey: 'DEMO', weekStart: WEEK_START, nowMs: NOW });
  assert.equal(r1.pending.length, 8);
  assert.equal(r1.window.weekStart, '2026-10-19');

  // Scripted stand-in for Claude: fails one item, decides the rest by kind.
  const scriptedChat = async (req) => {
    const ctx = JSON.parse(req.messages[1].content.replace(/^[^{]*/, ''));
    if (ctx.issue.key === 'DEMO-306') throw new Error('LLM quota exceeded');
    const decision = { deferral: 'score', late: 'legitimate', open: 'not_legitimate' }[ctx.kind];
    return { choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'record_verdict', arguments: { decision, reason: 'scripted', confidence: 'high' } } }] } }] };
  };
  const results = await judgePending({ store, projectKey: 'DEMO', ids: r1.pending.map((p) => p.id), llm: { chat: scriptedChat, model: 'fixture-model' } });
  assert.equal(results.filter((x) => x.ok).length, 7);
  assert.deepEqual(results.filter((x) => !x.ok).map((x) => x.error), ['LLM quota exceeded']);

  const r2 = await buildReport({ request: fixtureJira().request, store, projectKey: 'DEMO', weekStart: WEEK_START, nowMs: NOW });
  assert.deepEqual(r2.pending.map((p) => p.issueKey), ['DEMO-306'], 'the failed call stays pending, never a guessed verdict');

  // A project admin overrules one verdict; restoring brings Claude's back.
  const item = r2.members.flatMap((m) => m.rows).find((r) => r.key === 'DEMO-204').review;
  assert.equal(item.decision, 'score');
  await overrideVerdict({ store, projectKey: 'DEMO', id: item.id, kind: 'deferral', decision: 'defer', reason: 'Campaign paused, confirmed', by: 'fx-acc-lena' });
  const r3 = await buildReport({ request: fixtureJira().request, store, projectKey: 'DEMO', weekStart: WEEK_START, nowMs: NOW });
  const after = r3.members.flatMap((m) => m.rows).find((r) => r.key === 'DEMO-204');
  assert.equal(after.review.source, 'lead');
  assert.equal(after.pass, true);
  await assert.rejects(overrideVerdict({ store, projectKey: 'DEMO', id: item.id, kind: 'deferral', decision: 'legitimate' }), /not a valid deferral verdict/);
  await overrideVerdict({ store, projectKey: 'DEMO', id: item.id, kind: 'deferral', decision: null });
  const r4 = await buildReport({ request: fixtureJira().request, store, projectKey: 'DEMO', weekStart: WEEK_START, nowMs: NOW });
  assert.equal(r4.members.flatMap((m) => m.rows).find((r) => r.key === 'DEMO-204').review.source, 'claude');
});

test('service: the UI payload drops the evidence bundle; the agent view has the numbers', async () => {
  const store = memoryStore();
  await store.setConfig('DEMO', { timeZone: TZ });
  const report = await buildReport({ request: fixtureJira().request, store, projectKey: 'DEMO', weekStart: WEEK_START, nowMs: NOW });
  const slim = slimReport(report);
  assert.ok(!JSON.stringify(slim).includes('"thread"'));
  assert.match(slim.pending.find((p) => p.issueKey === 'DEMO-204').note, /paused the campaign/);
  const agent = reportForAgent(report, 'chen');
  assert.equal(agent.people.length, 1);
  assert.equal(agent.people[0].overall, '20%');
  assert.deepEqual(agent.people[0].biggestLever, { reason: 'no_proof', count: 4 });
  assert.equal(agent.period, '2026-10-19 to 2026-10-25 (Asia/Singapore)');
});
