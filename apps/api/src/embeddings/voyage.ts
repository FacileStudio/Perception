import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { getEffectiveSetting } from '../db/settings';

const VOYAGE_API = 'https://api.voyageai.com/v1';

async function callEmbeddings(input: string[], inputType: 'document' | 'query', workspaceId: string = ''): Promise<number[][]> {
  const [apiKey, model, dimensionsStr] = await Promise.all([
    getEffectiveSetting('voyage_api_key', workspaceId),
    getEffectiveSetting('embedding_model', workspaceId),
    getEffectiveSetting('embedding_dimensions', workspaceId),
  ]);

  const dimensions = parseInt(dimensionsStr, 10) || 1024;

  const res = await fetch(`${VOYAGE_API}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input,
      input_type: inputType,
      output_dimension: dimensions,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Voyage API error ${res.status}: ${body}`);
  }

  const json = await res.json() as { data: Array<{ embedding: number[] }>; usage?: { total_tokens: number } };

  if (json.usage?.total_tokens) {
    db.execute({
      sql: `INSERT INTO token_usage (id, kind, model, session_id, input_tokens, output_tokens, occurred_at) VALUES (?, 'embedding', ?, NULL, ?, 0, ?)`,
      args: [randomUUID(), model, json.usage.total_tokens, new Date().toISOString()],
    }).catch(() => {});
  }

  return json.data.map((d) => d.embedding);
}

export async function embedDocuments(texts: string[], workspaceId: string = ''): Promise<number[][]> {
  return callEmbeddings(texts, 'document', workspaceId);
}

export async function embedQuery(text: string, workspaceId: string = ''): Promise<number[]> {
  const results = await callEmbeddings([text], 'query', workspaceId);
  return results[0];
}
