// Forge binding for the Jira client. The app reads as itself (asApp) so a
// lead sees the whole team's issues; scopes are read-only (see manifest.yml).

import api, { assumeTrustedRoute } from '@forge/api';

export function forgeJiraRequest() {
  return async (method, path, body) => {
    const res = await api.asApp().requestJira(assumeTrustedRoute(path), {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira ${method} ${path.split('?')[0]} -> ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
  };
}
