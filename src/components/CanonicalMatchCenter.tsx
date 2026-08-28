import React, { useState, useEffect } from "react";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Layers,
  Search,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Database,
  X,
  Upload,
  FileJson,
  RotateCcw,
  Check,
  FileSpreadsheet,
  Trash2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Copy,
  Code,
  TrendingUp,
  BarChart2,
  Target,
  Trophy,
  Activity,
  Users,
  CheckCheck,
  UserCheck,
  AlertCircle,
  Eye,
  Shield,
  FileText,
  Info,
  Shuffle,
  ArrowUpDown,
  ArrowRightLeft,
} from "lucide-react";
import {
  CanonicalMatch,
  AiEvaluationBrief,
} from "../../refactor/02_canonical_model/types";
import { CleanMarketsGroup } from "../../refactor/01_data_ingestion/ybty/types";
import { RecentFormComparator } from "./RecentFormComparator";

function getMarketsSummary(mkts?: CleanMarketsGroup | null) {
  if (!mkts) return { count: 0, text: "0个玩法" };
  let count = 0;
  let items: string[] = [];
  if (mkts.full_h2h) {
    count++;
    items.push("全场独赢");
  }
  if (mkts.full_spread_main) {
    count += 1 + (mkts.full_spread_subs?.length || 0);
    items.push(`全场让球(${1 + (mkts.full_spread_subs?.length || 0)}盘)`);
  }
  if (mkts.full_total_main) {
    count += 1 + (mkts.full_total_subs?.length || 0);
    items.push(`全场大小(${1 + (mkts.full_total_subs?.length || 0)}盘)`);
  }
  if (mkts.half_h2h) {
    count++;
    items.push("半场独赢");
  }
  if (mkts.half_spread_main) {
    count++;
    items.push("半场让球");
  }
  if (mkts.half_total_main) {
    count++;
    items.push("半场大小");
  }
  return { count, text: items.join(" / ") || "暂无盘口" };
}
import {
  MatchAlignmentStatus,
  LeagueMatchStatus,
  DataCompletenessTier,
  MatchStage,
  MissingDataReason,
} from "../../refactor/02_canonical_model/enums";
import {
  sniffIngressPayload,
  SniffedFileInfo,
} from "../../refactor/01_data_ingestion/ingressSniffer";

// 导入对齐向导待审项模型
export interface ImportPendingMatch {
  canonical_id: string;
  league_name: string;
  match_time: string;
  confidence_score: number;
  status: MatchAlignmentStatus;
  alignment_reason: string;

  // YBTY 法定信息
  ybty_league: string;
  ybty_home: string;
  ybty_away: string;
  ybty_time: string;
  ybty_score: string;
  is_live: boolean;

  // 雷速 关联信息
  leisu_match_id: string | null;
  leisu_league: string | null;
  leisu_home: string | null;
  leisu_away: string | null;
  leisu_time: string | null;
  leisu_score: string | null;

  // 联赛匹配状态
  league_status: LeagueMatchStatus;
  league_similarity: number;
  league_alias_hit: boolean;

  // 主客场颠倒预警
  is_swapped_suspected: boolean;

  // 主客队匹配状态
  home_similarity: number;
  home_alias_hit: boolean;
  away_similarity: number;
  away_alias_hit: boolean;
  has_unconfirmed_aliases: boolean;
}

// 可选雷速候选池条目
export interface LeisuCandidateItem {
  match_id: string;
  competition: string;
  home_team: string;
  away_team: string;
  minute: number | null;
  score: { home: number; away: number } | null;
  commence_time: string | null;
  status_text: string;
  is_live: boolean;
}

