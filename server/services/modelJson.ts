/** Parse JSON returned by a model that may include Markdown fences or a trailing comma. */
export function parseModelJson(text: string): any {
  const cleaned = String(text || '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/^\uFEFF/, '')
    .trim();
  const attempts = [cleaned];
  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) attempts.push(cleaned.slice(objectStart, objectEnd + 1));
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      // Continue with the next normalized representation.
    }
  }
  throw new Error('invalid_model_json');
}
