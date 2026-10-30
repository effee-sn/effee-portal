'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { BLOCK, waysOut } from './flowMeta';

/**
 * A block on the canvas: its kind, a one-line summary of its settings, a dot on
 * top to arrive at, and a dot per way out at the bottom (labelled when there
 * is more than one). Red when the last Check found a problem; ringed when a
 * test run passed through it.
 */
function BlockNode({ data, selected }) {
  const meta = BLOCK[data.kind] || { label: data.kind, color: '#6B7280', icon: '?' };
  const outs = waysOut(data.kind, data.settings);
  const v = data.view || {};
  const ring = v.errors?.length ? 'ring-2 ring-red-400' : v.tested ? 'ring-2 ring-amber-400' : selected ? 'ring-2 ring-[var(--ams-primary)]' : '';
  // Room for every labelled way out (e.g. a "Which stage?" with many groups).
  const width = Math.max(224, outs.length > 2 ? outs.length * 120 : 0);
  return (
    <div className={`rounded-lg border bg-white shadow-sm text-left ${ring}`} style={{ width, borderColor: v.errors?.length ? '#F87171' : '#E5E7EB' }}>
      {data.kind !== 'trigger' && <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />}
      <div className="flex items-center gap-2 px-3 py-2 rounded-t-lg text-white text-xs font-semibold" style={{ backgroundColor: meta.color }}>
        <span aria-hidden="true">{meta.icon}</span>
        <span>{meta.label}</span>
        {v.errors?.length > 0 && <span className="ml-auto rounded bg-white/90 text-red-600 px-1.5 text-[10px]">{v.errors.length} to fix</span>}
      </div>
      <p className="px-3 py-2 text-[12px] leading-snug text-gray-700 break-words">{v.summary || '…'}</p>
      {v.tested && <p className="px-3 pb-2 -mt-1 text-[11px] text-amber-700">{v.tested}</p>}
      {outs.length > 0 && (
        <div className={`relative h-6 ${outs.length > 1 ? 'border-t border-gray-100' : ''}`}>
          {outs.map((o, i) => {
            const left = `${((i + 1) / (outs.length + 1)) * 100}%`;
            return (
              <div key={o.id}>
                {o.label && <span className="absolute top-0.5 -translate-x-1/2 text-[10px] text-gray-500 whitespace-nowrap max-w-28 truncate" style={{ left }} title={o.label}>{o.label}</span>}
                <Handle type="source" id={o.id} position={Position.Bottom} title={o.label || 'next'}
                  className="!w-3 !h-3 !border-2 !border-white"
                  style={{ left, background: o.id === 'no' || o.id === 'rejected' ? '#DC2626' : o.id === 'yes' || o.id === 'approved' ? '#16A34A' : o.id === 'withdrawn' ? '#6B7280' : meta.color }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(BlockNode);
