const fs = require('fs');
const file = 'src/components/CanonicalMatchCenter.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
/            \/\/ Layer 03: 确定性量化评估与博弈决策计算\n            const quant = calculateQuantitativeFeatures\(m\);\n            const quantDecision = getQuantScreeningDecision\(quant\);/g,
`            // Layer 03: 确定性量化评估与博弈决策计算
            let quant: any = null;
            let quantDecision: any = null;
            let quantError: string | null = null;
            try {
              quant = calculateQuantitativeFeatures(m);
              quantDecision = getQuantScreeningDecision(quant);
            } catch (err: any) {
              quantError = err.message || String(err);
            }`);

fs.writeFileSync(file, code);
