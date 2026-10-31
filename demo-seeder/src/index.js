// Executes a list of operations, each as a named user (offline impersonation)
// or as the app itself. Returns per-op results. Dev-only.
import api, { route, assumeTrustedRoute } from '@forge/api';

const actor = (as) => (as === 'app' ? api.asApp() : api.asUser(as));

const doc = (text, link) => ({
  type: 'doc', version: 1,
  content: [{ type: 'paragraph', content: [
    { type: 'text', text },
    ...(link ? [{ type: 'text', text: link, marks: [{ type: 'link', attrs: { href: link } }] }] : []),
  ] }],
});

async function call(as, method, path, body) {
  const res = await actor(as).requestJira(path, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function run(op, keys) {
  const k = (alias) => keys[alias] || alias;
  switch (op.op) {
    case 'create': {
      const r = await call(op.as, 'POST', route`/rest/api/3/issue`, { fields: op.fields });
      keys[op.alias] = r.key;
      return r.key;
    }
    case 'comment':
      await call(op.as, 'POST', route`/rest/api/3/issue/${k(op.issue)}/comment`, { body: doc(op.text, op.link) });
      return 'ok';
    case 'worklog':
      await call(op.as, 'POST', route`/rest/api/3/issue/${k(op.issue)}/worklog?notifyUsers=false`, {
        started: op.started, timeSpentSeconds: op.minutes * 60,
      });
      return 'ok';
    case 'transition': {
      const t = await call(op.as, 'GET', route`/rest/api/3/issue/${k(op.issue)}/transitions`);
      const hit = (t.transitions || []).find((x) => x.to.name.toLowerCase() === op.to.toLowerCase());
      if (!hit) throw new Error(`no transition to ${op.to}: ${(t.transitions || []).map((x) => x.to.name).join(', ')}`);
      await call(op.as, 'POST', route`/rest/api/3/issue/${k(op.issue)}/transitions`, { transition: { id: hit.id } });
      return 'ok';
    }
    case 'link':
      await call(op.as, 'POST', route`/rest/api/3/issueLink`, {
        type: { name: 'Relates' }, inwardIssue: { key: k(op.from) }, outwardIssue: { key: k(op.to) },
      });
      return 'ok';
    case 'get': {
      const r = await actor(op.as).requestJira(assumeTrustedRoute(op.path), { headers: { Accept: 'application/json' } });
      return `${r.status} ${(await r.text()).slice(0, 400)}`;
    }
    default:
      throw new Error(`unknown op ${op.op}`);
  }
}

export async function seed(request) {
  const { ops = [], keys = {} } = JSON.parse(request.body || '{}');
  const results = [];
  for (const op of ops) {
    try {
      results.push({ op: op.op, alias: op.alias || op.issue, ok: true, out: await run(op, keys) });
    } catch (e) {
      results.push({ op: op.op, alias: op.alias || op.issue, ok: false, error: String(e.message || e) });
    }
  }
  return { statusCode: 200, headers: { 'Content-Type': ['application/json'] }, body: JSON.stringify({ keys, results }) };
}
