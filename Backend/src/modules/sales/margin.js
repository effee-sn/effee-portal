/**
 * An offer's margin over the enquiry's final costing value — the same
 * arithmetic for the enquiry page, the flow event and the approval card.
 *
 *   margin      = offer − cost
 *   margin %    = margin ÷ offer × 100   (share of the selling price)
 *   on cost %   = margin ÷ cost  × 100   (markup)
 *
 * @param {unknown} offerValue  Decimal | number | null
 * @param {unknown} cost        Decimal | number | null
 * @returns {{ margin: number, margin_pct: number|null, markup_pct: number|null }|null} null without both values
 */
function marginOf(offerValue, cost) {
  if (offerValue === null || offerValue === undefined || cost === null || cost === undefined) return null;
  const offer = Number(offerValue); const c = Number(cost);
  if (!Number.isFinite(offer) || !Number.isFinite(c)) return null;
  const margin = Math.round((offer - c) * 100) / 100;
  const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
  return { margin, margin_pct: pct(margin, offer), markup_pct: pct(margin, c) };
}

module.exports = { marginOf };
