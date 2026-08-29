'use client';

import { stagesForType } from '@/lib/salesOptions';

/**
 * Horizontal pipeline tracker for an enquiry — shows where it is now, marks the
 * completed steps, and offers the next move. Stage data is shown in the panels
 * below (timeline, documents), not inline here.
 */

const STAGE_HINT = {
  NEW:            'Capture the enquiry and upload the enquiry format.',
  CONTACTED:      'Contact the customer and gather information.',
  REVIEW:         'Review the requirement internally.',
  CONCEPT:        'Prepare and upload the concept document.',
  COSTING:        'Work out and upload the costing.',
  OFFER_RELEASED: 'Upload the offer and mark it sent to the customer.',
  FOLLOW_UP:      'Record follow-ups and set the next follow-up date & temperature.',
};

export default function EnquiryProcess({ enquiry, canManage, busy, onPick }) {
  const flow = stagesForType(enquiry.enquiry_type);
  const closed = enquiry.stage === 'WON' || enquiry.stage === 'LOST';
  const curIdx = flow.findIndex((s) => s.value === enquiry.stage);
  const next = !closed && curIdx >= 0 && curIdx < flow.length - 1 ? flow[curIdx + 1] : null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
      {/* Stepper */}
      <div className="flex items-center overflow-x-auto pb-1">
        {flow.map((s, i) => {
          const state = closed || i < curIdx ? 'done' : i === curIdx ? 'current' : 'upcoming';
          const clickable = canManage && !closed && s.value !== enquiry.stage;
          return (
            <div key={s.value} className="flex items-center shrink-0">
              {i > 0 && <div className={`h-0.5 w-5 sm:w-10 ${closed || i <= curIdx ? 'bg-green-300' : 'bg-gray-200'}`} />}
              <button type="button" disabled={!clickable || busy} onClick={() => clickable && onPick(s.value)}
                title={clickable ? `Move to ${s.label}` : s.label}
                className={`flex flex-col items-center gap-1 px-1.5 ${clickable ? 'cursor-pointer group' : 'cursor-default'}`}>
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 transition
                  ${state === 'done' ? 'bg-green-500 border-green-500 text-white'
                    : state === 'current' ? 'border-transparent text-white'
                    : 'bg-white border-gray-300 text-gray-400 group-hover:border-blue-400'}`}
                  style={state === 'current' ? { backgroundColor: 'var(--ams-primary)' } : undefined}>
                  {state === 'done' ? '✓' : i + 1}
                </span>
                <span className={`text-[11px] whitespace-nowrap ${state === 'current' ? 'font-semibold' : 'text-gray-500'}`}
                  style={state === 'current' ? { color: 'var(--ams-primary)' } : undefined}>
                  {s.label}
                </span>
              </button>
            </div>
          );
        })}
        {closed && (
          <div className="flex items-center shrink-0">
            <div className="h-0.5 w-5 sm:w-10 bg-green-300" />
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold text-white ${enquiry.stage === 'WON' ? 'bg-green-600' : 'bg-red-600'}`}>
              {enquiry.stage === 'WON' ? 'Won' : 'Lost'}
            </span>
          </div>
        )}
      </div>

      {/* Now / what's next */}
      {!closed && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-600 min-w-0">
            <span className="font-semibold text-gray-800">Now: {flow[curIdx]?.label || '—'}</span>
            {STAGE_HINT[enquiry.stage] ? ` — ${STAGE_HINT[enquiry.stage]}` : ''}
          </p>
          {next && canManage && (
            <button onClick={() => onPick(next.value)} disabled={busy}
              className="px-3 py-1.5 text-sm font-medium text-white rounded cursor-pointer shrink-0"
              style={{ backgroundColor: 'var(--ams-primary)' }}>
              Move to {next.label} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
