'use client';

import { stagesForType } from '@/lib/salesOptions';
import EnquiryAttachments from '@/components/EnquiryAttachments';

/**
 * The enquiry process, top to bottom. Each stage shows where the enquiry is and
 * surfaces the data it needs: document stages embed their upload/download inline
 * (reusing EnquiryAttachments in `bare` mode), interaction stages prompt for the
 * timeline. The current stage is highlighted and the next is one click away.
 */

// Per-stage guidance + which data belongs to it.
const STAGE_META = {
  NEW:            { note: 'Capture the enquiry and upload the enquiry format.', docs: ['FORMAT_PDF', 'FORMAT_EXCEL'] },
  CONTACTED:      { note: 'Contact the customer and gather information.', activity: true },
  REVIEW:         { note: 'Review the requirement internally.', activity: true },
  CONCEPT:        { note: 'Prepare and upload the concept document.', docs: ['CONCEPT'] },
  COSTING:        { note: 'Work out and upload the costing.', docs: ['COSTING'] },
  OFFER_RELEASED: { note: 'Upload the offer and mark it sent to the customer.', docs: ['OFFER'] },
  FOLLOW_UP:      { note: 'Record follow-ups and set the next follow-up date & temperature.', activity: true },
};

const scrollToTimeline = () => document.getElementById('activity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export default function EnquiryProcess({ enquiry, canManage, busy, onPick, onDocsChanged }) {
  const flow = stagesForType(enquiry.enquiry_type);
  const closed = enquiry.stage === 'WON' || enquiry.stage === 'LOST';
  const curIdx = flow.findIndex((s) => s.value === enquiry.stage);
  const next = !closed && curIdx >= 0 && curIdx < flow.length - 1 ? flow[curIdx + 1] : null;
  const activityCount = enquiry._count?.activities ?? 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Process</h2>
        {closed && (
          <span className={`text-xs font-semibold ${enquiry.stage === 'WON' ? 'text-green-700' : 'text-red-600'}`}>
            Closed · {enquiry.stage === 'WON' ? 'Won' : 'Lost'}
          </span>
        )}
      </div>

      <div className="px-5 py-4">
        {flow.map((s, i) => {
          const state = closed || i < curIdx ? 'done' : i === curIdx ? 'current' : 'upcoming';
          const meta = STAGE_META[s.value] || {};
          const last = i === flow.length - 1;
          const clickable = canManage && !closed && state !== 'current';

          return (
            <div key={s.value} className="flex gap-3">
              {/* Node + connector */}
              <div className="flex flex-col items-center shrink-0">
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold border-2
                  ${state === 'done' ? 'bg-green-500 border-green-500 text-white'
                    : state === 'current' ? 'border-transparent text-white' : 'bg-white border-gray-300 text-gray-400'}`}
                  style={state === 'current' ? { backgroundColor: 'var(--ams-primary)' } : undefined}>
                  {state === 'done' ? '✓' : i + 1}
                </span>
                {!last && <span className={`w-0.5 flex-1 my-1 ${state === 'done' ? 'bg-green-300' : 'bg-gray-200'}`} />}
              </div>

              {/* Content */}
              <div className={`flex-1 min-w-0 ${last ? 'pb-1' : 'pb-5'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-semibold ${state === 'current' ? '' : state === 'done' ? 'text-gray-700' : 'text-gray-400'}`}
                    style={state === 'current' ? { color: 'var(--ams-primary)' } : undefined}>
                    {s.label}
                  </span>
                  {state === 'current' && <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Now</span>}
                  {clickable && (
                    <button onClick={() => onPick(s.value)} disabled={busy}
                      className="text-[11px] text-gray-400 hover:text-blue-600 cursor-pointer">move here</button>
                  )}
                </div>
                <p className={`text-xs mt-0.5 ${state === 'upcoming' ? 'text-gray-400' : 'text-gray-500'}`}>{meta.note}</p>

                {/* Stage data */}
                <div className={`mt-2 rounded-lg ${state === 'current' ? 'bg-blue-50/40 border border-blue-100 p-3' : ''}`}>
                  {meta.docs && (
                    <EnquiryAttachments enquiryId={enquiry.id} canEdit={canManage} kinds={meta.docs} bare onChanged={onDocsChanged} />
                  )}
                  {meta.activity && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">
                        {activityCount} interaction{activityCount === 1 ? '' : 's'} logged
                        {s.value === 'FOLLOW_UP' && enquiry.current_temperature ? ` · ${enquiry.current_temperature.toLowerCase()}` : ''}
                      </span>
                      <button onClick={scrollToTimeline} className="text-xs font-medium text-blue-600 hover:underline cursor-pointer">
                        {s.value === 'FOLLOW_UP' ? 'Add follow-up' : 'Log activity'} →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {next && canManage && (
          <div className="pt-1 pl-9">
            <button onClick={() => onPick(next.value)} disabled={busy}
              className="px-3 py-1.5 text-sm font-medium text-white rounded cursor-pointer"
              style={{ backgroundColor: 'var(--ams-primary)' }}>
              Move to {next.label} →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
