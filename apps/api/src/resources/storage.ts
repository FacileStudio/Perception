import { join } from 'node:path';
import { mkdir, writeFile, readFile, unlink, stat } from 'node:fs/promises';
import { config } from '../config';

const uploadsDir = join(config.dataDir, 'uploads');

let dirReady = false;

async function ensureDir(): Promise<void> {
  if (dirReady) return;
  await mkdir(uploadsDir, { recursive: true });
  dirReady = true;
}

function filePath(id: string, ext: string): string {
  return join(uploadsDir, `${id}${ext}`);
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'text/csv': '.csv',
    'application/json': '.json',
  };
  return map[mime] ?? '.bin';
}

export async function saveUpload(id: string, buffer: Buffer, mime: string): Promise<string> {
  await ensureDir();
  const ext = extFromMime(mime);
  const path = filePath(id, ext);
  await writeFile(path, buffer);
  return path;
}

export async function readUpload(path: string): Promise<Buffer> {
  return readFile(path);
}

export async function removeUpload(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export async function uploadExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
