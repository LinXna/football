const fs = require('fs');
const file = 'src/components/CanonicalMatchCenter.tsx';
let code = fs.readFileSync(file, 'utf8');

const targetRegex = /模型置信度: <strong className="text-emerald-400">\{quant\.confidence_score\}分<\/strong>[\s\S]*?<span className="text-slate-500 text-\[10px\]">无\+EV<\/span>\s*\)\}/;

const replacementStr = `模型置信度: <strong className="text-emerald-400">{quant ? quant.confidence_score : 'N/A'}分</strong>
                      {quant && quant.positive_ev_signals && quant.positive_ev_signals.length > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          {quant.positive_ev_signals.length}项+EV
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">{quant ? '无+EV' : '阻断'}</span>
                      )}`;

code = code.replace(targetRegex, replacementStr);
fs.writeFileSync(file, code);
