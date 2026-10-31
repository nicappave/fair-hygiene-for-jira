// Forge entry points: the UI resolver and the two Rovo actions.

import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { forgeJiraRequest } from './jira/forge.js';
import { forgeStore } from './store/kvs.js';
import { forgeJudgeDeps } from './llm/forge.js';
import { mergeConfig } from './core/rules.js';
import {
  buildReport, slimReport, judgePending, overrideVerdict, reportForAgent,
} from './service.js';

// The project comes from where the page is rendered, never from the payload.
const projectOf = (context) => {
  const key = context && context.extension && context.extension.project && context.extension.project.key;
  if (!key) throw new Error('Open this page from a Jira project.');
  return key;
};

// The app reads Jira as itself, so every entry point first checks that the
// CALLING user holds the permission in that project: browsing to see a report,
// administering to change settings or overrule a verdict.
async function assertPermission(projectKey, permission) {
  const res = await api.asUser().requestJira(
    route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=${permission}`,
    { headers: { Accept: 'application/json' } },
  );
  const body = res.ok ? await res.json() : {};
  const p = body.permissions && body.permissions[permission];
  if (!p || !p.havePermission) {
    throw new Error(permission === 'ADMINISTER_PROJECTS'
      ? 'Only a project admin can change settings or verdicts.'
      : `You do not have access to project ${projectKey}.`);
  }
}

const resolver = new Resolver();

resolver.define('getReport', async ({ payload, context }) => {
  const projectKey = projectOf(context);
  await assertPermission(projectKey, 'BROWSE_PROJECTS');
  const report = await buildReport({
    request: forgeJiraRequest(), store: forgeStore, projectKey, weekStart: payload.weekStart,
  });
  return slimReport(report);
});

resolver.define('judge', async ({ payload, context }) => {
  const projectKey = projectOf(context);
  await assertPermission(projectKey, 'BROWSE_PROJECTS');
  const config = mergeConfig(await forgeStore.getConfig(projectKey));
  const llm = await forgeJudgeDeps(config.modelPreference);
  // Small batches keep each call well inside the resolver time limit; the UI
  // sends the next batch when this one returns.
  return judgePending({ store: forgeStore, projectKey, ids: (payload.ids || []).slice(0, 4), llm });
});

resolver.define('override', async ({ payload, context }) => {
  const projectKey = projectOf(context);
  await assertPermission(projectKey, 'ADMINISTER_PROJECTS');
  return overrideVerdict({ store: forgeStore, projectKey, ...payload });
});

resolver.define('getConfig', async ({ context }) => mergeConfig(await forgeStore.getConfig(projectOf(context))));

resolver.define('setConfig', async ({ payload, context }) => {
  const projectKey = projectOf(context);
  await assertPermission(projectKey, 'ADMINISTER_PROJECTS');
  const config = mergeConfig(payload.config);
  await forgeStore.setConfig(projectKey, config);
  return config;
});

export const handler = resolver.getDefinitions();

// Rovo actions. Inputs arrive as top-level payload keys; Jira context (when
// the agent is used inside a project) fills in the project key.
const actionProject = (payload) => String(payload.projectKey
  || (payload.context && payload.context.jira && payload.context.jira.projectKey) || '').toUpperCase();

export async function getHygieneReport(payload) {
  const projectKey = actionProject(payload);
  if (!projectKey) return 'Which Jira project? Give me its key, for example DEMO.';
  await assertPermission(projectKey, 'BROWSE_PROJECTS');
  const report = await buildReport({
    request: forgeJiraRequest(), store: forgeStore, projectKey, weekStart: payload.weekStart,
  });
  return reportForAgent(report);
}

export async function explainPersonScore(payload) {
  const projectKey = actionProject(payload);
  if (!projectKey || !payload.person) return 'I need a project key and a person\'s name.';
  const report = await buildReport({
    request: forgeJiraRequest(), store: forgeStore, projectKey, weekStart: payload.weekStart,
  });
  const out = reportForAgent(report, payload.person);
  return out.people.length ? out : `Nobody matching "${payload.person}" closed or holds issues in ${projectKey} that period.`;
}
