import fs from 'fs';
const file = 'refactor/01_data_ingestion/leisu/types.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  '  goals?: number | null;\n}',
  '  goals?: number | null;\n  competition_name?: string | null;\n  competition?: string | null;\n  handicap_trend?: { result?: string | null } | null;\n  goals_trend?: { result?: string | null } | null;\n}'
);
fs.writeFileSync(file, content);
