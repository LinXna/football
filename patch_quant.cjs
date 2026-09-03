const fs = require('fs');
const file = 'src/components/CanonicalMatchCenter.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
/                    \{\/\* TAB 0: ⚡ 03 机器量化评估与最优投注 \(Machine Quant Evaluation Panel\) \*\/\}\n                    \{\(activeTabByMatch\[m.canonical_id\] \|\| "quant"\) === "quant" && \(\n                      <MachineQuantEvaluationPanel match=\{m\} quant=\{quant\} \/>\n                    \)\}/g,
`                    {/* TAB 0: ⚡ 03 机器量化评估与最优投注 (Machine Quant Evaluation Panel) */}
                    {(activeTabByMatch[m.canonical_id] || "quant") === "quant" && (
                      quantError ? (
                        <div className="p-6 bg-red-900/20 border border-red-500/30 rounded-xl text-red-200">
                          <h4 className="font-semibold text-red-400 mb-2">模型计算被强行阻断</h4>
                          <p className="text-sm font-mono opacity-80">{quantError}</p>
                          <p className="text-xs opacity-60 mt-4">数据严重缺失导致无法评估，强行估算会引发严重偏差，故停止对该场比赛进行博弈分析。</p>
                        </div>
                      ) : (
                        <MachineQuantEvaluationPanel match={m} quant={quant} />
                      )
                    )}`);

fs.writeFileSync(file, code);
