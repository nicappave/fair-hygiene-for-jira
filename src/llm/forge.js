// Forge LLMs binding: Atlassian-hosted Claude, no external egress, so the app
// keeps its Runs on Atlassian eligibility.

import { chat, list } from '@forge/llm';
import { pickModel } from './judge.js';

let cachedModel = null;

export async function forgeJudgeDeps(preference) {
  if (!cachedModel) {
    const res = await list();
    cachedModel = pickModel(res.models, preference);
  }
  return { chat, model: cachedModel };
}
