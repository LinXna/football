import { generateRefactoredPrompt } from '../refactor/04_ai_evaluator/promptExporter.js';
import * as fs from 'fs';
import { CanonicalMatch } from '../refactor/02_canonical_model/types.js';

const sampleData = JSON.parse(fs.readFileSync('refactor/samples/02_canonical_model/canonical_match_sample.json', 'utf8'));
const match = sampleData.canonical_match;
const res = generateRefactoredPrompt([match], 'live_eval');
console.log(res.finalPrompt);
