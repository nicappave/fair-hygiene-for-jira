// Same interface, in memory: used by the tests and the offline demo script.
export function memoryStore() {
  const data = new Map();
  return {
    data,
    async getConfig(p) { return data.get(`config:${p}`) || {}; },
    async setConfig(p, c) { data.set(`config:${p}`, c); },
    async getVerdicts(p, ids) {
      const out = {};
      for (const id of ids) {
        const lead = data.get(`override:${p}:${id}`);
        const claude = data.get(`verdict:${p}:${id}`);
        if (lead) out[id] = { ...lead, source: 'lead', claude: claude || null };
        else if (claude) out[id] = claude;
      }
      return out;
    },
    async putVerdict(p, id, v) { data.set(`verdict:${p}:${id}`, v); },
    async putOverride(p, id, v) { data.set(`override:${p}:${id}`, v); },
    async clearOverride(p, id) { data.delete(`override:${p}:${id}`); },
    async putContext(p, id, item) { data.set(`context:${p}:${id}`, item); },
    async getContext(p, id) { return data.get(`context:${p}:${id}`); },
  };
}
