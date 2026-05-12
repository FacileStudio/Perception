import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { getEffectiveSetting } from '../db/settings';
import type { CandidateQuestion } from './types';

const SYSTEM_PROMPT = `You are a forecast question quality reviewer. Evaluate whether the candidate question meets ALL four criteria:

1. UNAMBIGUOUS — The question has a single clear interpretation.
2. CLEAR RESOLUTION — The resolution criteria specify exactly how the outcome is determined.
3. TIME-BOUNDED — There is an explicit deadline by which the question resolves.
4. FALSIFIABLE — It is possible for the question to resolve as false/wrong.

Respond with JSON only: { "pass": boolean, "reason": string }`;

async function evaluateCandidate(
  candidate: CandidateQuestion,
  apiKey: string,
): Promise<boolean> {
  try {
    const anthropic = createAnthropic({ apiKey: apiKey ?? undefined });
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: SYSTEM_PROMPT,
      prompt: `Question: ${candidate.question}\nResolution criteria: ${candidate.resolution_criteria}\nResolves at: ${candidate.resolves_at}\nType: ${candidate.question_type}`,
      maxTokens: 200,
    });
    const parsed = JSON.parse(text);
    return !!parsed.pass;
  } catch {
    return true;
  }
}

export async function filterByQuality(candidates: CandidateQuestion[]): Promise<CandidateQuestion[]> {
  const apiKey = await getEffectiveSetting('anthropic_api_key');
  if (!apiKey) return candidates;

  const passed: CandidateQuestion[] = [];
  for (let i = 0; i < candidates.length; i += 5) {
    const batch = candidates.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map((c) => evaluateCandidate(c, apiKey)),
    );
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled' && result.value) {
        passed.push(batch[j]);
      } else if (result.status === 'rejected') {
        passed.push(batch[j]);
      }
    }
  }
  return passed;
}
