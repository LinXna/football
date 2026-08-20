// Helper to render multiple incident pins
import React from 'react';
import { ParsedIncidentItem } from './AttackMomentumTimelineWidget';

export function renderIncidentIcons(incidents: ParsedIncidentItem[] | undefined, isTop: boolean) {
  if (!incidents || incidents.length === 0) return null;

  // Group by icon type
  // e.g. if [Corner, Corner] -> 🚩 x2
  // e.g. if [Goal, Corner] -> ⚽ 🚩
  // e.g. if [Goal, Corner, Corner] -> ⚽ 🚩x2
  const counts: { icon: string; count: number; items: ParsedIncidentItem[] }[] = [];
  const map = new Map<string, { icon: string; count: number; items: ParsedIncidentItem[] }>();

  for (const inc of incidents) {
    const key = inc.icon;
    if (!map.has(key)) {
      const entry = { icon: key, count: 1, items: [inc] };
      map.set(key, entry);
      counts.push(entry);
    } else {
      const entry = map.get(key)!;
      entry.count += 1;
      entry.items.push(inc);
    }
  }

  return (
    <div
      className={`absolute ${isTop ? '-top-4.5' : '-bottom-4.5'} flex items-center gap-0.5 z-30 transition-transform hover:scale-125`}
      title={incidents.map(i => `${i.displayMin} ${i.text}`).join('\n')}
    >
      {counts.map((c, i) => (
        <div key={i} className="flex items-center leading-none">
          <span className="text-[10px] drop-shadow select-none">{c.icon}</span>
          {c.count > 1 && (
            <span className={`text-[7.5px] font-bold ${isTop ? 'text-amber-300' : 'text-purple-300'} ml-0.5 leading-none`}>
              x{c.count}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
