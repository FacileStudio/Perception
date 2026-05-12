export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const { getDocumentProxy, extractText: pdfExtract } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await pdfExtract(pdf, { mergePages: true });
    return text;
  }

  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return buffer.toString('utf-8');
  }

  if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp') {
    const { extractTextFromImage } = await import('./ocr');
    return extractTextFromImage(buffer);
  }

  throw new Error(`Unsupported MIME type: ${mimeType}`);
}
