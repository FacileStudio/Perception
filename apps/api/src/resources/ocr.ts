export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  try {
    // @ts-ignore — optional dependency, soft-fail if not installed
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    const {
      data: { text },
    } = await worker.recognize(buffer);
    await worker.terminate();
    return text.trim();
  } catch {
    return '';
  }
}
