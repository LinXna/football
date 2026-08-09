import React, { useState } from 'react';
import { TeamAliasMap } from '../types';
import { Users, Search, Plus, CheckCircle, AlertCircle, Pencil, Trash2, X } from 'lucide-react';

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
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingCanonical, setEditingCanonical] = useState('');
  const [editingAliases, setEditingAliases] = useState('');
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);

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

  const openEditor = (key: string) => {
    setEditingKey(key);
    setEditingCanonical(key);
    setEditingAliases((manualAliases[key] || []).join('\n'));
    setMsg(null);
  };

  const handleSaveEdit = async () => {
    if (!editingKey || !editingCanonical.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const aliases = editingAliases.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
      const resp = await fetch('/api/aliases', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_canonical_name: editingKey, canonical_name: editingCanonical.trim(), aliases }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(`${data.error || '修改失败'}${Array.isArray(data.conflicts) ? `：${data.conflicts.join('；')}` : ''}`);
      setMsg({ type: 'success', text: `已将标准队名修改为“${editingCanonical.trim()}”，并同步更新球队映射。` });
      setEditingKey(null);
      await onRefresh();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || '球队名称修改失败' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAlias = (key: string) => {
    setDeleteConfirmKey(key);
  };

  const executeDeleteAlias = async (key: string) => {
    setSaving(true);
    setMsg(null);
    try {
      const resp = await fetch('/api/aliases', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonical_name: key }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || '删除失败');
      setMsg({ type: 'success', text: `已删除“${key}”及其全部别名映射。` });
      await onRefresh();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || '删除球队映射失败' });
    } finally {
      setSaving(false);
      setDeleteConfirmKey(null);
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
              映射结构为“雷速标准队名 → YBTY及其他平台别名”，YBTY原始队名仍保留在赛事数据中。
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
            <label className="block text-slate-400 mb-1">雷速/标准球队名 (Canonical Name)</label>
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
                <div className="flex items-center gap-1">
                  <button onClick={() => openEditor(key)} className="flex items-center gap-1 rounded bg-indigo-950 px-2 py-1 text-[10px] text-indigo-300 hover:bg-indigo-900">
                    <Pencil className="h-3 w-3" /> 修改
                  </button>
                  <button onClick={() => void handleDeleteAlias(key)} disabled={saving} className="flex items-center gap-1 rounded bg-rose-950 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-900 disabled:opacity-40">
                    <Trash2 className="h-3 w-3" /> 删除
                  </button>
                </div>
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

      {editingKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setEditingKey(null)}>
          <div className="w-full max-w-lg rounded-xl border border-indigo-500/40 bg-slate-950 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-100">修改球队名称与手工别名</h3>
              <button onClick={() => setEditingKey(null)} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <label className="mt-4 block text-xs text-slate-400">雷速／标准球队名</label>
            <input value={editingCanonical} onChange={(event) => setEditingCanonical(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            <label className="mt-4 block text-xs text-slate-400">手工别名（每行一个，也支持逗号或分号）</label>
            <textarea value={editingAliases} onChange={(event) => setEditingAliases(event.target.value)} rows={7} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            <div className="mt-2 text-[11px] text-sky-400">自动搜集别名会随标准队名一起迁移，不会被此处覆盖。</div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditingKey(null)} className="rounded bg-slate-800 px-4 py-2 text-xs text-slate-300">取消</button>
              <button onClick={() => void handleSaveEdit()} disabled={saving || !editingCanonical.trim()} className="rounded bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{saving ? '保存中…' : '保存修改'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setDeleteConfirmKey(null)}>
          <div className="w-full max-w-md rounded-xl border border-rose-800/60 bg-slate-900 p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-100 text-sm">确认删除球队映射？</h3>
            <p className="text-xs text-slate-300">确定删除“{deleteConfirmKey}”的整条球队映射吗？手工别名和自动别名都会被彻底删除。</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteConfirmKey(null)} className="rounded bg-slate-800 px-4 py-2 text-xs text-slate-300">取消</button>
              <button onClick={() => void executeDeleteAlias(deleteConfirmKey)} disabled={saving} className="rounded bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-40">{saving ? '删除中…' : '确定删除'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
