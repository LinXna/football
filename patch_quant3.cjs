const fs = require('fs');
const file = 'src/components/CanonicalMatchCenter.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
/                    <span className="text-xs text-slate-400 font-mono flex items-center gap-1\.5">\n                      <Zap className="w-3\.5 h-3\.5 text-amber-400" \/>\n                      模型置信度: <strong className="text-emerald-400">\{quant\.confidence_score\}分<\/strong>\n                      \{quant\.positive_ev_signals\.length > 0 \? \(\n                        <span className="px-1\.5 py-0\.5 rounded text-\[10px\] font-bold bg-emerald-500\/20 text-emerald-300 border border-emerald-500\/40">\n                          \{quant\.positive_ev_signals\.length\}项\+EV\n                        <\/span>\n                      \) : \(\n                        <span className="px-1\.5 py-0\.5 rounded text-\[10px\] font-bold bg-slate-700\/40 text-slate-400">\n                          暂无\+EV\n                        <\/span>\n                      \)\}\n                    <\/span>/g,
`                    <span className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      模型置信度: <strong className="text-emerald-400">{quant ? quant.confidence_score : 'N/A'}分</strong>
                      {quant && quant.positive_ev_signals && quant.positive_ev_signals.length > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          {quant.positive_ev_signals.length}项+EV
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700/40 text-slate-400">
                          {quant ? '暂无+EV' : '阻断'}
                        </span>
                      )}
                    </span>`);

fs.writeFileSync(file, code);
