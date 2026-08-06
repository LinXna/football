import React, { useState } from 'react';
import { TeamAliasMap } from '../types';
import { Users, Search, Plus, CheckCircle, AlertCircle } from 'lucide-react';

interface Props {
  manualAliases: TeamAliasMap;
  autoAliases: TeamAliasMap;
  onRefresh: () => void;
}

export const TeamAliasesView: React.FC<Props> = ({ manualAliases, autoAliases, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [canonicalInput, setCanonicalInput] = useState('');
  const [aliasInput, setAliasInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const combinedKeys = Array.from(new Set([...Object.keys(manualAliases), ...Object.keys(autoAliases)]));

  const filteredKeys = combinedKeys.filter((key) => {
    const term = searchTerm.toLowerCase();
    const keyMatch = key.toLowerCase().includes(term);
    const manualList = manualAliases[key] || [];
    const autoList = autoAliases[key] || [];
    const aliasMatch = manualList.some((a) => a.toLowerCase().includes(term)) || autoList.some((a) => a.toLowerCase().includes(term));
    return keyMatch || aliasMatch;
  });

  const handleAddAlias = async () => {
    if (!canonicalInput.trim() || !aliasInput.trim()) return;
    setSaving(true);
    setMsg(null);

    try {
      const resp = await fetch('/api/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical_name: canonicalInput.trim(),
          alias: aliasInput.trim(),
        }),
      });

      if (!resp.ok) {
        throw new Error('添加球队别名失败');
      }

      setMsg({ type: 'success', text: `成功添加别名 [${aliasInput.trim()}] 至 [${canonicalInput.trim()}]` });
      setAliasInput('');
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || '添加别名出错' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">球队别名与跨平台映射库 (Team Name Aliases)</h2>
            <p className="text-xs text-slate-400">
              用于 YBTY 原始队名与雷速中文/英文/当地语言别名自动双向匹配。
            </p>
          </div>
        </div>
      </div>

      {/* Add New Alias Form */}
      <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl space-y-3">
        <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-emerald-400" /> 手工补充未匹配球队别名
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">YBTY/标准球队名 (Canonical Name)</label>
            <input
              type="text"
              placeholder="例如: 蔚山HD"
              value={canonicalInput}
              onChange={(e) => setCanonicalInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">雷速/其他平台的别名 (Alias)</label>
            <input
              type="text"
              placeholder="例如: 蔚山现代 / Ulsan HD"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <button
          onClick={handleAddAlias}
          disabled={saving || !canonicalInput || !aliasInput}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow"
        >
          <Plus className="w-4 h-4" /> 写入球队别名库
        </button>

        {msg && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
              msg.type === 'success' ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/50' : 'bg-rose-950/40 text-rose-300 border border-rose-800/50'
            }`}
          >
            {msg.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}
      </div>

      {/* Alias Search Bar */}
      <div className="relative w-full">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
        <input
          type="text"
          placeholder="搜索已映射球队别名..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Aliases Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredKeys.map((key) => {
          const mList = manualAliases[key] || [];
          const aList = autoAliases[key] || [];
          return (
            <div key={key} className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl space-y-2 text-xs">
              <div className="font-bold text-slate-100 flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span>{key}</span>
                <span className="text-[10px] text-indigo-400 font-mono">标准名</span>
              </div>

              {mList.length > 0 && (
                <div>
                  <div className="text-[10px] text-emerald-400 font-semibold mb-1">手工别名:</div>
                  <div className="flex flex-wrap gap-1">
                    {mList.map((al, idx) => (
                      <span key={idx} className="bg-emerald-950/40 text-emerald-300 border border-emerald-800/50 px-2 py-0.5 rounded text-[11px]">
                        {al}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {aList.length > 0 && (
                <div>
                  <div className="text-[10px] text-sky-400 font-semibold mb-1">自动搜集别名:</div>
                  <div className="flex flex-wrap gap-1">
                    {aList.map((al, idx) => (
                      <span key={idx} className="bg-sky-950/40 text-sky-300 border border-sky-800/50 px-2 py-0.5 rounded text-[11px]">
                        {al}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
