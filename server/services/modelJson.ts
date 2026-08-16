function repairJson(str: string): string {
  let s = str
    .replace(/^\s*```(?:json)?\s*/gi, '')
    .replace(/\s*```\s*$/gi, '')
    .replace(/```/g, '')
    .replace(/^\uFEFF/, '')
    .trim();

  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');

  // Insert missing commas:
  // 1) between string/number/boolean/null/quote and next key:
  s = s.replace(/(["\d]|true|false|null)\s*\n\s*(")/g, '$1,\n$2');
  // 2) between } or ] and next { or " or [
  s = s.replace(/([}\]])\s*\n\s*([{"\[\d])/g, '$1,\n$2');

  // Fix any accidental double commas or trailing commas created
  s = s.replace(/,\s*,+/g, ',');
  s = s.replace(/,\s*([}\]])/g, '$1');

  return s;
}

/** Parse JSON returned by a model that may include Markdown fences, missing commas, or trailing commas. */
export function parseModelJson(text: string): any {
  const raw = String(text || '').replace(/^\uFEFF/, '').trim();
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/gi, '')
    .replace(/\s*```\s*$/gi, '')
    .replace(/```/g, '')
    .trim();

  const attempts = [
    cleaned,
    repairJson(cleaned),
  ];

  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    const sliced = cleaned.slice(objectStart, objectEnd + 1);
    attempts.push(sliced);
    attempts.push(repairJson(sliced));
  }

  let lastError: any = null;
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
    } catch (err: any) {
      lastError = err;
    }
  }

  throw new Error(`invalid_model_json: ${lastError?.message || 'syntax error'}`);
}

