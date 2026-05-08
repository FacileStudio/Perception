import { config } from '../config';

const VOYAGE_API = 'https://api.voyageai.com/v1';

async function callEmbeddings(input: string[], inputType: 'document' | 'query'): Promise<number[][]> {
  const res = await fetch(`${VOYAGE_API}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.voyageApiKey}`,
    },
    body: JSON.stringify({
      model: config.embeddingModel,
      input,
      input_type: inputType,
      output_dimension: config.embeddingDimensions,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Voyage API error ${res.status}: ${body}`);
  }

  const json = await res.json() as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  return callEmbeddings(texts, 'document');
}

export async function embedQuery(text: string): Promise<number[]> {
  const results = await callEmbeddings([text], 'query');
  return results[0];
}
