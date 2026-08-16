const gates = new Map<string, Promise<void>>();
const lastRequestAt = new Map<string, number>();

const wait = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

/** Serializes requests per key while allowing different Gemini keys to run independently. */
export async function waitForGeminiRateSlot(apiKey: string, minimumGapMs = 3500): Promise<void> {
  const previous = gates.get(apiKey) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  gates.set(apiKey, next);
  await previous;
  const remaining = minimumGapMs - (Date.now() - (lastRequestAt.get(apiKey) || 0));
  if (remaining > 0) await wait(remaining);
  lastRequestAt.set(apiKey, Date.now());
  release();
}