export const CanonicalMatchCenter: React.FC = () => {
  const [mode, setMode] = useState<"live" | "prematch">("live");
  const [matches, setMatches] = useState<CanonicalMatch[]>([]);
  const [aiBriefs, setAiBriefs] = useState<AiEvaluationBrief[]>([]);
  const [leisuPool, setLeisuPool] = useState<LeisuCandidateItem[]>([]);
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [tierFilter, setTierFilter] = useState<string>("ALL");
  const [filterOnlyManualReview, setFilterOnlyManualReview] = useState<boolean>(false);

  // 卡片折叠/展开与多维查看器状态
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [activeTabByMatch, setActiveTabByMatch] = useState<
    Record<string, "diagnostics" | "markets" | "stats" | "h2h" | "alignment" | "json">
  >({});
  const [copiedMatchId, setCopiedMatchId] = useState<string | null>(null);

  // 弹窗状态：选中的 AI Brief 查看
  const [selectedBrief, setSelectedBrief] = useState<AiEvaluationBrief | null>(null);
  const [selectedCanonical, setSelectedCanonical] = useState<CanonicalMatch | null>(null);

  // 弹窗状态：数据完整度 7 维全景体检面板 (Data Completeness Diagnostic Modal)
  const [selectedDiagnosticMatch, setSelectedDiagnosticMatch] = useState<CanonicalMatch | null>(null);

  // 别名一键核验与操作状态
  const [aliasUpdatingKey, setAliasUpdatingKey] = useState<string | null>(null);
  const [aliasFeedback, setAliasFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // 弹窗状态：统一智能多文件数据导入模态框 (包含 Step 1 文件嗅探与 Step 2 导入对齐确认向导)
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importStep, setImportStep] = useState<1 | 2>(1);
  const [sniffedFiles, setSniffedFiles] = useState<SniffedFileInfo[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [rawPastedText, setRawPastedText] = useState<string>("");
  const [importing, setImporting] = useState<boolean>(false);
  const [importFeedback, setImportFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // 导入向导 Step 2: 待审赛事候选池与选择 (以完整赛事为维度)
  const [importPendingMatches, setImportPendingMatches] = useState<ImportPendingMatch[]>([]);
  const [selectedImportMatchIds, setSelectedImportMatchIds] = useState<string[]>([]);
  const [importBatchProcessing, setImportBatchProcessing] = useState<boolean>(false);

  // 手动关联雷速赛事弹窗与搜索状态
  const [manualPickerMatchId, setManualPickerMatchId] = useState<string | null>(null);
  const [manualPickerSearch, setManualPickerSearch] = useState<string>("");

  // 导出全部 Canonical JSON
  const handleExportAllCanonicalJSON = () => {
    if (!matches || matches.length === 0) return;
    const payload = {
      export_version: "2.0.0",
      export_source: "CanonicalMatchCenter",
      exported_at: new Date().toISOString(),
      mode,
      total_count: matches.length,
      canonical_matches: matches,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canonical_merged_${mode}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 复制单场 Canonical JSON
  const handleCopySingleMatchJSON = async (match: CanonicalMatch) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(match, null, 2));
      setCopiedMatchId(match.canonical_id);
      setTimeout(() => setCopiedMatchId(null), 2000);
    } catch {
      // fallback
    }
  };

  // 下载单场 Canonical JSON
  const handleDownloadSingleMatchJSON = (match: CanonicalMatch) => {
    const blob = new Blob([JSON.stringify(match, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canonical_${match.league_name}_${match.home_team_name}_vs_${match.away_team_name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 核心辅助方法：从 Canonical 赛事清单中构建待核验对齐候选列表，并按置信度升序排序（低的排在前面，疑似主客颠倒置顶）
  const buildUnconfirmedMatches = (matchList: CanonicalMatch[]): ImportPendingMatch[] => {
    const unconfirmed: ImportPendingMatch[] = [];

    for (const m of matchList) {
      const hMatch = m.alignment?.home_team_match;
      const aMatch = m.alignment?.away_team_match;
      const lMatch = m.alignment?.league_match;
      const isSwapped = !!(
        m.alignment?.is_swapped_suspected ||
        m.alignment?.status === MatchAlignmentStatus.SWAPPED_HOME_AWAY
      );

      const homeNeedsPersist = !!(hMatch && !hMatch.is_alias_exact_hit && hMatch.leisu_name);
      const awayNeedsPersist = !!(aMatch && !aMatch.is_alias_exact_hit && aMatch.leisu_name);
      const leagueNeedsPersist = !!(
        lMatch &&
        lMatch.status === LeagueMatchStatus.MATCHED_FUZZY &&
        lMatch.leisu_league
      );
      const isHighConf =
        (m.alignment?.status === MatchAlignmentStatus.MATCHED_BY_ALIAS ||
          m.alignment?.status === MatchAlignmentStatus.MATCHED_AUTO) &&
        !isSwapped &&
        (lMatch?.status === LeagueMatchStatus.MATCHED_BY_ALIAS ||
          lMatch?.status === LeagueMatchStatus.MATCHED_FUZZY);

      const needsReview =
        isSwapped ||
        homeNeedsPersist ||
        awayNeedsPersist ||
        leagueNeedsPersist ||
        !isHighConf ||
        (m.alignment?.confidence_score ?? 0) < 85;

      if (needsReview) {
        const ybtyScore = `${m.score?.home_score ?? 0} - ${m.score?.away_score ?? 0}`;
        const hasLeisu = !!(m.reference?.leisu_home_name || hMatch?.leisu_name);
        const leisuScore = hasLeisu
          ? `${m.score?.home_score ?? 0} - ${m.score?.away_score ?? 0}`
          : "-";

        const ybtyTime =
          m.timing?.stage === MatchStage.LIVE
            ? m.timing?.ybty_clock ||
              (m.timing?.ybty_status_text && m.timing.ybty_status_text.trim() ? m.timing.ybty_status_text : null) ||
              (m.timing?.minute !== null && m.timing?.minute !== undefined ? `${m.timing.minute}'` : null) ||
              m.timing?.beijing_start_time ||
              "-"
            : m.timing?.beijing_start_time || m.timing?.ybty_status_text || "-";

        const leisuTime = hasLeisu
          ? m.timing?.stage === MatchStage.LIVE
            ? m.timing?.minute !== null && m.timing?.minute !== undefined
              ? `${m.timing.minute}'`
              : m.timing?.leisu_status_text || m.timing?.beijing_start_time || "-"
            : m.timing?.beijing_start_time || "-"
          : "-";

        unconfirmed.push({
          canonical_id: m.canonical_id,
          league_name: m.league_name,
          match_time: m.timing?.beijing_start_time || "-",
          confidence_score: m.alignment?.confidence_score ?? 0,
          status: m.alignment?.status || MatchAlignmentStatus.UNMATCHED,
          alignment_reason: m.alignment?.alignment_reason || "",

          ybty_league: m.league_name,
          ybty_home: m.home_team_name,
          ybty_away: m.away_team_name,
          ybty_time: ybtyTime,
          ybty_score: ybtyScore,
          is_live: m.timing?.stage === MatchStage.LIVE,

          leisu_match_id: m.reference?.leisu_match_id || null,
          leisu_league: m.reference?.leisu_league_name || lMatch?.leisu_league || null,
          leisu_home: m.reference?.leisu_home_name || hMatch?.leisu_name || null,
          leisu_away: m.reference?.leisu_away_name || aMatch?.leisu_name || null,
          leisu_time: leisuTime,
          leisu_score: leisuScore,

          league_status: lMatch?.status || LeagueMatchStatus.UNMATCHED,
          league_similarity: lMatch?.similarity ?? 0,
          league_alias_hit: !!lMatch?.is_alias_exact_hit,

          is_swapped_suspected: isSwapped,

          home_similarity: hMatch?.raw_text_similarity ?? 0,
          home_alias_hit: !!hMatch?.is_alias_exact_hit,
          away_similarity: aMatch?.raw_text_similarity ?? 0,
          away_alias_hit: !!aMatch?.is_alias_exact_hit,
          has_unconfirmed_aliases: homeNeedsPersist || awayNeedsPersist || leagueNeedsPersist,
        });
      }
    }

    // 排序：按匹配度升序排序（低的在上面），若存在主客颠倒疑似，优先排在最前！
    unconfirmed.sort((a, b) => {
      if (a.is_swapped_suspected && !b.is_swapped_suspected) return -1;
      if (!a.is_swapped_suspected && b.is_swapped_suspected) return 1;
      return a.confidence_score - b.confidence_score;
    });

    return unconfirmed;
  };

  const fetchCanonicalData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/refactor/canonical-matches?mode=${mode}`);
      const data = await res.json();
      if (data.success) {
        setMatches(data.matches || []);
        setAiBriefs(data.ai_briefs || []);
        setMetadata(data.metadata || null);
        setLeisuPool(data.leisu_candidates || []);
      } else {
        setError(data.message || "获取标准赛事数据失败");
      }
    } catch (err: any) {
      setError(err.message || "网络请求异常");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCanonicalData();
  }, [mode]);

  const processRawJsonFile = (file: File) => {
    return new Promise<SniffedFileInfo>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          const sniffed = sniffIngressPayload(file.name, file.size, parsed);
          resolve(sniffed);
        } catch (e: any) {
          reject(new Error(`文件 ${file.name} 不是合法的 JSON 格式: ${e.message}`));
        }
      };
      reader.onerror = () => reject(new Error(`读取文件 ${file.name} 失败`));
      reader.readAsText(file);
    });
  };

  const handleMultipleFilesSelected = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setImportFeedback(null);

    const newSniffed: SniffedFileInfo[] = [];
    const errorMessages: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const sniffed = await processRawJsonFile(file);
        newSniffed.push(sniffed);
      } catch (err: any) {
        errorMessages.push(err.message || `解析 ${file.name} 失败`);
      }
    }

    if (newSniffed.length > 0) {
      setSniffedFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.fileName));
        const filteredNew = newSniffed.filter((f) => !existingNames.has(f.fileName));
        return [...prev, ...filteredNew];
      });
    }

    if (errorMessages.length > 0) {
      setImportFeedback({
        success: false,
        message: errorMessages.join("; "),
      });
    }
  };

  const handleAddPastedText = () => {
    if (!rawPastedText.trim()) return;
    try {
      const parsed = JSON.parse(rawPastedText.trim());
      const sniffed = sniffIngressPayload(`pasted_snippet_${Date.now()}.json`, rawPastedText.length, parsed);
      setSniffedFiles((prev) => [...prev, sniffed]);
      setRawPastedText("");
      setImportFeedback(null);
    } catch (e: any) {
      setImportFeedback({
        success: false,
        message: `粘贴的 JSON 格式错误: ${e.message}`,
      });
    }
  };

  const handleRemoveSniffedFile = (index: number) => {
    setSniffedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleExecuteImport = async () => {
    if (sniffedFiles.length === 0) {
      setImportFeedback({
        success: false,
        message: "请先添加至少 1 个 YBTY 或雷速 JSON 数据文件",
      });
      return;
    }

    setImporting(true);
    setImportFeedback(null);

    try {
      const payloadFiles = sniffedFiles.map((sf) => ({
        fileName: sf.fileName,
        rawJson: sf.rawJson,
      }));

      const res = await fetch("/api/refactor/import-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          files_payload: payloadFiles,
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (data.mode) {
          setMode(data.mode);
        }
        const newMatches: CanonicalMatch[] = data.matches || [];
        setMatches(newMatches);
        setAiBriefs(data.ai_briefs || []);
        setMetadata(data.metadata || null);
        if (data.leisu_candidates) {
          setLeisuPool(data.leisu_candidates);
        }

        // 提取需要确认的待核验赛事（自动按置信度从低到高排序）
        const unconfirmedMatches = buildUnconfirmedMatches(newMatches);

        if (unconfirmedMatches.length > 0) {
          setImportPendingMatches(unconfirmedMatches);
          const highConf = unconfirmedMatches
            .filter((c) => c.confidence_score >= 70 && !c.is_swapped_suspected)
            .map((c) => c.canonical_id);
          setSelectedImportMatchIds(highConf);
          setImportStep(2);
          setImportFeedback({
            success: true,
            message: `数据初筛装配完成！共识别 ${newMatches.length} 场赛事，检测到 ${unconfirmedMatches.length} 场待核验或低置信赛事（已按匹配度由低到高排列）。`,
          });
        } else {
          // 100% 赛事完全对齐：后台并发静默沉淀全部新别名映射，实现一次导入永久自动对齐
          (async () => {
            for (const m of newMatches) {
              if (m.reference) {
                if (!m.alignment?.home_team_match?.is_alias_exact_hit && m.reference.leisu_home_name) {
                  fetch("/api/aliases", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      canonical_name: m.home_team_name,
                      alias: m.reference.leisu_home_name,
                    }),
                  }).catch(() => {});
                }
                if (!m.alignment?.away_team_match?.is_alias_exact_hit && m.reference.leisu_away_name) {
                  fetch("/api/aliases", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      canonical_name: m.away_team_name,
                      alias: m.reference.leisu_away_name,
                    }),
                  }).catch(() => {});
                }
              }
            }
          })();

          setImportFeedback({
            success: true,
            message: data.message || "数据智能识别并精准对齐装配成功（100% 赛事精准命中，别名已自动沉淀）！",
          });
          setTimeout(() => {
            setShowImportModal(false);
            setSniffedFiles([]);
            setImportStep(1);
            setImportFeedback(null);
          }, 1200);
        }
      } else {
        setImportFeedback({
          success: false,
          message: data.error || "导入失败，请检查数据格式",
        });
      }
    } catch (err: any) {
      setImportFeedback({
        success: false,
        message: err.message || "请求发生异常",
      });
    } finally {
      setImporting(false);
    }
  };

  // 联赛别名持久化保存
  const handleSaveLeagueAlias = async (ybtyLeague: string, leisuLeague: string) => {
    if (!ybtyLeague || !leisuLeague) return;
    const key = `league_${ybtyLeague}_${leisuLeague}`;
    setAliasUpdatingKey(key);
    try {
      const res = await fetch("/api/league-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonical_name: ybtyLeague,
          alias: leisuLeague,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setImportFeedback({
          success: true,
          message: `已成功将联赛别名 [${leisuLeague}] 绑定为 [${ybtyLeague}] 的标准别名！`,
        });
        await fetchCanonicalData();
      }
    } catch (e: any) {
      setImportFeedback({
        success: false,
        message: `保存联赛别名失败: ${e.message}`,
      });
    } finally {
      setAliasUpdatingKey(null);
    }
  };

  // 修正主客颠倒并持久化对调别名
  const handleResolveSwappedMatch = async (cand: ImportPendingMatch) => {
    if (!cand.leisu_home || !cand.leisu_away) return;
    setAliasUpdatingKey(cand.canonical_id);
    try {
      // 1. YBTY 主队对应雷速客队
      await fetch("/api/aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonical_name: cand.ybty_home,
          alias: cand.leisu_away,
        }),
      });

      // 2. YBTY 客队对应雷速主队
      await fetch("/api/aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonical_name: cand.ybty_away,
          alias: cand.leisu_home,
        }),
      });

      // 3. 联赛别名（若需要）
      if (cand.leisu_league && cand.league_status === LeagueMatchStatus.MATCHED_FUZZY) {
        await fetch("/api/league-aliases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canonical_name: cand.ybty_league,
            alias: cand.leisu_league,
          }),
        });
      }

      setImportPendingMatches((prev) => prev.filter((c) => c.canonical_id !== cand.canonical_id));
      setSelectedImportMatchIds((prev) => prev.filter((id) => id !== cand.canonical_id));
      await fetchCanonicalData();
      setImportFeedback({
        success: true,
        message: `已成功纠正 [${cand.ybty_home} vs ${cand.ybty_away}] 的主客颠倒并持久化别名！`,
      });
    } catch (e: any) {
      setImportFeedback({
        success: false,
        message: `纠正失败: ${e.message}`,
      });
    } finally {
      setAliasUpdatingKey(null);
    }
  };

  // 拒绝关联 / 解除雷速关联
  const handleDissociateMatch = (cand: ImportPendingMatch) => {
    setImportPendingMatches((prev) =>
      prev.map((c) => {
        if (c.canonical_id === cand.canonical_id) {
          return {
            ...c,
            leisu_match_id: null,
            leisu_league: null,
            leisu_home: null,
            leisu_away: null,
            leisu_time: null,
            leisu_score: null,
            league_status: LeagueMatchStatus.UNMATCHED,
            is_swapped_suspected: false,
            confidence_score: 0,
            status: MatchAlignmentStatus.UNMATCHED,
            has_unconfirmed_aliases: false,
          };
        }
        return c;
      })
    );
  };

  // 手动绑定雷速候选赛事
  const handleManualBindLeisuMatch = async (
    cand: ImportPendingMatch,
    targetLeisu: LeisuCandidateItem
  ) => {
    setAliasUpdatingKey(cand.canonical_id);
    try {
      await fetch("/api/aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonical_name: cand.ybty_home,
          alias: targetLeisu.home_team,
        }),
      });
      await fetch("/api/aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonical_name: cand.ybty_away,
          alias: targetLeisu.away_team,
        }),
      });
      if (cand.ybty_league !== targetLeisu.competition) {
        await fetch("/api/league-aliases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canonical_name: cand.ybty_league,
            alias: targetLeisu.competition,
          }),
        });
      }

      setManualPickerMatchId(null);
      setImportPendingMatches((prev) => prev.filter((c) => c.canonical_id !== cand.canonical_id));
      setSelectedImportMatchIds((prev) => prev.filter((id) => id !== cand.canonical_id));
      await fetchCanonicalData();
      setImportFeedback({
        success: true,
        message: `已成功手动绑定 [${cand.ybty_home} vs ${cand.ybty_away}] ↔ 雷速 [${targetLeisu.home_team} vs ${targetLeisu.away_team}] 并持久化别名！`,
      });
    } catch (e: any) {
      setImportFeedback({
        success: false,
        message: `手动绑定失败: ${e.message}`,
      });
    } finally {
      setAliasUpdatingKey(null);
    }
  };

  // 导入向导 Step 2：单场确认对齐并持久化主客队及联赛别名
  const handleImportSingleMatchConfirm = async (matchCand: ImportPendingMatch) => {
    setAliasUpdatingKey(matchCand.canonical_id);
    try {
      // 若主队需持久化
      if (!matchCand.home_alias_hit && matchCand.leisu_home) {
        await fetch("/api/aliases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canonical_name: matchCand.ybty_home,
            alias: matchCand.leisu_home,
          }),
        });
      }
      // 若客队需持久化
      if (!matchCand.away_alias_hit && matchCand.leisu_away) {
        await fetch("/api/aliases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canonical_name: matchCand.ybty_away,
            alias: matchCand.leisu_away,
          }),
        });
      }
      // 若联赛需持久化
      if (
        matchCand.league_status === LeagueMatchStatus.MATCHED_FUZZY &&
        matchCand.leisu_league &&
        matchCand.ybty_league !== matchCand.leisu_league
      ) {
        await fetch("/api/league-aliases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canonical_name: matchCand.ybty_league,
            alias: matchCand.leisu_league,
          }),
        });
      }

      setImportPendingMatches((prev) => prev.filter((c) => c.canonical_id !== matchCand.canonical_id));
      setSelectedImportMatchIds((prev) => prev.filter((id) => id !== matchCand.canonical_id));
      await fetchCanonicalData();
    } catch (e: any) {
      setImportFeedback({
        success: false,
        message: `持久化别名失败: ${e.message}`,
      });
    } finally {
      setAliasUpdatingKey(null);
    }
  };

  // 导入向导 Step 2：批量确认入库并完成合并导入
  const handleImportBatchConfirmAndFinalize = async () => {
    if (selectedImportMatchIds.length === 0) {
      setShowImportModal(false);
      setSniffedFiles([]);
      setImportStep(1);
      setImportFeedback(null);
      await fetchCanonicalData();
      return;
    }

    setImportBatchProcessing(true);
    let successAliasCount = 0;

    for (const matchId of selectedImportMatchIds) {
      const matchCand = importPendingMatches.find((m) => m.canonical_id === matchId);
      if (!matchCand) continue;

      if (!matchCand.home_alias_hit && matchCand.leisu_home) {
        try {
          const res = await fetch("/api/aliases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              canonical_name: matchCand.ybty_home,
              alias: matchCand.leisu_home,
            }),
          });
          const d = await res.json();
          if (d.success) successAliasCount++;
        } catch {
          // ignore
        }
      }

      if (!matchCand.away_alias_hit && matchCand.leisu_away) {
        try {
          const res = await fetch("/api/aliases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              canonical_name: matchCand.ybty_away,
              alias: matchCand.leisu_away,
            }),
          });
          const d = await res.json();
          if (d.success) successAliasCount++;
        } catch {
          // ignore
        }
      }

      if (
        matchCand.league_status === LeagueMatchStatus.MATCHED_FUZZY &&
        matchCand.leisu_league &&
        matchCand.ybty_league !== matchCand.leisu_league
      ) {
        try {
          const res = await fetch("/api/league-aliases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              canonical_name: matchCand.ybty_league,
              alias: matchCand.leisu_league,
            }),
          });
          const d = await res.json();
          if (d.success) successAliasCount++;
        } catch {
          // ignore
        }
      }
    }

    setImportFeedback({
      success: true,
      message: `已批量确认 ${selectedImportMatchIds.length} 场赛事对齐并持久化 ${successAliasCount} 项别名，正在刷新重装配标准赛事...`,
    });

    await fetchCanonicalData();

    setImportBatchProcessing(false);
    setTimeout(() => {
      setShowImportModal(false);
      setSniffedFiles([]);
      setImportStep(1);
      setImportFeedback(null);
    }, 1000);
  };

  // 导入向导 Step 2：跳过未选中的待审项（未对齐场次降级保留）
  const handleImportSkipAndFinalize = async () => {
    setShowImportModal(false);
    setSniffedFiles([]);
    setImportStep(1);
    setImportFeedback(null);
    await fetchCanonicalData();
  };

  const handleResetToSample = async () => {
    if (!confirm(`确定要将当前 ${mode === "live" ? "滚球" : "赛前"} 数据重置为内置标准测试样本吗？`)) {
      return;
    }

    setImporting(true);
    setImportFeedback(null);
    try {
      const res = await fetch("/api/refactor/import-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          reset_to_sample: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSniffedFiles([]);
        setImportFeedback({
          success: true,
          message: data.message || "已成功重置为标准测试样本",
        });
        setMatches(data.matches || []);
        setAiBriefs(data.ai_briefs || []);
        setMetadata(data.metadata || null);

        setTimeout(() => {
          setShowImportModal(false);
          setImportFeedback(null);
        }, 1000);
      }
    } catch (err: any) {
      setImportFeedback({
        success: false,
        message: err.message || "重置失败",
      });
    } finally {
      setImporting(false);
    }
  };

  // 辅助函数：解析历史交锋中的队伍中文名称
  const resolveH2HTeamName = (
    teamId: number | null | undefined,
    match: CanonicalMatch
  ): { name: string; isCurrent: "home" | "away" | "other" } => {
    if (!teamId) return { name: "未知队伍", isCurrent: "other" };

    const homeStandingsId = match.reference?.league_standings?.home_team?.team_id;
    if (homeStandingsId && Number(homeStandingsId) === Number(teamId)) {
      return { name: match.reference?.leisu_home_name || match.home_team_name, isCurrent: "home" };
    }

    const awayStandingsId = match.reference?.league_standings?.away_team?.team_id;
    if (awayStandingsId && Number(awayStandingsId) === Number(teamId)) {
      return { name: match.reference?.leisu_away_name || match.away_team_name, isCurrent: "away" };
    }

    const homeStarterTeamId = match.reference?.lineups?.home_starters?.[0]?.team_id;
    if (homeStarterTeamId && Number(homeStarterTeamId) === Number(teamId)) {
      return { name: match.reference?.leisu_home_name || match.home_team_name, isCurrent: "home" };
    }

    const awayStarterTeamId = match.reference?.lineups?.away_starters?.[0]?.team_id;
    if (awayStarterTeamId && Number(awayStarterTeamId) === Number(teamId)) {
      return { name: match.reference?.leisu_away_name || match.away_team_name, isCurrent: "away" };
    }

    const recentHome = match.reference?.tactical_context?.home_recent_matches || [];
    const recentAway = match.reference?.tactical_context?.away_recent_matches || [];
    for (const r of [...recentHome, ...recentAway]) {
      if (r.home_team_id === teamId && r.home_team_name) {
        const isH = r.home_team_name === match.reference?.leisu_home_name;
        const isA = r.home_team_name === match.reference?.leisu_away_name;
        return { name: r.home_team_name, isCurrent: isH ? "home" : isA ? "away" : "other" };
      }
      if (r.away_team_id === teamId && r.away_team_name) {
        const isH = r.away_team_name === match.reference?.leisu_home_name;
        const isA = r.away_team_name === match.reference?.leisu_away_name;
        return { name: r.away_team_name, isCurrent: isH ? "home" : isA ? "away" : "other" };
      }
    }

    return { name: `队伍(ID:${teamId})`, isCurrent: "other" };
  };

  // 缺口赛事数量统计
  const matchesWithGapsCount = matches.filter((m) => m.missing_reasons.length > 0).length;

  const filteredMatches = matches.filter((m) => {
    const matchesSearch =
      m.league_name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      m.home_team_name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      m.away_team_name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      (m.reference?.leisu_home_name || "").toLowerCase().includes(searchKeyword.toLowerCase()) ||
      (m.reference?.leisu_away_name || "").toLowerCase().includes(searchKeyword.toLowerCase());

    const matchesTier =
      tierFilter === "ALL" || m.completeness_tier === tierFilter;

    return matchesSearch && matchesTier;
  });

  const getTierBadge = (tier: DataCompletenessTier) => {
    switch (tier) {
      case DataCompletenessTier.TIER_1_FULL:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-500/50">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            TIER 1 (全维度)
          </span>
        );
      case DataCompletenessTier.TIER_2_BASIC:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/60 text-amber-300 border border-amber-500/50">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            TIER 2 (基础)
          </span>
        );
      case DataCompletenessTier.TIER_3_SPARSE:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-950/60 text-orange-300 border border-orange-500/50">
            <Clock className="w-3.5 h-3.5 text-orange-400" />
            TIER 3 (稀疏)
          </span>
        );
      case DataCompletenessTier.TIER_INVALID:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/60 text-rose-300 border border-rose-500/50">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            TIER INVALID (冲突熔断)
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div id="canonical-match-center" className="w-full max-w-7xl mx-auto space-y-6 pb-16">
      {/* 全局别名操作反馈提示 */}
      {aliasFeedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between gap-2 shadow-lg transition-all animate-in fade-in ${
            aliasFeedback.success
              ? "bg-emerald-950/90 border border-emerald-500/80 text-emerald-200"
              : "bg-rose-950/90 border border-rose-500/80 text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {aliasFeedback.success ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{aliasFeedback.message}</span>
          </div>
          <button
            onClick={() => setAliasFeedback(null)}
            className="p-1 hover:bg-black/30 rounded text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 顶部标题与控制栏 */}
      <div className="bg-slate-900/90 rounded-xl p-5 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-950/80 rounded-lg text-blue-400 border border-blue-800/50">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                标准赛事对齐中心
                <span className="text-xs px-2 py-0.5 bg-blue-900/60 text-blue-300 rounded font-mono font-normal border border-blue-700/50">
                  Layer 02 SSOT
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>YBTY 法定执行源 ↔ 雷速增强源精准对齐与极简 AI Brief 提炼</span>
                {metadata && (
                  <span className="text-[11px] text-slate-500 font-mono">
                    | 原始: YBTY({metadata.ybtyMatchCount}场) · 雷速({metadata.leisuMatchCount}场)
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* 模式切换、导入与刷新 */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="bg-slate-950 p-1 rounded-lg flex items-center text-xs font-medium border border-slate-800">
            <button
              id="tab-mode-live"
              onClick={() => setMode("live")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                mode === "live"
                  ? "bg-blue-600 text-white font-semibold shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🔴 滚球实时对齐 ({mode === "live" ? matches.length : "-"})
            </button>
            <button
              id="tab-mode-prematch"
              onClick={() => setMode("prematch")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                mode === "prematch"
                  ? "bg-blue-600 text-white font-semibold shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              📅 赛前赛事对齐 ({mode === "prematch" ? matches.length : "-"})
            </button>
          </div>

          {/* 全量合并 JSON 导出按钮 */}
          <button
            id="btn-export-all-canonical"
            onClick={handleExportAllCanonicalJSON}
            disabled={matches.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-white transition-colors border border-blue-600/60 shadow-xs"
            title="下载当前所有合并对齐后的 CanonicalMatch JSON 数据"
          >
            <Download className="w-3.5 h-3.5" />
            <span>📥 导出全部合并数据 (.json)</span>
          </button>

          {/* 原生数据导入按钮 */}
          <button
            id="btn-open-import-modal"
            onClick={() => {
              setShowImportModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-xs font-medium text-white transition-colors border border-emerald-600/60 shadow-xs"
            title="导入新抓取的数据"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>智能导入数据</span>
          </button>

          <button
            id="btn-refresh-canonical"
            onClick={fetchCanonicalData}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors border border-slate-700"
            title="刷新数据"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* 搜索与多维过滤条 */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="input-search-match"
            type="text"
            placeholder="搜索联赛名、YBTY队名、雷速队名..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-200"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto flex-wrap">
          <span className="text-xs text-slate-400 whitespace-nowrap">完整度:</span>
          {["ALL", DataCompletenessTier.TIER_1_FULL, DataCompletenessTier.TIER_2_BASIC, DataCompletenessTier.TIER_3_SPARSE, DataCompletenessTier.TIER_INVALID].map((tier) => (
            <button
              key={tier}
              id={`filter-${tier}`}
              onClick={() => setTierFilter(tier)}
              className={`text-xs px-2.5 py-1 rounded-md transition-all whitespace-nowrap ${
                tierFilter === tier
                  ? "bg-blue-600 text-white font-medium shadow-xs"
                  : "bg-slate-950 text-slate-400 hover:bg-slate-800 border border-slate-800"
              }`}
            >
              {tier === "ALL" ? "全部" : tier.replace("TIER_", "")}
            </button>
          ))}
        </div>
      </div>

      {/* 主列表 */}
      {loading ? (
        <div className="p-12 text-center bg-slate-900 rounded-xl border border-slate-800">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">正在执行 Layer 01 解析与 Layer 02 标准赛事装配...</p>
        </div>
      ) : error ? (
        <div className="p-8 bg-rose-950/40 border border-rose-900 rounded-xl text-rose-300 text-sm">
          {error}
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 rounded-xl border border-slate-800 space-y-3">
          <Database className="w-8 h-8 text-slate-600 mx-auto opacity-50" />
          <p className="text-sm text-slate-400">未找到匹配的标准赛事数据</p>
          <button
            onClick={() => {
              setShowImportModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            立即导入数据文件
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMatches.map((m, idx) => {
            const brief = aiBriefs.find((b) => b.match_id === m.canonical_id);

            return (
              <div
                key={m.canonical_id || idx}
                id={`match-card-${idx}`}
                className="bg-slate-900 rounded-xl p-5 border border-slate-800 hover:border-blue-500/50 shadow-sm transition-all space-y-4"
              >
                {/* 卡片头部：联赛、时间、完整度与状态 */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold px-2 py-0.5 bg-slate-800 text-slate-200 rounded border border-slate-700">
                      {m.league_name}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      {m.timing.beijing_start_time}
                      {m.timing.start_time_source === "LEISU_SUPPLEMENTED" && (
                        <span className="text-[10px] text-blue-400 font-mono">(雷速补充)</span>
                      )}
                    </span>
                    {m.timing.stage === MatchStage.LIVE && (
                      <span className="text-xs font-bold text-rose-400 animate-pulse">
                        {m.timing.minute ? `${m.timing.minute}'` : "滚球中"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* 数据完整度定级 */}
                    {getTierBadge(m.completeness_tier)}

                    {/* 缺口全维体检入口按钮：直接就地展开下拉明细中的体检标签 */}
                    <button
                      id={`btn-open-diagnostic-${idx}`}
                      onClick={() => {
                        if (expandedMatchId === m.canonical_id && (activeTabByMatch[m.canonical_id] || "markets") === "diagnostics") {
                          setExpandedMatchId(null);
                        } else {
                          setExpandedMatchId(m.canonical_id);
                          setActiveTabByMatch((prev) => ({ ...prev, [m.canonical_id]: "diagnostics" }));
                          setTimeout(() => {
                            const el = document.getElementById(`match-card-${idx}`);
                            if (el) {
                              el.scrollIntoView({ behavior: "smooth", block: "start" });
                            }
                          }, 60);
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                        m.missing_reasons.length > 0
                          ? "bg-amber-950/60 text-amber-300 border-amber-700 hover:bg-amber-900/60"
                          : "bg-emerald-950/60 text-emerald-300 border-emerald-700 hover:bg-emerald-900/60"
                      }`}
                      title="点击就地展开 11 维核心数据特征就绪体检清单"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>
                        {m.missing_reasons.length > 0
                          ? `缺口体检 (${m.missing_reasons.length}项)`
                          : "✅ 11维全齐备"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* 对齐主体：双源队名比对 */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                  {/* 左侧：YBTY 法定执行队名与比分 */}
                  <div className="lg:col-span-5 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium mb-1.5">
                      <span>YBTY 法定执行队名 (第一主键)</span>
                      <span className="flex items-center gap-1">
                        {m.score.score_verified ? (
                          <span className="text-emerald-400 flex items-center gap-0.5 text-[10px]">
                            <ShieldCheck className="w-3.5 h-3.5" /> 比分已校验
                          </span>
                        ) : (
                          <span className="text-amber-400 flex items-center gap-0.5 text-[10px]">
                            <ShieldAlert className="w-3.5 h-3.5" /> 未经画布校验
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                          {m.home_team_name}
                        </div>
                        <div className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                          {m.away_team_name}
                        </div>
                      </div>
                      <div className="text-xl font-mono font-bold text-slate-100 bg-slate-900 px-3 py-1.5 rounded-md border border-slate-700 shadow-inner">
                        {m.score.home_score !== null ? m.score.home_score : "-"} : {m.score.away_score !== null ? m.score.away_score : "-"}
                      </div>
                    </div>
                  </div>

                  {/* 中间：对齐箭头 */}
                  <div className="lg:col-span-2 text-center flex flex-col items-center justify-center text-slate-500">
                    <ArrowRight className="w-5 h-5 text-slate-600" />
                  </div>

                  {/* 右侧：雷速对齐参考队名与特征摘要 */}
                  <div className="lg:col-span-5 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium mb-1.5">
                      <span>雷速参考与增强源</span>
                      <span className="text-[10px] text-slate-500">{m.reference ? m.reference.leisu_league_name : "未关联"}</span>
                    </div>
                    {m.reference ? (
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-slate-300 flex items-center justify-between">
                          <span>{m.reference.leisu_home_name}</span>
                        </div>
                        <div className="text-sm font-medium text-slate-300 flex items-center justify-between">
                          <span>{m.reference.leisu_away_name}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic py-2">
                        未匹配到雷速数据
                      </div>
                    )}
                  </div>
                </div>

                {/* 盘口行情与操作栏 */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 全场让球主盘 */}
                    {m.markets.full_spread_main && (
                      <div className="text-xs bg-slate-950 px-2.5 py-1 rounded border border-slate-800 font-mono">
                        <span className="text-slate-500 mr-1">让球:</span>
                        <span className="font-semibold text-blue-400">
                          {m.markets.full_spread_main.home_selection}
                        </span>{" "}
                        ({m.markets.full_spread_main.home_odds} / {m.markets.full_spread_main.away_odds})
                      </div>
                    )}

                    {/* 全场大小主盘 */}
                    {m.markets.full_total_main && (
                      <div className="text-xs bg-slate-950 px-2.5 py-1 rounded border border-slate-800 font-mono">
                        <span className="text-slate-500 mr-1">大小:</span>
                        <span className="font-semibold text-emerald-400">
                          {m.markets.full_total_main.line}
                        </span>{" "}
                        (大{m.markets.full_total_main.over_odds} / 小{m.markets.full_total_main.under_odds})
                      </div>
                    )}

                    {/* 独赢 */}
                    {m.markets.full_h2h && (
                      <div className="text-xs bg-slate-950 px-2.5 py-1 rounded border border-slate-800 font-mono">
                        <span className="text-slate-500 mr-1">独赢:</span>
                        {m.markets.full_h2h.home_odds} | {m.markets.full_h2h.draw_odds} | {m.markets.full_h2h.away_odds}
                      </div>
                    )}
                  </div>

                  {/* 右侧查看与展开操作按钮 */}
                  <div className="flex items-center gap-2">
                    {/* 折叠/展开就地多维面板 */}
                    <button
                      id={`btn-toggle-expand-${idx}`}
                      onClick={() => {
                        const isExpanding = expandedMatchId !== m.canonical_id;
                        setExpandedMatchId(isExpanding ? m.canonical_id : null);
                        if (isExpanding && !activeTabByMatch[m.canonical_id]) {
                          setActiveTabByMatch((prev) => ({ ...prev, [m.canonical_id]: "markets" }));
                        }
                        if (isExpanding) {
                          setTimeout(() => {
                            const el = document.getElementById(`match-card-${idx}`);
                            if (el) {
                              el.scrollIntoView({ behavior: "smooth", block: "start" });
                            }
                          }, 60);
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-all border ${
                        expandedMatchId === m.canonical_id
                          ? "bg-slate-800 text-blue-400 border-blue-500/50 shadow-inner"
                          : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700"
                      }`}
                      title="就地展开查看合并后的多维完整数据"
                    >
                      <span>{expandedMatchId === m.canonical_id ? "收起明细" : "展开明细"}</span>
                      {expandedMatchId === m.canonical_id ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* 快捷查看 AI 提炼包 */}
                    <button
                      id={`btn-view-brief-${idx}`}
                      onClick={() => {
                        setSelectedCanonical(m);
                        setSelectedBrief(brief || null);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      AI 简报
                    </button>
                  </div>
                </div>

                {/* 就地展开的多维数据查看器 (Canonical Match Multi-Dimensional Inspector) */}
                {expandedMatchId === m.canonical_id && (
                  <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-4 animate-in fade-in duration-200">
                    {/* 标签栏导航 */}
                    <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800/80 flex-wrap">
                        {[
                          { id: "diagnostics", label: `🛡️ 11维体检 (${m.missing_reasons.length > 0 ? `${m.missing_reasons.length}项缺口` : "全齐备"})`, icon: Shield },
                          { id: "markets", label: "🎯 YBTY 盘口全集", icon: Target },
                          { id: "stats", label: "📊 雷速统计增强", icon: BarChart2 },
                          { id: "h2h", label: "⚔️ 近期战绩/交锋/阵容", icon: Users },
                          { id: "json", label: "{} 完整合并 JSON", icon: Code },
                        ].map((tab) => {
                          const currentTab = activeTabByMatch[m.canonical_id] || "markets";
                          const isActive = currentTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              id={`tab-${m.canonical_id}-${tab.id}`}
                              onClick={() =>
                                setActiveTabByMatch((prev) => ({
                                  ...prev,
                                  [m.canonical_id]: tab.id as any,
                                }))
                              }
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all ${
                                isActive
                                  ? "bg-blue-600 text-white font-semibold shadow-xs"
                                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                              }`}
                            >
                              <span>{tab.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="text-[11px] text-slate-500 font-mono">
                        唯一主键: {m.canonical_id.slice(0, 16)}...
                      </div>
                    </div>

                    {/* TAB 0: 🛡️ 赛事数据完整度 11 维全景体检报告 (Inline 11-Dimension Diagnostics) */}
                    {(activeTabByMatch[m.canonical_id] || "markets") === "diagnostics" && (
                      <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-4 animate-in fade-in duration-150">
                        {/* 顶部三栏状态摘要 */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                            <div className="text-[11px] text-slate-500 font-medium">数据完整度定级 (Tier)</div>
                            <div className="mt-1 flex items-center gap-2">
                              {getTierBadge(m.completeness_tier)}
                              <span className="text-[11px] text-slate-400 font-mono">
                                {m.completeness_tier === DataCompletenessTier.TIER_1_FULL ? "全部特征就绪" : m.completeness_tier === DataCompletenessTier.TIER_2_BASIC ? "基础攻防完备" : "稀疏降级运行"}
                              </span>
                            </div>
                          </div>

                          <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                            <div className="text-[11px] text-slate-500 font-medium">盘口覆盖与深度</div>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-sm font-bold text-blue-400 font-mono">
                                {getMarketsSummary(m.markets).count} 个玩法
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]" title={getMarketsSummary(m.markets).text}>
                                ({getMarketsSummary(m.markets).text})
                              </span>
                            </div>
                          </div>

                          <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                            <div className="text-[11px] text-slate-500 font-medium">比分校验真实度</div>
                            <div className="mt-1 text-sm font-bold font-mono">
                              {m.score.score_verified ? (
                                <span className="text-emerald-400 flex items-center gap-1">
                                  <ShieldCheck className="w-4 h-4" /> 画布/接口已校验
                                </span>
                              ) : (
                                <span className="text-amber-400 flex items-center gap-1">
                                  <ShieldAlert className="w-4 h-4" /> 未经画布校验
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 11 维度全面清单 */}
                        <div className="bg-slate-900/80 rounded-lg border border-slate-800 overflow-hidden">
                          <div className="p-2.5 bg-slate-900 border-b border-slate-800 font-semibold text-xs text-slate-200 flex items-center justify-between">
                            <span>11 维核心量化数据特征就绪体检清单</span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {m.missing_reasons.length === 0 ? "11/11 项特征全齐备" : `存在 ${m.missing_reasons.length} 项数据缺口`}
                            </span>
                          </div>

                          <div className="divide-y divide-slate-800/80 text-xs">
                            {/* 1. 实时危攻时序走势 */}
                            <div className="p-3 flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                                  <TrendingUp className="w-4 h-4 text-blue-400" />
                                  <span>1. 实时危攻时序走势 (Attack Momentum Timeline)</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  提供逐分钟攻防差值走势、危攻积分与动量斜率
                                </div>
                              </div>
                              <div>
                                {m.reference?.attack_momentum?.available ? (
                                  <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                                    ✅ 完整具备 ({m.reference.attack_momentum.segment_count}段)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                                    ❌ 缺失 (NO_ATTACK_MOMENTUM)
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 2. 实时攻防技术统计 */}
                            <div className="p-3 flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                                  <BarChart2 className="w-4 h-4 text-blue-400" />
                                  <span>2. 实时攻防技术统计 (Live Technical Stats)</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  涵盖射门、射正、危攻、总攻、控球率、角球、红黄牌等 9 项指标
                                </div>
                              </div>
                              <div>
                                {m.reference?.stats ? (
                                  <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                                    ✅ 完整具备 (9项指标)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                                    ❌ 缺失 (NO_STATS)
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 3. 比赛关键事件与时间轴 */}
                            <div className="p-3 flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                                  <Activity className="w-4 h-4 text-purple-400" />
                                  <span>3. 比赛关键事件与时间轴 (Timeline Key Events)</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  进球、红黄牌、点球、换人等时序关键事件
                                </div>
                              </div>
                              <div>
                                {(m.reference?.timeline_events?.length || 0) > 0 ? (
                                  <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                                    ✅ 具备 ({m.reference?.timeline_events?.length}个事件)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700 font-medium">
                                    ⏳ 暂无事件/未发生
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 4. 阵容首发与伤停名单 */}
                            <div className="p-3 flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                                  <Users className="w-4 h-4 text-emerald-400" />
                                  <span>4. 阵容首发与伤停名单 (Lineups & Formations)</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  首发阵容名单、阵型架构与伤停减员状态
                                </div>
                              </div>
                              <div>
                                {m.reference?.lineups?.confirmed ? (
                                  <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                                    ✅ 正式首发已确认
                                  </span>
                                ) : (m.reference?.lineups?.home_starters?.length || 0) > 0 ? (
                                  <span className="px-2.5 py-1 rounded bg-amber-950 text-amber-300 border border-amber-800 font-medium">
                                    ⏳ 预测首发/未确认
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                                    ❌ 缺失 (NO_LINEUP_DATA)
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 5. 历史交锋往绩 */}
                            <div className="p-3 flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                                  <Users className="w-4 h-4 text-blue-400" />
                                  <span>5. 历史交锋记录 (Head to Head)</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  主客两队过往历史交战对赛记录、比分与让球赢盘走势
                                </div>
                              </div>
                              <div>
                                {(m.reference?.tactical_context?.head_to_head_count || 0) > 0 ? (
                                  <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                                    ✅ 具备 ({m.reference?.tactical_context?.head_to_head_count}场往绩)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700 font-medium">
                                    ⏳ 暂无过往交锋对赛
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 6. 近期战绩与状态走势 */}
                            <div className="p-3 flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                                  <Activity className="w-4 h-4 text-amber-400" />
                                  <span>6. 近期战绩与走势 (Recent Form)</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  主队与客队近期各项赛事近5~10场胜平负胜率与得失球
                                </div>
                              </div>
                              <div>
                                {(m.reference?.tactical_context?.home_recent_matches_count || 0) > 0 ? (
                                  <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                                    ✅ 具备 (主{m.reference?.tactical_context?.home_recent_matches_count}场/客{m.reference?.tactical_context?.away_recent_matches_count || 0}场)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                                    ❌ 缺失 (NO_RECENT_FORM_DATA)
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 7. 联赛积分榜与排名 */}
                            <div className="p-3 flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                                  <Trophy className="w-4 h-4 text-amber-400" />
                                  <span>7. 联赛积分榜与排名 (League Standings)</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  主客队联赛常规胜平负、净胜球与排名积分 (杯赛种子位提示)
                                </div>
                              </div>
                              <div>
                                {m.reference?.league_standings?.has_data ? (
                                  m.reference.league_standings.home_team?.overall?.matches_played === 0 ? (
                                    <span className="px-2.5 py-1 rounded bg-amber-950 text-amber-300 border border-amber-800 font-medium">
                                      ⚠️ 杯赛/未开赛种子位
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                                      ✅ 完整具备 (主#{m.reference.league_standings.home_team?.overall?.position ?? "-"} vs 客#{m.reference.league_standings.away_team?.overall?.position ?? "-"})
                                    </span>
                                  )
                                ) : (
                                  <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                                    ❌ 缺失 (NO_LEAGUE_STANDINGS)
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 8. 进球时间段分布 */}
                            <div className="p-3 flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                                  <Clock className="w-4 h-4 text-blue-400" />
                                  <span>8. 进球时间段分布 (Goal Distribution)</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  比赛 6 大时段 (1-15', 16-30', 31-45', 46-60', 61-75', 76-90+') 进失球特征
                                </div>
                              </div>
                              <div>
                                {m.reference?.goal_distribution?.has_data ? (
                                  <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                                    ✅ 具备 (6大时段)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                                    ❌ 缺失 (NO_GOAL_DISTRIBUTION)
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 9. 雷速主流机构赔率矩阵 */}
                            <div className="p-3 flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                                  <Target className="w-4 h-4 text-purple-400" />
                                  <span>9. 雷速主流机构赔率矩阵 (Odds Matrix)</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  主流机构欧赔初盘与即时盘、亚盘让球与大小球变盘走势
                                </div>
                              </div>
                              <div>
                                {m.reference?.odds_matrix?.initial?.asian_handicap || m.reference?.odds_matrix?.pregame?.asian_handicap || m.reference?.odds_matrix?.live?.asian_handicap ? (
                                  <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                                    ✅ 具备主流机构初变盘
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700 font-medium">
                                    ⚠️ 暂无雷速机构矩阵
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 10. 比赛环境与场地天气 */}
                            <div className="p-3 flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                                  <Info className="w-4 h-4 text-emerald-400" />
                                  <span>10. 比赛环境与场地信息 (Environment & Venue)</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  比赛球场名称、天气状况、气温与草皮条件
                                </div>
                              </div>
                              <div>
                                {m.reference?.lineups?.venue?.name ? (
                                  <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium truncate max-w-xs block text-right">
                                    ✅ 具备 ({m.reference.lineups.venue.name})
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700 font-medium">
                                    ⚠️ 暂无场地天气数据
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 11. 双源比分与状态画布校验 */}
                            <div className="p-3 flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                                  <span>11. 双源比分与状态画布校验 (Canvas Score Verification)</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  雷速画布/接口双重校验，杜绝文本行识别失真与比分冲突
                                </div>
                              </div>
                              <div>
                                {m.score.score_verified ? (
                                  <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                                    ✅ 画布/接口已核验
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                                    ❌ 未经画布校验 (SCORE_UNVERIFIED)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 缺口代码列表与风控说明 */}
                        {m.missing_reasons.length > 0 && (
                          <div className="p-3.5 bg-amber-950/40 border border-amber-900/60 rounded-lg space-y-2">
                            <h4 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 text-amber-400" />
                              当前赛事识别出的具体缺口清单 ({m.missing_reasons.length}项)
                            </h4>
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {m.missing_reasons.map((r, i) => (
                                <span key={i} className="px-2.5 py-0.5 bg-amber-900/50 border border-amber-700/60 text-amber-200 rounded font-mono text-[11px]">
                                  {r}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 1: 🎯 YBTY 盘口全集 (全场主/副盘、半场盘口、独赢) */}
                    {(activeTabByMatch[m.canonical_id] || "markets") === "markets" && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className="font-semibold text-slate-300">
                            YBTY 原始盘口体系 (法定交易源 · 纯净客观无损)
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            主队: {m.home_team_name} | 客队: {m.away_team_name}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {/* 全场让球 */}
                          <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-2">
                            <div className="text-xs font-bold text-blue-400 flex items-center justify-between">
                              <span>全场让球 (Full Spread)</span>
                              <span className="text-[10px] text-slate-500">
                                {m.markets.full_spread_subs.length > 0 ? `含 ${m.markets.full_spread_subs.length} 个副盘` : "仅主盘"}
                              </span>
                            </div>
                            {m.markets.full_spread_main ? (
                              <div className="bg-slate-900/90 p-2 rounded border border-blue-900/30 text-xs font-mono">
                                <div className="text-[11px] text-slate-400 mb-1">🔥 主盘 (Main Line)</div>
                                <div className="flex justify-between items-center text-slate-200">
                                  <span className="text-blue-400 font-semibold">{m.markets.full_spread_main.home_selection}</span>
                                  <span>主水: {m.markets.full_spread_main.home_odds}</span>
                                  <span>客水: {m.markets.full_spread_main.away_odds}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 italic py-2">暂无全场让球主盘</div>
                            )}

                            {/* 副盘列表 */}
                            {m.markets.full_spread_subs.map((sub, sIdx) => (
                              <div key={sIdx} className="bg-slate-900/50 p-1.5 rounded text-[11px] font-mono flex justify-between items-center text-slate-300 border border-slate-800/60">
                                <span className="text-slate-400">副盘 {sub.line_index + 1}: {sub.home_selection}</span>
                                <span>主 {sub.home_odds}</span>
                                <span>客 {sub.away_odds}</span>
                              </div>
                            ))}
                          </div>

                          {/* 全场大小 */}
                          <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-2">
                            <div className="text-xs font-bold text-emerald-400 flex items-center justify-between">
                              <span>全场大小 (Full Total)</span>
                              <span className="text-[10px] text-slate-500">
                                {m.markets.full_total_subs.length > 0 ? `含 ${m.markets.full_total_subs.length} 个副盘` : "仅主盘"}
                              </span>
                            </div>
                            {m.markets.full_total_main ? (
                              <div className="bg-slate-900/90 p-2 rounded border border-emerald-900/30 text-xs font-mono">
                                <div className="text-[11px] text-slate-400 mb-1">🔥 主盘 (Main Line)</div>
                                <div className="flex justify-between items-center text-slate-200">
                                  <span className="text-emerald-400 font-semibold">{m.markets.full_total_main.line} 球</span>
                                  <span>大球: {m.markets.full_total_main.over_odds}</span>
                                  <span>小球: {m.markets.full_total_main.under_odds}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 italic py-2">暂无全场大小主盘</div>
                            )}

                            {/* 副盘列表 */}
                            {m.markets.full_total_subs.map((sub, sIdx) => (
                              <div key={sIdx} className="bg-slate-900/50 p-1.5 rounded text-[11px] font-mono flex justify-between items-center text-slate-300 border border-slate-800/60">
                                <span className="text-slate-400">副盘 {sub.line_index + 1}: {sub.line}</span>
                                <span>大 {sub.over_odds}</span>
                                <span>小 {sub.under_odds}</span>
                              </div>
                            ))}
                          </div>

                          {/* 独赢与半场盘口 */}
                          <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-2">
                            <div className="text-xs font-bold text-amber-400">1X2 独赢 & 半场盘口</div>

                            {/* 1X2 独赢 */}
                            {m.markets.full_h2h ? (
                              <div className="bg-slate-900/90 p-2 rounded border border-amber-900/30 text-xs font-mono space-y-1">
                                <div className="text-[11px] text-slate-400">全场独赢 (1X2)</div>
                                <div className="flex justify-between text-slate-200">
                                  <span>主胜: <strong className="text-amber-400">{m.markets.full_h2h.home_odds}</strong></span>
                                  <span>平局: <strong className="text-amber-400">{m.markets.full_h2h.draw_odds}</strong></span>
                                  <span>客胜: <strong className="text-amber-400">{m.markets.full_h2h.away_odds}</strong></span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 italic">暂无全场独赢</div>
                            )}

                            {/* 半场盘口 */}
                            <div className="bg-slate-900/60 p-2 rounded border border-slate-800 space-y-1 text-xs font-mono">
                              <div className="text-[11px] text-slate-400">半场盘口 (Half Time)</div>
                              <div className="space-y-0.5 text-[11px] text-slate-300">
                                {m.markets.half_spread_main && (
                                  <div>半场让球: {m.markets.half_spread_main.home_selection} (主{m.markets.half_spread_main.home_odds} / 客{m.markets.half_spread_main.away_odds})</div>
                                )}
                                {m.markets.half_total_main && (
                                  <div>半场大小: {m.markets.half_total_main.line} (大{m.markets.half_total_main.over_odds} / 小{m.markets.half_total_main.under_odds})</div>
                                )}
                                {m.markets.half_h2h && (
                                  <div>半场独赢: 主{m.markets.half_h2h.home_odds} | 平{m.markets.half_h2h.draw_odds} | 客{m.markets.half_h2h.away_odds}</div>
                                )}
                                {!m.markets.half_spread_main && !m.markets.half_total_main && !m.markets.half_h2h && (
                                  <div className="text-slate-500 italic">暂无半场盘口</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 2: 📊 雷速统计增强 (实时技术统计、积分榜、进球时间分布) */}
                    {(activeTabByMatch[m.canonical_id] || "markets") === "stats" && (
                      <div className="space-y-4">
                        {m.reference ? (
                          <>
                            {/* 1. 核心攻防技术统计 (优化为单行紧凑 9 宫格) */}
                            {m.reference.stats && (
                              <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                                <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                                  <span>实时攻防与技术统计 (Live Technical Stats)</span>
                                  <span className="text-[11px] text-blue-400">
                                    主: {m.reference.leisu_home_name} vs 客: {m.reference.leisu_away_name}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-1.5 text-center text-xs font-mono">
                                  {[
                                    { label: "射门", h: m.reference.stats.shots.home, a: m.reference.stats.shots.away },
                                    { label: "射正", h: m.reference.stats.shots_on_target.home, a: m.reference.stats.shots_on_target.away },
                                    { label: "射偏", h: m.reference.stats.shots_off_target.home, a: m.reference.stats.shots_off_target.away },
                                    { label: "危攻", h: m.reference.stats.dangerous_attacks.home, a: m.reference.stats.dangerous_attacks.away },
                                    { label: "总攻", h: m.reference.stats.attacks.home, a: m.reference.stats.attacks.away },
                                    { label: "控球", h: `${m.reference.stats.possession.home}%`, a: `${m.reference.stats.possession.away}%` },
                                    { label: "角球", h: m.reference.stats.corners.home, a: m.reference.stats.corners.away },
                                    { label: "黄牌", h: m.reference.stats.yellow_cards.home, a: m.reference.stats.yellow_cards.away },
                                    { label: "红牌", h: m.reference.stats.red_cards.home, a: m.reference.stats.red_cards.away },
                                  ].map((st, sIdx) => (
                                    <div key={sIdx} className="bg-slate-900/90 p-1.5 rounded-lg border border-slate-800 flex flex-col justify-between">
                                      <div className="text-[10px] text-slate-400 font-sans truncate">{st.label}</div>
                                      <div className="flex justify-center items-center gap-1 font-bold mt-1 text-xs">
                                        <span className="text-blue-400">{st.h}</span>
                                        <span className="text-slate-600 font-normal text-[10px]">:</span>
                                        <span className="text-amber-400">{st.a}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 2. 联赛积分榜与排名 (优雅兼容杯赛/新赛季无积分数据) */}
                            {m.reference.league_standings && m.reference.league_standings.has_data && (
                              <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                                <div className="text-xs font-bold text-slate-300">
                                  🏆 联赛积分榜与排名 (League Standings)
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                  {/* 主队排名 */}
                                  {m.reference.league_standings.home_team && (() => {
                                    const overall = m.reference.league_standings.home_team.overall;
                                    const isCupOrUnstarted =
                                      overall &&
                                      overall.matches_played === 0 &&
                                      overall.points === 0 &&
                                      overall.goals_scored === 0;

                                    return (
                                      <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1">
                                        <div className="font-semibold text-blue-400 flex items-center justify-between">
                                          <span>主队: {m.reference.league_standings.home_team.team_name}</span>
                                          <span>
                                            排名: 第 {overall?.position || "-"} 名
                                          </span>
                                        </div>
                                        {isCupOrUnstarted ? (
                                          <div className="text-[11px] text-slate-400 font-mono">
                                            杯赛/淘汰赛或新赛季暂未开打，暂无常规循环积分统计 (初始种子位: 第 {overall?.position || 1} 名)
                                          </div>
                                        ) : overall ? (
                                          <div className="text-[11px] text-slate-300 font-mono">
                                            赛:<strong>{overall.matches_played}</strong> | 胜:<strong>{overall.won}</strong> | 平:<strong>{overall.draw}</strong> | 负:<strong>{overall.loss}</strong> | 进/失:<strong>{overall.goals_scored}/{overall.goals_conceded}</strong> | 积分: <strong className="text-emerald-400 text-xs">{overall.points}</strong>
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })()}

                                  {/* 客队排名 */}
                                  {m.reference.league_standings.away_team && (() => {
                                    const overall = m.reference.league_standings.away_team.overall;
                                    const isCupOrUnstarted =
                                      overall &&
                                      overall.matches_played === 0 &&
                                      overall.points === 0 &&
                                      overall.goals_scored === 0;

                                    return (
                                      <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1">
                                        <div className="font-semibold text-amber-400 flex items-center justify-between">
                                          <span>客队: {m.reference.league_standings.away_team.team_name}</span>
                                          <span>
                                            排名: 第 {overall?.position || "-"} 名
                                          </span>
                                        </div>
                                        {isCupOrUnstarted ? (
                                          <div className="text-[11px] text-slate-400 font-mono">
                                            杯赛/淘汰赛或新赛季暂未开打，暂无常规循环积分统计 (初始种子位: 第 {overall?.position || 1} 名)
                                          </div>
                                        ) : overall ? (
                                          <div className="text-[11px] text-slate-300 font-mono">
                                            赛:<strong>{overall.matches_played}</strong> | 胜:<strong>{overall.won}</strong> | 平:<strong>{overall.draw}</strong> | 负:<strong>{overall.loss}</strong> | 进/失:<strong>{overall.goals_scored}/{overall.goals_conceded}</strong> | 积分: <strong className="text-emerald-400 text-xs">{overall.points}</strong>
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}

                            {/* 3. 进球时间分布 */}
                            {m.reference.goal_distribution && m.reference.goal_distribution.has_data && (
                              <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                                <div className="text-xs font-bold text-slate-300">
                                  ⏱️ 进球时间分布 (Goal Distribution by Minutes)
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs font-mono">
                                  {(m.reference.goal_distribution.home_team.all.scored_intervals || []).map((interval, iIdx) => {
                                    const awayInterval = m.reference?.goal_distribution?.away_team.all.scored_intervals[iIdx];
                                    return (
                                      <div key={iIdx} className="bg-slate-900/80 p-2 rounded border border-slate-800">
                                        <div className="text-[10px] text-slate-500">{interval.start_minute}-{interval.end_minute}'</div>
                                        <div className="text-[11px] text-blue-400 font-semibold mt-0.5">
                                          主: {interval.goals}球 ({interval.percentage}%)
                                        </div>
                                        <div className="text-[11px] text-amber-400 font-semibold">
                                          客: {awayInterval ? `${awayInterval.goals}球 (${awayInterval.percentage}%)` : "-"}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-lg border border-slate-800">
                            未关联到雷速增强数据包 (当前比赛仅有 YBTY 盘口数据)
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 3: ⚔️ 历史交锋与阵容战意 (H2H, Recent Form & Lineups) */}
                    {(activeTabByMatch[m.canonical_id] || "markets") === "h2h" && (
                      <div className="space-y-4">
                        {m.reference ? (
                          <>
                            {/* 1. 历史交锋记录 (中文队名、全半场合并不割裂、12栅格严格居中) */}
                            <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                              <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                                <span>历史对赛交锋记录 (Head to Head)</span>
                                <span className="text-[11px] text-slate-500">
                                  共收录 {m.reference.tactical_context?.head_to_head_count || 0} 场历史交锋
                                </span>
                              </div>
                              {(m.reference.tactical_context?.h2h_raw || []).length > 0 ? (
                                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                  {m.reference.tactical_context?.h2h_raw.slice(0, 8).map((h, hIdx) => {
                                    const homeResolved = resolveH2HTeamName(h.home_team_id, m);
                                    const awayResolved = resolveH2HTeamName(h.away_team_id, m);
                                    const hScore = h.home_scores && h.home_scores.length > 0 ? h.home_scores[0] : "-";
                                    const aScore = h.away_scores && h.away_scores.length > 0 ? h.away_scores[0] : "-";
                                    const hHalf = h.home_scores && h.home_scores.length > 1 ? h.home_scores[1] : "-";
                                    const aHalf = h.away_scores && h.away_scores.length > 1 ? h.away_scores[1] : "-";
                                    const matchDate = h.match_time ? new Date(Number(h.match_time) * 1000).toISOString().slice(0, 10) : "-";

                                    return (
                                      <div key={hIdx} className="bg-slate-900/90 p-2 rounded-lg text-xs grid grid-cols-12 items-center font-mono border border-slate-800/80 hover:border-slate-700 transition-colors">
                                        {/* 日期: 2列 */}
                                        <div className="col-span-2 text-slate-400 truncate text-[11px]">
                                          <span>{matchDate}</span>
                                        </div>

                                        {/* 主队: 4列 靠右对齐 */}
                                        <div className="col-span-4 text-right pr-2 truncate">
                                          <span className={`font-medium ${homeResolved.isCurrent === 'home' ? 'text-blue-400 font-bold' : homeResolved.isCurrent === 'away' ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>
                                            {homeResolved.name}
                                          </span>
                                        </div>

                                        {/* 比分盒: 2列 绝对居中 */}
                                        <div className="col-span-2 flex justify-center items-center">
                                          <div className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-center whitespace-nowrap shadow-xs">
                                            <span className="text-slate-100 font-bold text-xs">
                                              全场 {hScore} : {aScore}
                                            </span>
                                            <span className="text-slate-500 text-[10px] ml-1">
                                              ({hHalf}:{aHalf})
                                            </span>
                                          </div>
                                        </div>

                                        {/* 客队: 4列 靠左对齐 */}
                                        <div className="col-span-4 text-left pl-2 truncate">
                                          <span className={`font-medium ${awayResolved.isCurrent === 'home' ? 'text-blue-400 font-bold' : awayResolved.isCurrent === 'away' ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>
                                            {awayResolved.name}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-xs text-slate-500 italic py-2">暂无历史交战明细</div>
                              )}
                            </div>

                            {/* 2. 近期战绩比对展板 (左主右客, 可选10-15-20-30, 全部/主/客, 联赛名筛选, 全场+半场比分) */}
                            <RecentFormComparator
                              homeTeamName={m.reference.leisu_home_name || m.home_team_name}
                              awayTeamName={m.reference.leisu_away_name || m.away_team_name}
                              homeRecentMatches={m.reference.tactical_context?.home_recent_matches || []}
                              awayRecentMatches={m.reference.tactical_context?.away_recent_matches || []}
                            />

                            {/* 3. 阵容与战意分析 (优雅占位与风险提示) */}
                            {m.reference.lineups && (() => {
                              const hasStarters =
                                (m.reference.lineups.home_starters && m.reference.lineups.home_starters.length > 0) ||
                                (m.reference.lineups.away_starters && m.reference.lineups.away_starters.length > 0);
                              const hasFormations =
                                (m.reference.lineups.home_formation && m.reference.lineups.home_formation !== "未指定") ||
                                (m.reference.lineups.away_formation && m.reference.lineups.away_formation !== "未指定");

                              if (!hasStarters && !hasFormations) {
                                return (
                                  <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 text-center py-4 space-y-1.5">
                                    <div className="text-xs text-amber-400 font-medium flex items-center justify-center gap-1.5">
                                      <Clock className="w-3.5 h-3.5" />
                                      <span>⏳ 暂无首发与阵型数据 (赛前未公布或数据源未收录)</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500">
                                      根据风控规范，缺乏正式首发与战意情报时，该场赛事最高定级为 B-/C 级，不可直接进入正式高置信串关。
                                    </p>
                                  </div>
                                );
                              }

                              return (
                                <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                                  <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                                    <span>阵容与战术情报 (Lineups & Formations)</span>
                                    <span className={`text-[11px] ${m.reference.lineups.confirmed ? "text-emerald-400" : "text-amber-400"}`}>
                                      {m.reference.lineups.confirmed ? "✅ 正式首发已确认" : "⏳ 预测首发/未确认"}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                    <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1">
                                      <div className="font-semibold text-blue-400">主队: {m.reference.leisu_home_name}</div>
                                      <div className="text-slate-400 font-mono text-[11px]">
                                        阵型: <strong>{m.reference.lineups.home_formation || "未指定"}</strong> | 
                                        主帅: {m.reference.lineups.home_manager || "未指定"} | 
                                        首发: {m.reference.lineups.home_starters?.length || 0}人
                                      </div>
                                    </div>
                                    <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1">
                                      <div className="font-semibold text-amber-400">客队: {m.reference.leisu_away_name}</div>
                                      <div className="text-slate-400 font-mono text-[11px]">
                                        阵型: <strong>{m.reference.lineups.away_formation || "未指定"}</strong> | 
                                        主帅: {m.reference.lineups.away_manager || "未指定"} | 
                                        首发: {m.reference.lineups.away_starters?.length || 0}人
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-lg border border-slate-800">
                            未关联到雷速交锋与阵容数据
                          </div>
                        )}
                      </div>
                    )}


                    {/* TAB 5: {} 完整合并 JSON (Raw Canonical JSON) */}
                    {(activeTabByMatch[m.canonical_id] || "markets") === "json" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-t-lg border border-slate-800 text-xs">
                          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                            <FileJson className="w-4 h-4 text-emerald-400" />
                            CanonicalMatch 标准合并数据实体 (纯净未计算)
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              id={`btn-copy-json-${idx}`}
                              onClick={() => handleCopySingleMatchJSON(m)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors border border-slate-700"
                            >
                              {copiedMatchId === m.canonical_id ? (
                                <>
                                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-400">已复制</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>复制 JSON</span>
                                </>
                              )}
                            </button>
                            <button
                              id={`btn-download-json-${idx}`}
                              onClick={() => handleDownloadSingleMatchJSON(m)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>下载文件</span>
                            </button>
                          </div>
                        </div>
                        <pre className="text-[11px] font-mono bg-slate-950 p-4 rounded-b-lg overflow-x-auto text-emerald-300 max-h-96 border border-t-0 border-slate-800 select-all">
                          {JSON.stringify(m, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 弹窗：数据完整度 11 维全景体检面板 (Data Completeness Diagnostic Modal) */}
      {selectedDiagnosticMatch && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-slate-900 rounded-2xl w-full max-w-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">
                    赛事数据完整度 11 维全景体检报告
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {selectedDiagnosticMatch.league_name} · {selectedDiagnosticMatch.home_team_name} vs {selectedDiagnosticMatch.away_team_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDiagnosticMatch(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* 核心状态摘要 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[11px] text-slate-500">数据定级 (Completeness Tier)</div>
                  <div className="mt-1">{getTierBadge(selectedDiagnosticMatch.completeness_tier)}</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[11px] text-slate-500">盘口覆盖与深度</div>
                  <div className="mt-1 text-sm font-bold text-blue-400 font-mono">
                    {getMarketsSummary(selectedDiagnosticMatch.markets).count} 个玩法 ({getMarketsSummary(selectedDiagnosticMatch.markets).text})
                  </div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[11px] text-slate-500">比分校验真实度</div>
                  <div className="mt-1 text-sm font-bold font-mono">
                    {selectedDiagnosticMatch.score.score_verified ? (
                      <span className="text-emerald-400">🛡️ 画布/接口已校验</span>
                    ) : (
                      <span className="text-amber-400">⚠️ 未经画布校验</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 11 维度全面清单 */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                <div className="p-3 bg-slate-900/80 border-b border-slate-800 font-semibold text-xs text-slate-200 flex items-center justify-between">
                  <span>11 维核心数据特征就绪状态检查</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {selectedDiagnosticMatch.missing_reasons.length === 0 ? "11/11 项特征全齐备" : `存在 ${selectedDiagnosticMatch.missing_reasons.length} 项数据缺口`}
                  </span>
                </div>
                <div className="divide-y divide-slate-800/80 text-xs">
                  {/* 1. 实时危攻时序走势 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-blue-400" />
                        <span>1. 实时危攻时序走势 (Attack Momentum Timeline)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        提供逐分钟攻防差值走势、危攻积分与动量斜率
                      </div>
                    </div>
                    <div>
                      {selectedDiagnosticMatch.reference?.attack_momentum?.available ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 完整具备 ({selectedDiagnosticMatch.reference.attack_momentum.segment_count}段)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                          ❌ 缺失 (NO_ATTACK_MOMENTUM)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 2. 实时攻防技术统计 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <BarChart2 className="w-4 h-4 text-blue-400" />
                        <span>2. 实时攻防技术统计 (Live Technical Stats)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        涵盖射门、射正、危攻、总攻、控球率、角球、红黄牌等 9 项指标
                      </div>
                    </div>
                    <div>
                      {selectedDiagnosticMatch.reference?.stats ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 完整具备 (9项指标)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                          ❌ 缺失 (NO_STATS)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 3. 比赛关键事件与时间轴 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-purple-400" />
                        <span>3. 比赛关键事件与时间轴 (Timeline Key Events)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        进球、红黄牌、点球、换人等时序关键事件
                      </div>
                    </div>
                    <div>
                      {(selectedDiagnosticMatch.reference?.timeline_events?.length || 0) > 0 ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 具备 ({selectedDiagnosticMatch.reference?.timeline_events?.length}个事件)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700 font-medium">
                          ⏳ 暂无事件/未发生
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 4. 阵容首发与伤停名单 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-emerald-400" />
                        <span>4. 阵容首发与伤停名单 (Lineups & Formations)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        首发阵容名单、阵型架构与伤停减员状态
                      </div>
                    </div>
                    <div>
                      {selectedDiagnosticMatch.reference?.lineups?.confirmed ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 正式首发已确认
                        </span>
                      ) : (selectedDiagnosticMatch.reference?.lineups?.home_starters?.length || 0) > 0 ? (
                        <span className="px-2.5 py-1 rounded bg-amber-950 text-amber-300 border border-amber-800 font-medium">
                          ⏳ 预测首发/未确认
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                          ❌ 缺失 (NO_LINEUP_DATA)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 5. 历史交锋往绩 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-blue-400" />
                        <span>5. 历史交锋记录 (Head to Head)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        主客两队过往历史交战对赛记录、比分与让球赢盘走势
                      </div>
                    </div>
                    <div>
                      {(selectedDiagnosticMatch.reference?.tactical_context?.head_to_head_count || 0) > 0 ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 具备 ({selectedDiagnosticMatch.reference?.tactical_context?.head_to_head_count}场往绩)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700 font-medium">
                          ⏳ 暂无过往交锋对赛
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 6. 近期战绩与状态走势 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-amber-400" />
                        <span>6. 近期战绩与走势 (Recent Form)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        主队与客队近期各项赛事近5~10场胜平负胜率与得失球
                      </div>
                    </div>
                    <div>
                      {(selectedDiagnosticMatch.reference?.tactical_context?.home_recent_matches_count || 0) > 0 ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 具备 (主{selectedDiagnosticMatch.reference?.tactical_context?.home_recent_matches_count}场/客{selectedDiagnosticMatch.reference?.tactical_context?.away_recent_matches_count || 0}场)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                          ❌ 缺失 (NO_RECENT_FORM_DATA)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 7. 联赛积分榜与排名 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        <span>7. 联赛积分榜与排名 (League Standings)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        主客队联赛常规胜平负、净胜球与排名积分 (杯赛种子位提示)
                      </div>
                    </div>
                    <div>
                      {selectedDiagnosticMatch.reference?.league_standings?.has_data ? (
                        selectedDiagnosticMatch.reference.league_standings.home_team?.overall?.matches_played === 0 ? (
                          <span className="px-2.5 py-1 rounded bg-amber-950 text-amber-300 border border-amber-800 font-medium">
                            ⚠️ 杯赛/未开赛种子位
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                            ✅ 完整具备 (主#{selectedDiagnosticMatch.reference.league_standings.home_team?.overall?.position ?? "-"} vs 客#{selectedDiagnosticMatch.reference.league_standings.away_team?.overall?.position ?? "-"})
                          </span>
                        )
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                          ❌ 缺失 (NO_LEAGUE_STANDINGS)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 8. 进球时间段分布 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-blue-400" />
                        <span>8. 进球时间段分布 (Goal Distribution)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        比赛 6 大时段 (1-15', 16-30', 31-45', 46-60', 61-75', 76-90+') 进失球特征
                      </div>
                    </div>
                    <div>
                      {selectedDiagnosticMatch.reference?.goal_distribution?.has_data ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 具备 (6大时段)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                          ❌ 缺失 (NO_GOAL_DISTRIBUTION)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 9. 雷速主流机构赔率矩阵 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-purple-400" />
                        <span>9. 雷速主流机构赔率矩阵 (Odds Matrix)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        主流机构欧赔初盘与即时盘、亚盘让球与大小球变盘走势
                      </div>
                    </div>
                    <div>
                      {selectedDiagnosticMatch.reference?.odds_matrix?.initial?.asian_handicap || selectedDiagnosticMatch.reference?.odds_matrix?.pregame?.asian_handicap || selectedDiagnosticMatch.reference?.odds_matrix?.live?.asian_handicap ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 具备主流机构初变盘
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700 font-medium">
                          ⚠️ 暂无雷速机构矩阵
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 10. 比赛环境与场地天气 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Info className="w-4 h-4 text-emerald-400" />
                        <span>10. 比赛环境与场地信息 (Environment & Venue)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        比赛球场名称、天气状况、气温与草皮条件
                      </div>
                    </div>
                    <div>
                      {selectedDiagnosticMatch.reference?.lineups?.venue?.name ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium truncate max-w-xs block text-right">
                          ✅ 具备 ({selectedDiagnosticMatch.reference.lineups.venue.name})
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700 font-medium">
                          ⚠️ 暂无场地天气数据
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 11. 双源比分与状态画布校验 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>11. 双源比分与状态画布校验 (Canvas Score Verification)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        雷速画布/接口双重校验，杜绝文本行识别失真与比分冲突
                      </div>
                    </div>
                    <div>
                      {selectedDiagnosticMatch.score.score_verified ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 画布/接口已核验
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                          ❌ 未经画布校验 (SCORE_UNVERIFIED)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 缺口代码列表与风控说明 */}
              {selectedDiagnosticMatch.missing_reasons.length > 0 && (
                <div className="p-4 bg-amber-950/40 border border-amber-900/60 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    当前赛事识别出的具体缺口清单 ({selectedDiagnosticMatch.missing_reasons.length}项)
                  </h4>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {selectedDiagnosticMatch.missing_reasons.map((r, i) => (
                      <span key={i} className="px-2.5 py-1 bg-amber-900/50 border border-amber-700/60 text-amber-200 rounded font-mono text-[11px]">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setSelectedDiagnosticMatch(null)}
                className="px-4 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition-colors border border-slate-700"
              >
                关闭体检报告
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 统一智能数据导入模态框 (Native Smart Ingress Importer & Alignment Confirmation Wizard) */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-slate-900 rounded-2xl w-full max-w-4xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* 模态框头部 */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                {importStep === 1 ? (
                  <>
                    <Upload className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                        <span>智能数据导入 (Smart Ingress Importer)</span>
                        <span className="text-[11px] px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded font-mono border border-emerald-800/50">
                          第 1 步：文件上传与特征嗅探
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        支持同时拖入或粘贴多个 JSON（自动嗅探 YBTY 滚球/赛前、雷速接口数据）
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-5 h-5 text-purple-400" />
                    <div>
                      <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                        <span>导入对齐确认向导 (Pre-Merge Alignment Wizard)</span>
                        <span className="text-[11px] px-2 py-0.5 bg-purple-950 text-purple-300 rounded font-mono border border-purple-800/50">
                          第 2 步：队名映射与别名持久化
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        在数据最终合并前集中核验两端队名，确认入库持久化别名，保障后续 11 维特征与量化计算精准无损
                      </p>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportStep(1);
                  setImportFeedback(null);
                }}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* STEP 1: 文件拖拽与自动嗅探 */}
            {importStep === 1 && (
              <>
                <div className="p-5 overflow-y-auto space-y-4">
                  {/* 智能多文件拖拽与复选上传区域 */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handleMultipleFilesSelected(e.dataTransfer.files);
                      }
                    }}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                      isDragging
                        ? "border-emerald-400 bg-emerald-950/20"
                        : "border-slate-700 hover:border-slate-500 bg-slate-950/60"
                    }`}
                    onClick={() => {
                      const input = document.getElementById("native-multi-file-input");
                      if (input) input.click();
                    }}
                  >
                    <input
                      id="native-multi-file-input"
                      type="file"
                      accept=".json"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleMultipleFilesSelected(e.target.files);
                        }
                      }}
                    />
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="p-3 bg-slate-800/80 rounded-full text-emerald-400 border border-slate-700">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">
                          拖拽或点击选择 1 个或多个 JSON 文件导入
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          系统将依据特征字段自动嗅探：<span className="text-blue-400 font-medium">YBTY滚球</span> / <span className="text-purple-400 font-medium">YBTY赛前</span> / <span className="text-emerald-400 font-medium">雷速接口数据</span>
                        </p>
                      </div>
                      <span className="text-[11px] px-3 py-1 bg-slate-800 text-slate-300 rounded-full border border-slate-700">
                        支持按住 Ctrl/Cmd 多选或同时拖入多个 .json 文件
                      </span>
                    </div>
                  </div>

                  {/* 已嗅探文件清单列表 */}
                  {sniffedFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                        <span>已识别待导入文件 ({sniffedFiles.length})</span>
                        <button
                          onClick={() => setSniffedFiles([])}
                          className="text-rose-400 hover:text-rose-300 transition-colors"
                        >
                          清空列表
                        </button>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {sniffedFiles.map((f, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {f.fileType === "ybty_live" && (
                                <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono text-[11px] shrink-0">
                                  🔴 YBTY滚球
                                </span>
                              )}
                              {f.fileType === "ybty_prematch" && (
                                <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono text-[11px] shrink-0">
                                  📅 YBTY赛前
                                </span>
                              )}
                              {f.fileType === "leisu_interface" && (
                                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono text-[11px] shrink-0">
                                  ⚡ 雷速接口
                                </span>
                              )}
                              {f.fileType === "unknown" && (
                                <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono text-[11px] shrink-0">
                                  ⚠️ 未知结构
                                </span>
                              )}
                              <span className="font-mono text-slate-200 truncate" title={f.fileName}>
                                {f.fileName}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 text-slate-400">
                              <span className="text-[11px]">
                                {f.matchCount ? `${f.matchCount} 场赛事` : `${(f.fileSize / 1024).toFixed(1)} KB`}
                              </span>
                              <span className="text-[11px] text-slate-500 hidden sm:inline">
                                {f.confidenceDesc}
                              </span>
                              <button
                                onClick={() => handleRemoveSniffedFile(idx)}
                                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded transition-colors"
                                title="移除此文件"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 纯文本/JSON 片段粘贴快捷补充 */}
                  <div className="pt-2 border-t border-slate-800/80">
                    <details className="text-xs group">
                      <summary className="cursor-pointer text-slate-400 hover:text-slate-300 font-medium flex items-center justify-between list-none py-1">
                        <span>或直接粘贴 JSON 文本片段 (可选)</span>
                        <span className="text-[10px] text-slate-500 group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={rawPastedText}
                          onChange={(e) => setRawPastedText(e.target.value)}
                          placeholder="在此直接粘贴 JSON 文本，系统将同样对其进行特征嗅探..."
                          rows={3}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y"
                        />
                        <button
                          type="button"
                          onClick={handleAddPastedText}
                          disabled={!rawPastedText.trim()}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-medium transition-colors"
                        >
                          识别并加入列表
                        </button>
                      </div>
                    </details>
                  </div>

                  {/* 状态与反馈信息 */}
                  {importFeedback && (
                    <div
                      className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                        importFeedback.success
                          ? "bg-emerald-950/60 border border-emerald-800 text-emerald-300"
                          : "bg-rose-950/60 border border-rose-800 text-rose-300"
                      }`}
                    >
                      {importFeedback.success ? (
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span>{importFeedback.message}</span>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={handleResetToSample}
                    disabled={importing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
                    title="重置为内置真实测试样本"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    重置为内置标准样本
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setShowImportModal(false);
                        setImportFeedback(null);
                      }}
                      disabled={importing}
                      className="px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleExecuteImport}
                      disabled={importing || sniffedFiles.length === 0}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-xs disabled:opacity-50"
                    >
                      {importing ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{importing ? "正在解析并对齐..." : `🚀 导入并进入对齐校验 (${sniffedFiles.length})`}</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* STEP 2: 导入对齐确认向导 (Pre-Merge Alignment & Match-level Alias Wizard) */}
            {importStep === 2 && (
              <>
                {/* 批量操作控制栏 */}
                <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        const allIds = importPendingMatches.map((m) => m.canonical_id);
                        setSelectedImportMatchIds(allIds);
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 font-medium transition-colors"
                    >
                      全选全部赛事 ({importPendingMatches.length})
                    </button>
                    <button
                      onClick={() => setSelectedImportMatchIds([])}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                    >
                      取消全选
                    </button>
                    <button
                      onClick={() => {
                        const highConfIds = importPendingMatches
                          .filter((m) => m.confidence_score >= 70 && !m.is_swapped_suspected)
                          .map((m) => m.canonical_id);
                        setSelectedImportMatchIds(highConfIds);
                      }}
                      className="px-2.5 py-1 bg-blue-950/80 hover:bg-blue-900/80 text-blue-300 rounded border border-blue-800 transition-colors font-medium"
                    >
                      选中高置信度 (≥70% 且无颠倒)
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px] flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <ArrowUpDown className="w-3 h-3 text-purple-400" />
                      已按匹配度升序（低置信/颠倒优先排在顶部）
                    </span>
                    <span>|</span>
                    <span>待核验赛事: <strong className="text-purple-300">{importPendingMatches.length}</strong> 场</span>
                    <span>|</span>
                    <span>已选中: <strong className="text-emerald-400">{selectedImportMatchIds.length}</strong> 场</span>
                  </div>
                </div>

                {/* 待核验赛事列表 (垂直上下对比结构) */}
                <div className="p-5 overflow-y-auto space-y-4 flex-1">
                  {importPendingMatches.length === 0 ? (
                    <div className="p-10 text-center text-slate-400 space-y-2 bg-slate-950/40 rounded-xl border border-slate-800/80">
                      <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
                      <p className="font-semibold text-sm text-slate-200">全部待审赛事已完成核验与对齐</p>
                      <p className="text-xs text-slate-500">
                        点击下方按钮完成最终合并，标准赛事中心将直接呈现 100% 精准对齐数据
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {importPendingMatches.map((cand, idx) => {
                        const isSelected = selectedImportMatchIds.includes(cand.canonical_id);
                        const isLiveMatch = cand.is_live || mode === "live";

                        // 联赛匹配状态配色与文案：已对齐直接标绿显示联赛名；未对齐显示匹配率
                        const getLeagueStatusBadge = () => {
                          if (cand.league_status === LeagueMatchStatus.MATCHED_BY_ALIAS) {
                            return (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-700/80">
                                {cand.league_name}
                              </span>
                            );
                          }
                          if (cand.league_status === LeagueMatchStatus.MATCHED_FUZZY) {
                            return (
                              <div className="flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950/90 text-amber-300 border border-amber-700/80">
                                  {cand.league_name}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/60">
                                  {(cand.league_similarity * 100).toFixed(0)}%
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                {cand.league_name}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800">
                                未对齐
                              </span>
                            </div>
                          );
                        };

                        return (
                          <div
                            key={cand.canonical_id}
                            className={`p-4 rounded-xl border transition-all ${
                              cand.is_swapped_suspected
                                ? "bg-rose-950/15 border-rose-700/80 shadow-md ring-1 ring-rose-600/40"
                                : isSelected
                                ? "bg-purple-950/20 border-purple-800/80 shadow-xs"
                                : "bg-slate-950/80 border-slate-800 hover:border-slate-700"
                            }`}
                          >
                            {/* 赛事头部与状态栏 */}
                            <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 mb-3 border-b border-slate-800/80">
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedImportMatchIds((prev) => [...prev, cand.canonical_id]);
                                    } else {
                                      setSelectedImportMatchIds((prev) => prev.filter((id) => id !== cand.canonical_id));
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                />

                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[11px] font-mono text-slate-400">#{idx + 1}</span>
                                  {getLeagueStatusBadge()}
                                  {cand.leisu_league && cand.leisu_league !== cand.ybty_league && (
                                    <span className="text-xs text-slate-400 font-mono">
                                      ({cand.leisu_league})
                                    </span>
                                  )}
                                  <span className="text-xs text-slate-400 font-mono">
                                    {cand.match_time}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                {cand.is_swapped_suspected && (
                                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-rose-900/80 text-rose-200 border border-rose-600 font-bold animate-pulse">
                                    <Shuffle className="w-3.5 h-3.5" />
                                    ⚠️ 疑似主客场颠倒
                                  </span>
                                )}

                                <span
                                  className={`text-[11px] px-2 py-0.5 rounded font-mono font-semibold ${
                                    cand.confidence_score >= 80
                                      ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                      : cand.confidence_score >= 60
                                      ? "bg-blue-950 text-blue-300 border border-blue-800"
                                      : "bg-amber-950 text-amber-300 border border-amber-800"
                                  }`}
                                >
                                  综合匹配度: {cand.confidence_score}%
                                </span>

                                {cand.has_unconfirmed_aliases && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-medium">
                                    待存别名
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 核心双行通栏流式对比结构 (上行: YBTY, 下行: 雷速；格式: 徽章 队名 vs 队名 比赛时间 比分) */}
                            <div className="space-y-1.5 mb-3">
                              {/* 1. YBTY 来源行 (主客队名统一使用高亮亮青色) */}
                              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-blue-950/25 border border-blue-900/40">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <span className="px-1.5 py-0.5 rounded bg-blue-900/80 text-blue-200 font-bold text-[10px] shrink-0">
                                    YBTY
                                  </span>
                                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                    <span className="font-bold text-sm text-cyan-200 tracking-tight">
                                      {cand.ybty_home}
                                    </span>
                                    <span className="text-slate-500 font-medium text-xs px-1">
                                      vs
                                    </span>
                                    <span className="font-bold text-sm text-cyan-200 tracking-tight">
                                      {cand.ybty_away}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-mono text-xs font-semibold text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800" title="开赛/时钟时间">
                                    {cand.ybty_time}
                                  </span>
                                  <span className="font-mono font-bold text-xs text-emerald-400 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 min-w-[32px] text-center" title="实时比分">
                                    {cand.ybty_score || "-"}
                                  </span>
                                </div>
                              </div>

                              {/* 2. 雷速 来源行 */}
                              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-900/80 text-emerald-200 font-bold text-[10px] shrink-0">
                                    雷速
                                  </span>
                                  {cand.leisu_home && cand.leisu_away ? (
                                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                      <span className={`font-bold text-sm tracking-tight ${cand.home_alias_hit ? "text-emerald-300" : "text-amber-200"}`}>
                                        {cand.leisu_home}
                                      </span>
                                      <span className="text-slate-500 font-medium text-xs px-1">
                                        vs
                                      </span>
                                      <span className={`font-bold text-sm tracking-tight ${cand.away_alias_hit ? "text-emerald-300" : "text-amber-200"}`}>
                                        {cand.leisu_away}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between w-full">
                                      <span className="text-rose-400 text-xs italic">尚未匹配雷速对应赛事</span>
                                      <button
                                        onClick={() => {
                                          setManualPickerMatchId(cand.canonical_id);
                                          setManualPickerSearch(cand.ybty_home);
                                        }}
                                        className="px-2 py-0.5 bg-blue-900/80 hover:bg-blue-800 text-blue-100 rounded text-xs transition-colors"
                                      >
                                        手动搜索选择...
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {cand.leisu_home && cand.leisu_away && (
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="font-mono text-xs font-semibold text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800" title="开赛/时钟时间">
                                        {cand.leisu_time || "-"}
                                      </span>
                                      <span className="font-mono font-bold text-xs text-emerald-400 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 min-w-[32px] text-center" title="实时比分">
                                        {cand.leisu_score || "-"}
                                      </span>
                                    </div>
                                )}
                              </div>
                            </div>

                            {/* 映射状态与多功能纠正操作工具栏 */}
                            <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-800/80 text-xs">
                              {/* 队名与联赛别名状态明细 */}
                              <div className="flex items-center gap-3 flex-wrap text-[11px] font-mono text-slate-400">
                                {/* 主队 */}
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-500">主队:</span>
                                  <span className={cand.home_alias_hit ? "text-emerald-400 font-semibold" : "text-amber-300"}>
                                    {cand.home_alias_hit
                                      ? "✅ 库中已收录"
                                      : cand.leisu_home
                                      ? `⚡ ${(cand.home_similarity * 100).toFixed(0)}% 相似待存`
                                      : "❌ 未匹配"}
                                  </span>
                                </div>

                                <span className="text-slate-700">|</span>

                                {/* 客队 */}
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-500">客队:</span>
                                  <span className={cand.away_alias_hit ? "text-emerald-400 font-semibold" : "text-amber-300"}>
                                    {cand.away_alias_hit
                                      ? "✅ 库中已收录"
                                      : cand.leisu_away
                                      ? `⚡ ${(cand.away_similarity * 100).toFixed(0)}% 相似待存`
                                      : "❌ 未匹配"}
                                  </span>
                                </div>

                                {/* 联赛别名是否需持久化 */}
                                {cand.league_status === LeagueMatchStatus.MATCHED_FUZZY &&
                                  cand.leisu_league &&
                                  cand.ybty_league !== cand.leisu_league && (
                                    <>
                                      <span className="text-slate-700">|</span>
                                      <button
                                        onClick={() =>
                                          handleSaveLeagueAlias(cand.ybty_league, cand.leisu_league!)
                                        }
                                        disabled={aliasUpdatingKey === `league_${cand.ybty_league}_${cand.leisu_league}`}
                                        className="text-amber-300 hover:text-amber-200 underline decoration-amber-500"
                                      >
                                        [点击持久化联赛别名 "{cand.leisu_league}"]
                                      </button>
                                    </>
                                  )}
                              </div>

                              {/* 操作按钮组 */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* 若疑似颠倒，显示专属一键纠正按钮 */}
                                {cand.is_swapped_suspected && (
                                  <button
                                    onClick={() => handleResolveSwappedMatch(cand)}
                                    disabled={aliasUpdatingKey === cand.canonical_id}
                                    className="px-3 py-1 bg-rose-700 hover:bg-rose-600 text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors shadow-xs"
                                    title="将 YBTY 主客与雷速客主对调并存入别名库"
                                  >
                                    <Shuffle className="w-3.5 h-3.5" />
                                    {aliasUpdatingKey === cand.canonical_id ? "纠正中..." : "一键纠正主客颠倒并入库"}
                                  </button>
                                )}

                                {/* 手动重新选择雷速候选 */}
                                <button
                                  onClick={() => {
                                    setManualPickerMatchId(cand.canonical_id);
                                    setManualPickerSearch(cand.ybty_home);
                                  }}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs border border-slate-700 transition-colors"
                                >
                                  更换雷速关联
                                </button>

                                {/* 解除关联 */}
                                {cand.leisu_home && (
                                  <button
                                    onClick={() => handleDissociateMatch(cand)}
                                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-300 rounded text-xs border border-slate-800 transition-colors"
                                    title="解除与雷速赛事的关联"
                                  >
                                    解除关联
                                  </button>
                                )}

                                {/* 单场确认对齐并持久化别名 */}
                                <button
                                  onClick={() => handleImportSingleMatchConfirm(cand)}
                                  disabled={aliasUpdatingKey === cand.canonical_id || cand.is_swapped_suspected}
                                  className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors shadow-xs"
                                >
                                  {aliasUpdatingKey === cand.canonical_id
                                    ? "持久化中..."
                                    : "确认此场对齐并入库"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {importFeedback && (
                    <div
                      className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                        importFeedback.success
                          ? "bg-emerald-950/60 border border-emerald-800 text-emerald-300"
                          : "bg-rose-950/60 border border-rose-800 text-rose-300"
                      }`}
                    >
                      {importFeedback.success ? (
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span>{importFeedback.message}</span>
                    </div>
                  )}
                </div>

                {/* 向导底部 */}
                <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between flex-wrap gap-2">
                  <div className="text-xs text-slate-400">
                    确认对齐将同时持久化写入该场主客队别名到 <code className="text-purple-300 font-mono">team_aliases.json</code>、联赛别名到 <code className="text-purple-300 font-mono">league_aliases.json</code>。
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleImportSkipAndFinalize}
                      className="px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
                    >
                      跳过待审并完成导入
                    </button>
                    <button
                      onClick={handleImportBatchConfirmAndFinalize}
                      disabled={importBatchProcessing}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg transition-colors shadow-xs"
                    >
                      {importBatchProcessing ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCheck className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {importBatchProcessing
                          ? "正在批量持久化并合并..."
                          : selectedImportMatchIds.length > 0
                          ? `批量确认所选赛事并完成合并 (${selectedImportMatchIds.length})`
                          : "完成导入"}
                      </span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 手动选择雷速候选赛事弹窗 (Manual Leisu Match Picker Modal) */}
      {manualPickerMatchId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 rounded-2xl w-full max-w-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  手动在雷速候选池中选择对应比赛
                </h3>
              </div>
              <button
                onClick={() => setManualPickerMatchId(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 当前待匹配 YBTY 赛事提示 */}
            {(() => {
              const curMatch = importPendingMatches.find((m) => m.canonical_id === manualPickerMatchId);
              if (!curMatch) return null;
              return (
                <div className="p-3 bg-blue-950/40 border-b border-blue-900/50 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-blue-900 text-blue-200 font-bold text-[10px]">
                      YBTY 目标
                    </span>
                    <span className="font-semibold text-slate-200">
                      [{curMatch.league_name}] {curMatch.ybty_home} VS {curMatch.ybty_away}
                    </span>
                    <span className="text-slate-400 font-mono">({curMatch.ybty_time})</span>
                  </div>
                  <div className="text-slate-400 text-[11px]">
                    选择下方任一雷速赛事将立即自动持久化主客队及联赛别名
                  </div>
                </div>
              );
            })()}

            {/* 搜索框 */}
            <div className="p-3 border-b border-slate-800 bg-slate-900">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={manualPickerSearch}
                  onChange={(e) => setManualPickerSearch(e.target.value)}
                  placeholder="输入队名或联赛名称快速检索雷速赛事池..."
                  className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            {/* 候选池列表 */}
            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {(() => {
                const curMatch = importPendingMatches.find((m) => m.canonical_id === manualPickerMatchId);
                if (!curMatch) return null;

                const filtered = leisuPool.filter((item) => {
                  if (!manualPickerSearch.trim()) return true;
                  const kw = manualPickerSearch.toLowerCase();
                  return (
                    item.home_team.toLowerCase().includes(kw) ||
                    item.away_team.toLowerCase().includes(kw) ||
                    item.competition.toLowerCase().includes(kw)
                  );
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-400 text-xs bg-slate-950/40 rounded-xl border border-slate-800/80">
                      雷速池中未检索到匹配 "{manualPickerSearch}" 的赛事
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    {filtered.map((item) => {
                      const scoreStr = item.score ? `${item.score.home} - ${item.score.away}` : "-";
                      const timeStr = item.minute !== null && item.minute !== undefined ? `${item.minute}'` : item.commence_time || item.status_text;

                      return (
                        <div
                          key={item.match_id}
                          className="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-3 text-xs transition-colors"
                        >
                          <div className="space-y-1 font-mono">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium text-[11px]">
                                {item.competition}
                              </span>
                              <span className="text-slate-400 text-[11px]">{timeStr}</span>
                              {item.is_live && (
                                <span className="px-1 py-0.2 rounded bg-red-950 text-red-400 border border-red-800 text-[10px]">
                                  滚球
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                              <span>{item.home_team}</span>
                              <span className="text-slate-500 font-normal">VS</span>
                              <span>{item.away_team}</span>
                              {item.score && (
                                <span className="text-emerald-400 font-bold ml-2">[{scoreStr}]</span>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={() => handleManualBindLeisuMatch(curMatch, item)}
                            disabled={aliasUpdatingKey === curMatch.canonical_id}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors shadow-xs"
                          >
                            {aliasUpdatingKey === curMatch.canonical_id ? "绑定中..." : "绑定此场雷速"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setManualPickerMatchId(null)}
                className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Slim Brief 弹窗 */}
      {selectedBrief && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 rounded-2xl w-full max-w-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  极简 AI 提炼包预览 (AiEvaluationBrief)
                </h3>
                <span className="text-xs px-2 py-0.5 bg-emerald-900/60 text-emerald-300 rounded font-mono font-medium border border-emerald-700/50">
                  ~250 Tokens
                </span>
              </div>
              <button
                onClick={() => setSelectedBrief(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
                <pre>{JSON.stringify(selectedBrief, null, 2)}</pre>
              </div>

              {selectedCanonical && selectedCanonical.missing_reasons.length > 0 && (
                <div className="p-3.5 bg-amber-950/40 border border-amber-900/60 rounded-xl">
                  <h4 className="text-xs font-bold text-amber-300 mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    数据缺口分析与不稳定性预警
                  </h4>
                  <ul className="text-xs text-amber-300/80 list-disc list-inside space-y-0.5">
                    {selectedCanonical.missing_reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setSelectedBrief(null)}
                className="px-4 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition-colors border border-slate-700"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
