const fs = require('fs');
const content = fs.readFileSync('src/components/MachineQuantEvaluationPanel.tsx', 'utf-8');
const newContent = content.replace(
  '去抽水: {quant.devig.h2h_devig?.devig_method ?? "Shin / Mult"}',
  '去抽水: {quant.devig.h2h_devig?.devig_method ?? "未开盘(N/A)"}'
);
fs.writeFileSync('src/components/MachineQuantEvaluationPanel.tsx', newContent);
