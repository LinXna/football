const fs = require('fs');
const file = 'refactor/03_quant_engine/contextEngine.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/if \(ftHome === undefined \|\| ftAway === undefined\) continue;/g, `if (ftHome === undefined || ftAway === undefined) {
        return Object.freeze({
          match_id: String(item.match_id || ''),
          match_date: dateStr,
          days_ago: daysAgo,
          time_decay_weight: 0,
          venue_homomorphism_weight: 0,
          competition_importance_weight: 0,
          final_composite_weight: 0,
          is_valid_time_window: false,
          scored_full: 0,
          conceded_full: 0,
          scored_half: 0,
          conceded_half: 0,
          scored_second_half: 0,
          conceded_second_half: 0,
          is_clean_sheet: false,
          is_failed_to_score: false,
          handicap_result: 'UNKNOWN' as 'UNKNOWN',
          goals_trend_result: 'UNKNOWN' as 'UNKNOWN'
        });
      }`);

fs.writeFileSync(file, code);
