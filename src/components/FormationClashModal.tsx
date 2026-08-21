import React, { useState } from 'react';
import {
  FormationType,
  FormationClashResult,
  FORMATION_ENCYCLOPEDIA,
  evaluateFormationClash,
  normalizeFormationCode
} from '../lib/formationTacticalEngine';
import { 
  Shield, 
  Swords, 
  ChevronRight, 
  Sparkles, 
  HelpCircle, 
  ArrowRightLeft, 
  CheckCircle2, 
  AlertTriangle,
  X,
  Layers,
  Flame,
  Activity,
  Award
} from 'lucide-react';

interface FormationClashModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialHomeFormation?: string;
  initialAwayFormation?: string;
  homeTeamName?: string;
  awayTeamName?: string;
}

export const FormationClashModal: React.FC<FormationClashModalProps> = ({
  isOpen,
  onClose,
  initialHomeFormation = '4-3-3',
  initialAwayFormation = '4-4-2',
  homeTeamName = '主队',
  awayTeamName = '客队'
}) => {
  const [homeFormation, setHomeFormation] = useState<FormationType>(normalizeFormationCode(initialHomeFormation));
  const [awayFormation, setAwayFormation] = useState<FormationType>(normalizeFormationCode(initialAwayFormation));
  const [activeTab, setActiveTab] = useState<'clash' | 'encyclopedia'>('clash');
  const [selectedProfileCode, setSelectedProfileCode] = useState<FormationType>('4-3-3');

  if (!isOpen) return null;

  const clashResult: FormationClashResult = evaluateFormationClash(homeFormation, awayFormation);
  const homeProf = FORMATION_ENCYCLOPEDIA[homeFormation];
  const awayProf = FORMATION_ENCYCLOPEDIA[awayFormation];
  const selectedProf = FORMATION_ENCYCLOPEDIA[selectedProfileCode];

  const allFormationKeys = Object.keys(FORMATION_ENCYCLOPEDIA) as FormationType[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 font-sans">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Swords className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">
                  足球阵型战术克制与空间博弈精算
                </h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Tactical Clash v2.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                深入拆解中场绞杀、边路宽度、肋部半空间攻防与盘口 (+EV) 导向
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switch */}
            <div className="flex p-1 bg-slate-800 rounded-lg border border-slate-700">
              <button
                onClick={() => setActiveTab('clash')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'clash'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                对阵克制演算
              </button>
              <button
                onClick={() => setActiveTab('encyclopedia')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'encyclopedia'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                阵型战术百科 ({allFormationKeys.length})
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'clash' ? (
            <>
              {/* Formation Selector Bar */}
              <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center p-4 bg-slate-800/60 rounded-xl border border-slate-700/60">
                {/* Home Formation Picker */}
                <div className="md:col-span-5 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" /> 主队阵型 ({homeTeamName})
                    </span>
                    <span className="text-slate-400">{homeProf.category}</span>
                  </div>
                  <select
                    value={homeFormation}
                    onChange={(e) => setHomeFormation(e.target.value as FormationType)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 font-medium cursor-pointer"
                  >
                    {allFormationKeys.map((k) => (
                      <option key={`home-${k}`} value={k}>
                        {FORMATION_ENCYCLOPEDIA[k].name_zh}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 line-clamp-1">
                    {homeProf.core_philosophy_zh}
                  </p>
                </div>

                {/* VS Indicator */}
                <div className="md:col-span-1 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-black text-amber-400 border border-slate-600 shadow-inner">
                    VS
                  </div>
                </div>

                {/* Away Formation Picker */}
                <div className="md:col-span-5 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-cyan-400 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" /> 客队阵型 ({awayTeamName})
                    </span>
                    <span className="text-slate-400">{awayProf.category}</span>
                  </div>
                  <select
                    value={awayFormation}
                    onChange={(e) => setAwayFormation(e.target.value as FormationType)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 font-medium cursor-pointer"
                  >
                    {allFormationKeys.map((k) => (
                      <option key={`away-${k}`} value={k}>
                        {FORMATION_ENCYCLOPEDIA[k].name_zh}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 line-clamp-1">
                    {awayProf.core_philosophy_zh}
                  </p>
                </div>
              </div>

              {/* Clash Verdict Banner */}
              <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                clashResult.clash_verdict === 'ADVANTAGE_HOME'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : clashResult.clash_verdict === 'ADVANTAGE_AWAY'
                  ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
                  : clashResult.clash_verdict === 'OPEN_GOAL_FEST'
                  ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                  : clashResult.clash_verdict === 'DEFENSIVE_ATTRITION'
                  ? 'bg-purple-950/40 border-purple-500/40 text-purple-200'
                  : 'bg-slate-800/80 border-slate-700 text-slate-200'
              }`}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs font-bold rounded bg-slate-900/60 uppercase tracking-wider border border-white/10">
                      战术博弈裁定
                    </span>
                    <h3 className="text-base font-bold">
                      {clashResult.clash_verdict_zh}
                    </h3>
                  </div>
                  <p className="text-xs opacity-90">
                    {clashResult.expected_pace_zh}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs opacity-75">克制指数偏向</div>
                    <div className="text-lg font-black tracking-tight">
                      {clashResult.formation_clash_score > 0
                        ? `+${clashResult.formation_clash_score} (主优)`
                        : clashResult.formation_clash_score < 0
                        ? `${clashResult.formation_clash_score} (客优)`
                        : '0 (平局势均)'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tactical Battlegrounds Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Midfield Battle */}
                <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/60 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-emerald-400" /> 中场中圈绞杀与人数博弈
                    </span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                      clashResult.midfield_battle.winner === 'HOME'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : clashResult.midfield_battle.winner === 'AWAY'
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'bg-slate-700 text-slate-300'
                    }`}>
                      {clashResult.midfield_battle.winner === 'HOME' ? '主队占优' : clashResult.midfield_battle.winner === 'AWAY' ? '客队占优' : '均势拉锯'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>主队 {clashResult.midfield_battle.home_midfielders} 中场</span>
                    <span>vs</span>
                    <span>客队 {clashResult.midfield_battle.away_midfielders} 中场</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 p-2.5 rounded-lg border border-slate-700/40">
                    {clashResult.midfield_battle.analysis_zh}
                  </p>
                </div>

                {/* 2. Flank Battle */}
                <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/60 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-cyan-400" /> 边路走廊与下底传中博弈
                    </span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                      clashResult.flank_battle.winner === 'HOME'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : clashResult.flank_battle.winner === 'AWAY'
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'bg-slate-700 text-slate-300'
                    }`}>
                      {clashResult.flank_battle.winner === 'HOME' ? '主队宽度占优' : clashResult.flank_battle.winner === 'AWAY' ? '客队宽度占优' : '两翼对峙'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>主队边宽评分 {homeProf.tactical_dna.flank_width_rating}/10</span>
                    <span>vs</span>
                    <span>客队边宽评分 {awayProf.tactical_dna.flank_width_rating}/10</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 p-2.5 rounded-lg border border-slate-700/40">
                    {clashResult.flank_battle.analysis_zh}
                  </p>
                </div>

                {/* 3. Pace & Goals Dynamics */}
                <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/60 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-amber-400" /> 攻防形态与禁区纵深博弈
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      {clashResult.expected_pace_and_goals}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 p-2.5 rounded-lg border border-slate-700/40 space-y-1">
                    <div>
                      <span className="text-emerald-400 font-medium">主攻vs客防:</span> {clashResult.box_and_backline_battle.home_attack_vs_away_defense_zh}
                    </div>
                    <div>
                      <span className="text-cyan-400 font-medium">客攻vs主防:</span> {clashResult.box_and_backline_battle.away_attack_vs_home_defense_zh}
                    </div>
                  </div>
                </div>
              </div>

              {/* Exploit Points & Vulnerabilities */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-950/20 border border-emerald-800/40 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> 主队进攻破局点 (对客队弱点打击)
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {clashResult.home_exploit_points_zh.map((pt, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-emerald-400 mt-0.5">•</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                    <li className="flex items-start gap-1.5 text-slate-400">
                      <span>• 客队防守潜在漏洞: {awayProf.key_weaknesses_zh[1] || '阵型转换慢'}</span>
                    </li>
                  </ul>
                </div>

                <div className="p-4 bg-cyan-950/20 border border-cyan-800/40 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> 客队反制破局点 (对主队弱点打击)
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {clashResult.away_exploit_points_zh.map((pt, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-cyan-400 mt-0.5">•</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                    <li className="flex items-start gap-1.5 text-slate-400">
                      <span>• 主队防守潜在漏洞: {homeProf.key_weaknesses_zh[1] || '边后卫身后开阔地'}</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Betting Strategy & Value Guidance */}
              <div className="p-4 bg-gradient-to-r from-slate-900 via-slate-800/90 to-slate-900 border border-amber-500/30 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-amber-300 flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-400" /> 阵型克制量化博弈与投注 (+EV) 策略导向
                  </h4>
                  <div className="flex items-center gap-1.5">
                    {clashResult.betting_implications.recommended_play_focus.map((tag, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-xs font-bold">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/60 space-y-1">
                    <div className="font-semibold text-slate-200">1. 让球与胜负盘口导向</div>
                    <p className="text-slate-400 leading-relaxed">
                      {clashResult.betting_implications.handicap_angle_zh}
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/60 space-y-1">
                    <div className="font-semibold text-slate-200">2. 全场/半场大小球节奏</div>
                    <p className="text-slate-400 leading-relaxed">
                      {clashResult.betting_implications.total_goals_angle_zh}
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/60 space-y-1">
                    <div className="font-semibold text-slate-200">3. 角球与禁区挤压动能</div>
                    <p className="text-slate-400 leading-relaxed">
                      {clashResult.betting_implications.corner_threat_angle_zh}
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Tab: Formation Encyclopedia Browser */
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Left Column: Formation List */}
              <div className="md:col-span-4 space-y-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  主流阵型库 ({allFormationKeys.length})
                </div>
                <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
                  {allFormationKeys.map((code) => {
                    const prof = FORMATION_ENCYCLOPEDIA[code];
                    const isSelected = selectedProfileCode === code;
                    return (
                      <button
                        key={code}
                        onClick={() => setSelectedProfileCode(code)}
                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-200 shadow-md'
                            : 'bg-slate-800/40 border-slate-700/50 text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-sm">{prof.code}</div>
                          <div className="text-xs opacity-75 line-clamp-1">{prof.name_zh}</div>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900/60 border border-slate-700 text-slate-400">
                          {prof.category}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Selected Formation Full Profile */}
              <div className="md:col-span-8 space-y-4 bg-slate-800/40 p-5 rounded-2xl border border-slate-700/60">
                <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                  <div>
                    <h3 className="text-lg font-black text-emerald-400">
                      {selectedProf.name_zh}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {selectedProf.core_philosophy_zh}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold">
                    {selectedProf.category}
                  </span>
                </div>

                {/* Tactical DNA Indicators */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/50 p-3 rounded-xl border border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400">边路宽度:</span>
                    <span className="font-bold text-slate-200 ml-1.5">{selectedProf.tactical_dna.flank_width_rating}/10</span>
                  </div>
                  <div>
                    <span className="text-slate-400">中路密度:</span>
                    <span className="font-bold text-slate-200 ml-1.5">{selectedProf.tactical_dna.central_density_rating}/10</span>
                  </div>
                  <div>
                    <span className="text-slate-400">高位压迫:</span>
                    <span className="font-bold text-slate-200 ml-1.5">{selectedProf.tactical_dna.high_press_intensity}/10</span>
                  </div>
                  <div>
                    <span className="text-slate-400">低位硬度:</span>
                    <span className="font-bold text-slate-200 ml-1.5">{selectedProf.tactical_dna.low_block_resilience}/10</span>
                  </div>
                </div>

                {/* Attacking & Defensive Shapes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-700/60 space-y-1">
                    <span className="font-bold text-amber-400">⚡ 进攻形态演变:</span>
                    <p className="text-slate-300 leading-relaxed">{selectedProf.attacking_shape_zh}</p>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-700/60 space-y-1">
                    <span className="font-bold text-cyan-400">🛡️ 防守形态落位:</span>
                    <p className="text-slate-300 leading-relaxed">{selectedProf.defensive_shape_zh}</p>
                  </div>
                </div>

                {/* Key Strengths & Weaknesses */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-emerald-950/20 rounded-xl border border-emerald-800/40 space-y-2">
                    <span className="font-bold text-emerald-300">✅ 核心优势:</span>
                    <ul className="space-y-1 text-slate-300">
                      {selectedProf.key_strengths_zh.map((s, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span className="text-emerald-400">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-3 bg-rose-950/20 rounded-xl border border-rose-800/40 space-y-2">
                    <span className="font-bold text-rose-300">⚠️ 固有弱点与空当:</span>
                    <ul className="space-y-1 text-slate-300">
                      {selectedProf.key_weaknesses_zh.map((w, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span className="text-rose-400">•</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Optimal Counter Strategy */}
                <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-700/80 space-y-2 text-xs">
                  <span className="font-bold text-slate-200">🎯 最佳克制应对策略:</span>
                  <ul className="space-y-1 text-slate-300">
                    {selectedProf.optimal_counters_zh.map((c, idx) => (
                      <li key={idx} className="flex items-start gap-1">
                        <span className="text-amber-400 font-bold">»</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400">
          <div>
            阵型相克模型已融合至 AI Prompt 及 5 大核心盘口量化精算引擎
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors font-medium border border-slate-700"
          >
            关闭
          </button>
        </div>

      </div>
    </div>
  );
};
