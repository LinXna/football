import * as fs from 'fs';
import * as path from 'path';

import { alignMatches, findBestLeisuMatch, DEFAULT_LEAGUE_ALIASES } from '../02_canonical_model/matchAligner.js';
import { assembleCanonicalMatch, extractAiEvaluationBrief } from '../02_canonical_model/canonicalMatchAssembler.js';
import { MatchStage, MatchAlignmentStatus } from '../02_canonical_model/enums.js';
import { calculateQuantitativeFeatures } from '../03_quant_engine/index.js';
import { QuantAlert } from '../03_quant_engine/types.js';
import { buildSystemPrompt } from './promptBuilder.js';

function safeReadJson(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  try { return JSON.parse(raw); } catch { 
    return JSON.parse(raw.replace(/[\u0000-\u001F\u007F-\u009F\uFFFD]/g, (ch) => { if (ch === '\n' || ch === '\r' || ch === '\t') return ' '; return ''; }).replace(/\\(?!["\\/bfnrtu])/g, ''));
  }
}

export function generateRefactoredPrompt(filterMatchNames?: string[]): { finalPrompt: string; matchCount: number } {
  const rootDir = process.cwd();
  let ybtyPath = path.join(rootDir, 'output', 'ybty_latest.json');
  let leisuPath = path.join(rootDir, 'output', 'leisu_latest.json');
  
  if (!fs.existsSync(ybtyPath)) {
    ybtyPath = path.join(rootDir, 'refactor', 'samples', '01_data_ingestion', 'ybty', 'ybty_live_extracted_sample.json');
  }
  if (!fs.existsSync(leisuPath)) {
    leisuPath = path.join(rootDir, 'refactor', 'samples', '01_data_ingestion', 'leisu', 'leisu_extracted_sample.json');
  }
  
  const ybtyJson = safeReadJson(ybtyPath);
  const leisuJson = safeReadJson(leisuPath);
  
  const liveMatches = (ybtyJson?.matches || []) as any[];
  const leisuMatches = (leisuJson?.matches || (Array.isArray(leisuJson) ? leisuJson : [leisuJson])) as any[];
  
  const validPayloads: any[] = [];
  
  for (const yMatchRaw of liveMatches) {
    const yMatch = yMatchRaw as any;
    if (filterMatchNames && filterMatchNames.length > 0) {
      if (!filterMatchNames.includes(yMatch.match)) {
        continue;
      }
    }

    const { best_match, decision } = findBestLeisuMatch(yMatch, leisuMatches as any[], {}, DEFAULT_LEAGUE_ALIASES);
    
    // 如果没有 decision (比如 leisu 列表为空)，我们需要自己造一个兜底 decision 以避免后续崩溃
    const alignment = decision || {
      status: MatchAlignmentStatus.UNMATCHED,
      confidence_score: 0,
      is_swapped: false,
      reasons: ["No Leisu candidates available"],
      matched_fields: [],
      home_team_match: false,
      away_team_match: false,
      league_match: false,
      league_match_score: 0,
      home_match_score: 0,
      away_match_score: 0,
      is_swapped_suspected: false,
      alignment_reason: "NO_CANDIDATE"
    };

    const canonicalMatch = assembleCanonicalMatch(yMatch, best_match, alignment);
    const quantFeatures = calculateQuantitativeFeatures(canonicalMatch);
    
    const isFatal = quantFeatures.risk_flags.includes(QuantAlert.L0_FATAL_DATA_MISSING);
    // 忽略致命缺失，仍然导出供大模型检查，或者这里可以选择过滤。目前与旧版兼容，全部扔给AI评估。
    const aiBrief = extractAiEvaluationBrief(canonicalMatch);
    validPayloads.push({
      ai_brief: aiBrief,
      quant_features: quantFeatures
    });
  }
  
  if (validPayloads.length === 0) {
    return { finalPrompt: "No valid matches found in ybty_latest.json.", matchCount: 0 };
  }
  
  const singleSystemPrompt = buildSystemPrompt();
  const batchSystemPrompt = singleSystemPrompt.replace(
    /You must return a valid JSON object matching the following structure EXACTLY:/,
    "You must return a valid JSON ARRAY of objects, matching the following structure EXACTLY for EACH match in the provided payload array:"
  ).replace(
    /DO NOT wrap the JSON in Markdown formatting blocks\. Output RAW JSON ONLY\./,
    "DO NOT wrap the JSON in Markdown formatting blocks. Output RAW JSON ARRAY ONLY. Return an array `[` ... `]` containing one object per evaluated match."
  );
  
  const finalPrompt = `========== SYSTEM INSTRUCTION ==========\n${batchSystemPrompt}\n\n========== USER PAYLOAD (BATCH OF ${validPayloads.length} MATCHES) ==========\n${JSON.stringify(validPayloads, null, 2)}`;
  
  return { finalPrompt, matchCount: validPayloads.length };
}
