const fs = require('fs');
const file = 'src/components/CanonicalMatchCenter.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
/                \{\/\* 机器量化评估与下注决策矩阵 \(全场核心玩法常驻面板\) \*\/\}\n                <div className="pt-2">\n                  <QuantBettingDecisionMatrix match=\{m\} quant=\{quant\} showHeader=\{false\} \/>\n                <\/div>/g,
`                {/* 机器量化评估与下注决策矩阵 (全场核心玩法常驻面板) */}
                <div className="pt-2">
                  {!quantError && quant && <QuantBettingDecisionMatrix match={m} quant={quant} showHeader={false} />}
                </div>`);

fs.writeFileSync(file, code);
