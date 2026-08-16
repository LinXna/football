export interface ParlayRequest {
  size: number;
  count: number;
}

export function buildValidParlayRequests(
  requests: Record<number, number>,
  selectedMatchCount: number,
): ParlayRequest[] {
  return Object.entries(requests)
    .map(([size, count]) => ({ size: Number(size), count: Number(count) }))
    .filter(({ size, count }) => (
      Number.isInteger(size)
      && size >= 2
      && size <= selectedMatchCount
      && Number.isInteger(count)
      && count > 0
    ));
}
