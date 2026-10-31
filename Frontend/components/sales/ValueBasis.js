'use client';

/**
 * What an enquiry's value is based on — how firm the number is: the expected
 * value (an estimate), the latest offer sent, a negotiated (revised) offer, or
 * the PO once won. Shown next to the amount wherever the current value appears.
 */
const STYLE = {
  EXPECTED: 'bg-gray-100 text-gray-600',
  OFFER: 'bg-blue-50 text-blue-700',
  NEGOTIATION: 'bg-violet-50 text-violet-700',
  PO: 'bg-green-50 text-green-700',
};
const HINT = {
  EXPECTED: 'Expected value — no offer sent yet',
  OFFER: 'The latest offer sent to the customer',
  NEGOTIATION: 'The latest revised offer sent during negotiation',
  PO: 'The PO (order) value',
};

export default function ValueBasis({ basis, label, className = '' }) {
  if (!basis) return null;
  return (
    <span title={HINT[basis]} className={`inline-flex items-center px-1 py-px rounded text-[10px] font-semibold leading-tight ${STYLE[basis] || STYLE.EXPECTED} ${className}`}>
      {label || basis}
    </span>
  );
}
