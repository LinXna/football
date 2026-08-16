/** Dependency boundary for the batch live/prematch supplement transaction. */
export interface BatchSupplementDependencies {
  normalizeTeamName(name: string): string;
  calculateExactBeijingTime(item: any): string;
  normalizeMarketTypes(markets: any): any[];
}
