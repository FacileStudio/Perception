import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { db } from '../db/client';
import { getEffectiveSetting } from '../db/settings';

type SessionContext = {
  sessionId: string;
  messages: Array<{ role: string; content: string; created_at: string }>;
  entityNames: string[];
};

async function loadSessionContext(sessionId: string, workspaceId: string = ''): Promise<SessionContext | null> {
  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const msgArgs: (string | number | null)[] = [sessionId];
  if (workspaceId) msgArgs.push(workspaceId);
  const messages = await db.execute({
    sql: `SELECT role, content, created_at FROM chat_messages
          WHERE session_id = ?${wsFilter} ORDER BY created_at ASC`,
    args: msgArgs,
  });

  if (messages.rows.length < 2) return null;

  const entityResult = await db.execute({
    sql: `SELECT DISTINCT e.canonical_name
          FROM chat_messages cm
          JOIN events ev ON cm.sources_json LIKE '%' || ev.id || '%'
          JOIN event_entities ee ON ee.event_id = ev.id
          JOIN entities e ON e.id = ee.entity_id
          WHERE cm.session_id = ?
          LIMIT 20`,
    args: [sessionId],
  });

  return {
    sessionId,
    messages: messages.rows.map((r) => ({
      role: r.role as string,
      content: r.content as string,
      created_at: r.created_at as string,
    })),
    entityNames: entityResult.rows.map((r) => r.canonical_name as string),
  };
}

function buildExtractionPrompt(ctx: SessionContext): string {
  const transcript = ctx.messages
    .map((m) => `[${m.role}]: ${m.content.slice(0, 500)}`)
    .join('\n\n');

  return `Extract 2-5 durable operational facts from this conversation session.

Entities mentioned: ${ctx.entityNames.join(', ') || '(none identified)'}

Conversation:
${transcript}

Rules:
- Each fact should be a single sentence capturing something worth remembering for future conversations.
- Focus on decisions made, patterns discovered, status changes, relationships clarified, or problems identified.
- Skip generic chit-chat, greetings, and restatements of what the system already knows from events.
- If nothing durable was discussed, output exactly: NONE

Output format (one fact per line, no bullets or numbers):
<fact>The durable fact here</fact>`;
}

export type ExtractedMemory = {
  summary: string;
  entityRefs: string[];
};

export async function extractMemoryEpisodes(sessionId: string, workspaceId: string = ''): Promise<ExtractedMemory[]> {
  const ctx = await loadSessionContext(sessionId, workspaceId);
  if (!ctx) return [];

  const apiKey = await getEffectiveSetting('anthropic_api_key');
  const anthropic = createAnthropic({ apiKey: apiKey ?? undefined });

  const { text } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: 'You are a memory extraction agent. Output only the requested format.',
    prompt: buildExtractionPrompt(ctx),
    maxTokens: 600,
  });

  if (text.trim() === 'NONE') return [];

  const facts = [...text.matchAll(/<fact>(.*?)<\/fact>/gs)]
    .map((m) => m[1].trim())
    .filter((f) => f.length > 10 && f.length < 500);

  if (facts.length === 0) return [];

  return facts.slice(0, 5).map((summary) => {
    const refs = ctx.entityNames.filter((name) =>
      summary.toLowerCase().includes(name.toLowerCase()),
    );
    return { summary, entityRefs: refs };
  });
}
