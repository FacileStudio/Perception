import { createHash } from 'crypto';

const CHUNK_SIZE_CHARS = 1800;
const OVERLAP_CHARS = 180;
const SEPARATORS = ['\n\n', '\n', '. ', ' '];

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitBySeparator(text: string, separator: string): string[] {
  const parts = text.split(separator);
  return parts.map((p, i) => i < parts.length - 1 ? p + separator : p).filter(p => p.length > 0);
}

function recursiveSplit(text: string, separatorIdx: number): string[] {
  if (text.length <= CHUNK_SIZE_CHARS) return [text];
  if (separatorIdx >= SEPARATORS.length) {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE_CHARS - OVERLAP_CHARS) {
      chunks.push(text.slice(i, i + CHUNK_SIZE_CHARS));
    }
    return chunks;
  }

  const parts = splitBySeparator(text, SEPARATORS[separatorIdx]);
  const chunks: string[] = [];
  let current = '';

  for (const part of parts) {
    if (current.length + part.length > CHUNK_SIZE_CHARS && current.length > 0) {
      chunks.push(current.trim());
      const overlapStart = Math.max(0, current.length - OVERLAP_CHARS);
      current = current.slice(overlapStart) + part;
    } else {
      current += part;
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim());

  const result: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length > CHUNK_SIZE_CHARS) {
      result.push(...recursiveSplit(chunk, separatorIdx + 1));
    } else {
      result.push(chunk);
    }
  }
  return result;
}

export function chunkText(text: string): Array<{ content: string; tokenCount: number; chunkIndex: number }> {
  const raw = recursiveSplit(text.trim(), 0);
  return raw.map((content, i) => ({
    content,
    tokenCount: estimateTokens(content),
    chunkIndex: i,
  }));
}

export function hashChunkInput(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
