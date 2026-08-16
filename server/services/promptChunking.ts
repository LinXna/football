export function chunkPromptItems<T>(items: T[], maxItems: number, maxSerializedChars: number): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let currentChars = 0;

  for (const item of items) {
    const itemChars = JSON.stringify(item).length;
    if (current.length > 0 && (current.length >= maxItems || currentChars + itemChars > maxSerializedChars)) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += itemChars;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
