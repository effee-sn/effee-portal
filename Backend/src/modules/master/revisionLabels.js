const { settingsRepository } = require('../settings/settings.repository');

/**
 * How drawing revisions are labelled — subassemblies and Finished parts alike
 * (Administrator → Configuration → Revisions):
 *
 *   - scheme LETTERS (A, B … Z, AA) or NUMBERS (00, 01 …);
 *   - first release ORIGINAL: the first revision is just the drawing no.,
 *     labelled e.g. "Original", and the first change is A / 01. REV: the first
 *     revision is already A / 00.
 *
 * A revision keeps the label it was given; a change here applies to revisions
 * made from then on.
 */

const SCHEMES = Object.freeze(['LETTERS', 'NUMBERS']);
const FIRST_RELEASE = Object.freeze(['ORIGINAL', 'REV']);
const DEFAULT_ORIGINAL = 'Original';

/** 1 → A … 26 → Z, 27 → AA. */
function letters(n) {
  let s = ''; let k = n;
  while (k > 0) { k -= 1; s = String.fromCharCode(65 + (k % 26)) + s; k = Math.floor(k / 26); }
  return s;
}

/**
 * The label of the n-th revision.
 * @param {{ scheme: string, first: string, originalLabel: string }} cfg @param {number} seq
 */
function labelFor(cfg, seq) {
  const numbers = cfg.scheme === 'NUMBERS';
  if (cfg.first === 'REV') return numbers ? String(seq - 1).padStart(2, '0') : letters(seq);
  if (seq === 1) return cfg.originalLabel || DEFAULT_ORIGINAL;
  return numbers ? String(seq - 1).padStart(2, '0') : letters(seq - 1);
}

/** A letter / number label reads "Rev A", "Rev 01"; the first release's reads as itself ("Original"). */
const revName = (rev) => {
  if (rev === null || rev === undefined || rev === '') return '';
  return /^([A-Z]{1,3}|\d+)$/.test(String(rev)) ? `Rev ${rev}` : String(rev);
};

/** The settings in force. */
async function loadRevisionConfig() {
  const s = await settingsRepository.getOrCreate();
  return {
    id: s.id,
    scheme: SCHEMES.includes(s.revision_scheme) ? s.revision_scheme : 'LETTERS',
    first: FIRST_RELEASE.includes(s.revision_first_release) ? s.revision_first_release : 'ORIGINAL',
    originalLabel: s.revision_original_label || DEFAULT_ORIGINAL,
  };
}

module.exports = { SCHEMES, FIRST_RELEASE, DEFAULT_ORIGINAL, labelFor, revName, loadRevisionConfig };
