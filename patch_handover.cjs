const fs = require('fs');
const file = 'refactor/HANDOVER_AND_PROGRESS.md';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(/- \*\*状态 \(Status\)\*\*: `IN_PROGRESS`/g, '- **状态 (Status)**: `DONE`');
fs.writeFileSync(file, code);
