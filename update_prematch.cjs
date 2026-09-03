const fs = require('fs');
const content = fs.readFileSync('refactor/03_quant_engine/prematchPriorEngine.ts', 'utf-8');
const newContent = content
  .replace('const homeAttackForm = Math.max(0.70, Math.min(1.35, homeFormAnalytics.weighted_scored_per_game / 1.30));', 'const homeAttackForm = homeFormAnalytics.sample_count > 0 ? Math.max(0.70, Math.min(1.35, homeFormAnalytics.weighted_scored_per_game / 1.30)) : 1.0;')
  .replace('const homeDefenseForm = Math.max(0.70, Math.min(1.35, 1.30 / Math.max(0.40, homeFormAnalytics.weighted_conceded_per_game)));', 'const homeDefenseForm = homeFormAnalytics.sample_count > 0 ? Math.max(0.70, Math.min(1.35, 1.30 / Math.max(0.40, homeFormAnalytics.weighted_conceded_per_game))) : 1.0;')
  .replace('const awayAttackForm = Math.max(0.70, Math.min(1.35, awayFormAnalytics.weighted_scored_per_game / 1.30));', 'const awayAttackForm = awayFormAnalytics.sample_count > 0 ? Math.max(0.70, Math.min(1.35, awayFormAnalytics.weighted_scored_per_game / 1.30)) : 1.0;')
  .replace('const awayDefenseForm = Math.max(0.70, Math.min(1.35, 1.30 / Math.max(0.40, awayFormAnalytics.weighted_conceded_per_game)));', 'const awayDefenseForm = awayFormAnalytics.sample_count > 0 ? Math.max(0.70, Math.min(1.35, 1.30 / Math.max(0.40, awayFormAnalytics.weighted_conceded_per_game))) : 1.0;');
fs.writeFileSync('refactor/03_quant_engine/prematchPriorEngine.ts', newContent);
