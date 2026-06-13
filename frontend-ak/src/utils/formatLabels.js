/**
 * Display helpers for inbound/outbound format badges and document table.
 */

function _upper(s) {
  return String(s || '').trim().toUpperCase();
}

/** Short label for pipeline monitor / table: EDI | JSON | XML | CSV */
export function inboundFormatShortFromDoc(doc) {
  const meta = doc?.metadata || {};
  const raw = doc?.raw_edi || '';
  const code =
    meta.inbound_source_format ||
    doc?.detected_format ||
    meta.detected_standard ||
    meta.source_structure?.detected_format ||
    '';
  return inboundFormatShort(code, raw);
}

export function inboundFormatShort(code, raw = '') {
  const c = _upper(code);
  if (c.includes('JSON') || c === 'SAP_IDOC') return 'JSON';
  if (c.includes('XML')) return 'XML';
  if (c.includes('CSV')) return 'CSV';
  if (c.includes('EDIFACT') || c.includes('UNB')) return 'EDI';
  if (c.includes('X12') || c.includes('EDI')) return 'EDI';
  const t = String(raw || '').trim();
  if (t.startsWith('{') || t.startsWith('[')) return 'JSON';
  if (t.startsWith('<?xml') || (t.startsWith('<') && !t.startsWith('ISA'))) return 'XML';
  if (t.startsWith('UNB') || t.startsWith('UNA')) return 'EDI';
  if (t.startsWith('ISA')) return 'EDI';
  const head = t.split(/\r?\n/).find(Boolean) || '';
  if (head.includes('\t') || (head.includes(',') && !head.startsWith('ISA'))) return 'CSV';
  return 'EDI';
}

/** Badge text for document detail headers: [EDI X12], [JSON], … */
export function inboundFormatBadgeLabel(code) {
  const c = _upper(code).replace(/\s+/g, '_');
  if (c === 'EDI_X12' || c === 'X12') return 'EDI X12';
  if (c === 'EDIFACT') return 'EDIFACT';
  if (c === 'JSON') return 'JSON';
  if (c === 'XML') return 'XML';
  if (c === 'CSV') return 'CSV';
  if (c.includes('JSON')) return 'JSON';
  if (c.includes('XML')) return 'XML';
  if (c.includes('CSV')) return 'CSV';
  if (c.includes('EDIFACT')) return 'EDIFACT';
  if (c.includes('X12') || c.includes('EDI')) return 'EDI X12';
  return code ? String(code) : '—';
}

export function outboundFormatBadgeLabel(code) {
  const c = _upper(code).replace(/\s+/g, '_');
  if (c === 'EDI_X12' || c === 'X12') return 'EDI X12';
  if (c === 'EDIFACT') return 'EDIFACT';
  if (c === 'JSON') return 'JSON';
  if (c === 'XML') return 'XML';
  if (c === 'CSV') return 'CSV';
  return code ? String(code) : 'EDI X12';
}

export function contentLooksLikeX12(s) {
  return String(s || '').trim().startsWith('ISA');
}
