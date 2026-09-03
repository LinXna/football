const fs = require('fs');
const file = 'src/components/CanonicalMatchCenter.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/const quant = calculateQuantitativeFeatures\(m\);\n\s*const quantDecision = getQuantScreeningDecision\(quant\);/, `let quant: any = null;
            let quantDecision: any = null;
            let quantError: string | null = null;
            try {
              quant = calculateQuantitativeFeatures(m);
              quantDecision = getQuantScreeningDecision(quant);
            } catch (err: any) {
              quantError = err.message || String(err);
            }`);

code = code.replace(
  /\{quant\.positive_ev_signals\.length > 0 && \(/g, 
  `{quant && quant.positive_ev_signals.length > 0 && (`
);

code = code.replace(
  /\{ id: "quant", label: `⚡ 03 机器量化评估与最优投注 \(\$\{quant\.positive_ev_signals\.length > 0 \? `\$\{quant\.positive_ev_signals\.length\}项\+EV` : "已评估"\}\)`, icon: Zap \},/g,
  `{ id: "quant", label: \`⚡ 03 机器量化评估与最优投注 (\${quant ? (quant.positive_ev_signals.length > 0 ? \`\${quant.positive_ev_signals.length}项+EV\` : "已评估") : "评估阻断"})\`, icon: Zap },`
);

code = code.replace(
  /\{\(activeTabByMatch\[m\.canonical_id\] \|\| "quant"\) === "quant" && \(\n\s*<MachineQuantEvaluationPanel match=\{m\} quant=\{quant\} \/>\n\s*\)\}/,
  `{(activeTabByMatch[m.canonical_id] || "quant") === "quant" && (
                      quant ? <MachineQuantEvaluationPanel match={m} quant={quant} /> : <div className="p-4 text-rose-500 bg-rose-500/10 rounded-lg border border-rose-500/20 font-mono text-sm">{quantError}</div>
                    )}`
);

code = code.replace(
  /className=\{`inline-flex items-center gap-1\.5 px-2\.5 py-0\.5 rounded-full text-xs font-semibold border transition-all shadow-2xs \$\{quantDecision\.bgClass\} \$\{quantDecision\.colorClass\} \$\{quantDecision\.borderClass\} hover:opacity-90`\}/,
  `className={\`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all shadow-2xs \${quantDecision?.bgClass || 'bg-slate-800'} \${quantDecision?.colorClass || 'text-slate-400'} \${quantDecision?.borderClass || 'border-slate-700'} hover:opacity-90\`}`
);

code = code.replace(
  /<span>\{quantDecision\.badge\}<\/span>\n\s*<span className="font-mono text-\[11px\] opacity-80">\n\s*\(BDI: \{quant\.battlefield_dominance_index > 0 \? `\+\$\{quant\.battlefield_dominance_index\.toFixed\(0\)\}` : quant\.battlefield_dominance_index\.toFixed\(0\)\}\)\n\s*<\/span>/,
  `<span>{quantDecision ? quantDecision.badge : '无法评估'}</span>
                      <span className="font-mono text-[11px] opacity-80">
                        (BDI: {quant ? (quant.battlefield_dominance_index > 0 ? \`+\${quant.battlefield_dominance_index.toFixed(0)}\` : quant.battlefield_dominance_index.toFixed(0)) : 'N/A'})
                      </span>`
);

fs.writeFileSync(file, code);
