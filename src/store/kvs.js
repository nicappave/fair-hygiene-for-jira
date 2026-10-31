// Forge KVS persistence: per-project settings, Claude's verdicts and the
// lead's overrides. Verdicts are keyed by a hash of the review item id, which
// already hashes the evidence, so an edited note is judged afresh.

import { kvs } from '@forge/kvs';
import { fnv1a } from '../core/scorer.js';

const safe = (s) => String(s).replace(/[^a-zA-Z0-9:._#-]/g, '_');
const itemKey = (prefix, projectKey, id) => `${prefix}:${safe(projectKey)}:${fnv1a(id)}${fnv1a(`${id}#`)}`;

export const forgeStore = {
  async getConfig(projectKey) {
    return (await kvs.get(`config:${safe(projectKey)}`)) || {};
  },
  async setConfig(projectKey, config) {
    await kvs.set(`config:${safe(projectKey)}`, config);
  },
  async getVerdicts(projectKey, ids) {
    const out = {};
    await Promise.all(ids.map(async (id) => {
      const [claude, lead] = await Promise.all([
        kvs.get(itemKey('verdict', projectKey, id)),
        kvs.get(itemKey('override', projectKey, id)),
      ]);
      if (lead) out[id] = { ...lead, source: 'lead', claude: claude || null };
      else if (claude) out[id] = claude;
    }));
    return out;
  },
  async putVerdict(projectKey, id, verdict) {
    await kvs.set(itemKey('verdict', projectKey, id), verdict);
  },
  async putOverride(projectKey, id, verdict) {
    await kvs.set(itemKey('override', projectKey, id), verdict);
  },
  async clearOverride(projectKey, id) {
    await kvs.delete(itemKey('override', projectKey, id));
  },
  // The evidence Claude reads, saved when the report is built so a judging
  // call does not have to re-read Jira. Kept under 24 hours, as a cache.
  async putContext(projectKey, id, item) {
    await kvs.set(itemKey('context', projectKey, id), item, { ttl: { value: 23, unit: 'HOURS' } });
  },
  async getContext(projectKey, id) {
    return kvs.get(itemKey('context', projectKey, id));
  },
};
