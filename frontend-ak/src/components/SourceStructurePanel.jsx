import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight, AlertCircle, ShieldAlert, Pencil, Check, X, Sparkles } from 'lucide-react';

/** Panel title for order / invoice / ACK header exception recovery by X12 type code. */
export function getRecoveryFormTitle(docType) {
  const raw = String(docType || '').replace(/X12\s*/gi, '').trim();
  const m = raw.match(/(\d{3})/);
  const code = m ? m[1] : (raw.length >= 3 && /^\d{3}$/.test(raw.slice(0, 3)) ? raw.slice(0, 3) : '');
  const titles = {
    '850': 'ORDER HEADER (EXCEPTION RECOVERY)',
    '855': 'ACK HEADER (EXCEPTION RECOVERY)',
    '856': 'ASN HEADER (EXCEPTION RECOVERY)',
    '810': 'INVOICE HEADER (EXCEPTION RECOVERY)',
    '820': 'REMITTANCE HEADER (EXCEPTION RECOVERY)',
    '824': 'APP ADVICE HEADER (EXCEPTION RECOVERY)',
  };
  return titles[code] || 'DOCUMENT HEADER (EXCEPTION RECOVERY)';
}

function canonicalHasErpMappingContent(canon) {
  if (!canon || typeof canon !== 'object') return false;
  const lines = canon.lineItems || canon.line_items;
  if (Array.isArray(lines) && lines.length > 0) return true;
  const h = canon.header;
  if (h && typeof h === 'object' && Object.keys(h).length > 0) return true;
  const p = canon.parties;
  if (p && typeof p === 'object' && Object.keys(p).length > 0) return true;
  const t = canon.totals;
  if (t && typeof t === 'object' && Object.keys(t).length > 0) return true;
  const a = canon.audit;
  if (a && typeof a === 'object' && Object.keys(a).length > 0) return true;
  return false;
}

/** Middle pane: canonical JSON as source of truth; optional collapsed raw segment tree for X12. */
function CanonicalShellWithOptionalSegments({ canonicalJson, children }) {
  const hasCanonical = canonicalJson && Object.keys(canonicalJson).length > 0;
  const [segmentsOpen, setSegmentsOpen] = useState(!hasCanonical);

  return (
    <div className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-2 shrink-0">
        <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
        <span className="text-[10px] font-black font-mono text-[var(--text-secondary)] uppercase tracking-widest">
          CANONICAL JSON
        </span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        {hasCanonical && (
          <div className="p-3 border-b border-[var(--border-subtle)]/80 shrink-0">
            <p className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-1">Unified representation</p>
            <pre className="font-mono text-[9px] text-violet-200/85 leading-relaxed whitespace-pre-wrap break-all max-h-[280px] overflow-y-auto rounded-lg bg-background/50 border border-[var(--border-subtle)]/80 p-2">
              {JSON.stringify(canonicalJson, null, 2)}
            </pre>
          </div>
        )}
        {children && (
          <div className="flex-1 min-h-0 flex flex-col">
            <button
              type="button"
              onClick={() => setSegmentsOpen((o) => !o)}
              className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border-subtle)]/80 text-left hover:bg-[var(--bg-surface)]/40 shrink-0"
            >
              <span className="text-[10px] font-black font-mono text-[var(--text-muted)] uppercase tracking-widest">
                Parsed segments (reference)
              </span>
              {segmentsOpen ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
            </button>
            {segmentsOpen && <div className="flex-1 overflow-y-auto min-h-0">{children}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Source Structure (AI-Corrected) panel for the EDI translator workflow.
 * Displays document type, detected format, field mappings, AI corrections,
 * and validation results (for ERP-ingested documents).
 * When source_structure is absent, renders children (e.g. parsed EDI segments for X12/EDIFACT).
 */
export function SourceStructurePanel({
  sourceStructure,
  documentType,
  detectedFormat,
  children,
  onApplyCorrections,
  onKeepOriginal,
  applyingCorrections = false,
  correctionsResolved = false,
  validationResults = [],
  canonicalJson = null,
  erpPayload = null,
  onFieldEdit = null,
  /** When true (dispatched/delivered/failed): hide validation alarms and apply/keep actions */
  suppressPostDispatchUi = false,
  /** Header PO/invoice/date forms only for Exception + HIGH header issues */
  exceptionRecoveryHeader = false,
  /** Outbound line-item pencils: Needs Review / Exception / Generated */
  outboundLineItemEditing = false,
  onHeaderCanonicalSave = null,
  documentDirection = null,
}) {
  const docType = sourceStructure?.document_type || documentType || '—';
  const format = sourceStructure?.detected_format || detectedFormat || '—';
  const fieldMappings = sourceStructure?.field_mappings || [];
  const aiCorrections = sourceStructure?.ai_corrections || [];

  const [fieldMappingExpanded, setFieldMappingExpanded] = useState(false);
  const [aiCorrectionsExpanded, setAiCorrectionsExpanded] = useState(false);

  const hasValidation = validationResults && validationResults.length > 0;
  const hasCanonical = canonicalJson && Object.keys(canonicalJson).length > 0;
  const hasErpContext = erpPayload && Object.keys(erpPayload).length > 0;
  /** Keep validation / line items / mapping summary visible when metadata or segments hydrate later. */
  const erpMappingContent =
    hasValidation ||
    hasErpContext ||
    canonicalHasErpMappingContent(canonicalJson) ||
    hasCanonical;

  // Validation + line items + summary: always before segment-only shell so parsed segments loading does not swap the UI away.
  if (!sourceStructure && erpMappingContent) {
    return (
      <ERPMappingPanel
        variant="full"
        documentType={docType}
        detectedFormat={format}
        validationResults={validationResults}
        canonicalJson={canonicalJson}
        erpPayload={erpPayload}
        onFieldEdit={onFieldEdit}
        suppressPostDispatchUi={suppressPostDispatchUi}
        exceptionRecoveryHeader={exceptionRecoveryHeader}
        outboundLineItemEditing={outboundLineItemEditing}
        onHeaderCanonicalSave={onHeaderCanonicalSave}
        documentDirection={documentDirection}
      />
    );
  }

  if (!sourceStructure && children) {
    return <CanonicalShellWithOptionalSegments canonicalJson={canonicalJson} children={children} />;
  }

  if (!sourceStructure) {
    return (
      <div className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] flex flex-col overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
          <span className="text-[10px] font-black font-mono text-[var(--text-secondary)] uppercase tracking-widest">
            CANONICAL JSON
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
          <p className="text-[11px] font-mono text-[var(--text-muted)] text-center">
            No source structure available. Re-run the pipeline for JSON/XML/CSV documents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-2 shrink-0">
        <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
        <span className="text-[10px] font-black font-mono text-[var(--text-secondary)] uppercase tracking-widest">
          CANONICAL JSON
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {erpMappingContent && (
          <ERPMappingPanel
            variant="embedded"
            documentType={docType}
            detectedFormat={format}
            validationResults={validationResults}
            canonicalJson={canonicalJson}
            erpPayload={erpPayload}
            onFieldEdit={onFieldEdit}
            suppressPostDispatchUi={suppressPostDispatchUi}
            exceptionRecoveryHeader={exceptionRecoveryHeader}
            outboundLineItemEditing={outboundLineItemEditing}
            onHeaderCanonicalSave={onHeaderCanonicalSave}
            documentDirection={documentDirection}
          />
        )}
        {/* Document metadata */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">Document Type</p>
          <p className="text-sm font-bold font-mono text-violet-300">{docType}</p>
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">Detected Format</p>
          <p className="text-sm font-mono text-[var(--text-primary)]">{format}</p>
        </div>

        {/* AI Corrections — separate box */}
        <div className="rounded-sm border border-[var(--border)] bg-[var(--bg-surface)]/30 overflow-hidden">
          <button
            onClick={() => setAiCorrectionsExpanded((e) => !e)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <span className="text-[10px] font-black font-mono text-[var(--text-secondary)] uppercase tracking-widest">
              AI Corrections
            </span>
            {aiCorrectionsExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            )}
          </button>
          {aiCorrectionsExpanded && (
            <div className="px-4 pb-4 pt-0 space-y-3">
              <div className="rounded-lg border border-[var(--border)]/60 overflow-hidden bg-background/50">
                {aiCorrections.length > 0 ? (
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="border-b border-[var(--border)]/60 bg-[var(--bg-surface)]/40">
                        <th className="text-left px-3 py-2 text-[var(--text-secondary)] font-semibold">Source</th>
                        <th className="text-left px-3 py-2 text-[var(--text-secondary)] font-semibold">Corrected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiCorrections.map((c, i) => (
                        <tr key={i} className="border-b border-[var(--border-subtle)]/80 last:border-0">
                          <td className="px-3 py-2 text-[var(--status-warn-text)]/90">{c.source || '—'}</td>
                          <td className="px-3 py-2 text-green-300/90">{c.target || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-3 py-4 text-center text-[var(--text-muted)] text-[10px] font-mono">
                    No AI corrections applied
                  </div>
                )}
              </div>
              {aiCorrections.length > 0 && (onApplyCorrections || onKeepOriginal) && !suppressPostDispatchUi && (
                <div className="flex gap-2">
                  {onApplyCorrections && (
                    <button
                      onClick={onApplyCorrections}
                      disabled={applyingCorrections || correctionsResolved}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-sm text-[11px] font-bold font-mono transition-all hover:brightness-110 disabled:opacity-70 disabled:cursor-not-allowed"
                      style={{
                        background: 'linear-gradient(135deg,#0ea5e9,#0284c7)',
                        border: '1px solid #0ea5e966',
                        color: '#fff',
                        boxShadow: '0 0 12px #0ea5e944',
                      }}
                    >
                      {applyingCorrections ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      {applyingCorrections ? 'Applying…' : 'Apply Suggestion'}
                    </button>
                  )}
                  {onKeepOriginal && (
                    <button
                      onClick={onKeepOriginal}
                      disabled={applyingCorrections || correctionsResolved}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-sm text-[11px] font-bold font-mono transition-all hover:brightness-110 disabled:opacity-70 disabled:cursor-not-allowed"
                      style={{
                        background: '#0c1a2e',
                        border: '1px solid #22d3ee44',
                        color: '#22d3ee',
                      }}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Keep Original
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Field Mapping — separate box */}
        <div className="rounded-sm border border-[var(--border)] bg-[var(--bg-surface)]/30 overflow-hidden">
          <button
            onClick={() => setFieldMappingExpanded((e) => !e)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <span className="text-[10px] font-black font-mono text-[var(--text-secondary)] uppercase tracking-widest">
              Field Mapping
            </span>
            {fieldMappingExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            )}
          </button>
          {fieldMappingExpanded && (
            <div className="px-4 pb-4 pt-0">
              <div className="rounded-lg border border-[var(--border)]/60 overflow-hidden bg-background/50">
                {fieldMappings.length > 0 ? (
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="border-b border-[var(--border)]/60 bg-[var(--bg-surface)]/40">
                        <th className="text-left px-3 py-2 text-[var(--text-secondary)] font-semibold">Source</th>
                        <th className="text-left px-3 py-2 text-[var(--text-secondary)] font-semibold">Target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fieldMappings.map((m, i) => (
                        <tr key={i} className="border-b border-[var(--border-subtle)]/80 last:border-0">
                          <td className="px-3 py-2 text-[var(--text-primary)]/90">{m.source || '—'}</td>
                          <td className="px-3 py-2 text-[var(--status-success-text)]/90">{m.target || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-3 py-4 text-center text-[var(--text-muted)] text-[10px] font-mono">
                    No field mappings
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function InlineEditCell({ value, onSave, onCancel, type = 'text' }) {
  const ref = useRef(null);
  const [draft, setDraft] = useState(
    type === 'number' && (value === 0 || value === '0') ? '0' : String(value ?? ''),
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  const commit = async () => {
    if (type === 'number') {
      if (draft === '' || draft === '-') return;
      const n = Number(draft);
      if (Number.isNaN(n)) return;
      setSubmitting(true);
      try {
        await onSave(n);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onSave(trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel(); }}
        type={type}
        step={type === 'number' ? 'any' : undefined}
        disabled={submitting}
        className="w-full bg-[var(--bg-surface)] border border-[var(--border-focus)] rounded px-1.5 py-0.5 text-[9.5px] font-mono text-[var(--text-primary)] outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 disabled:opacity-50"
      />
      <button onClick={commit} disabled={submitting} className="p-0.5 rounded hover:bg-[var(--primary)]/20 transition-colors disabled:opacity-50" title="Save">
        {submitting ? <Loader2 className="w-3 h-3 text-[var(--text-primary)] animate-spin" /> : <Check className="w-3 h-3 text-[var(--status-success-text)]" />}
      </button>
      <button onClick={onCancel} disabled={submitting} className="p-0.5 rounded hover:bg-transparent transition-colors disabled:opacity-50" title="Cancel">
        <X className="w-3 h-3 text-[var(--status-error-text)]" />
      </button>
    </span>
  );
}


function ERPMappingPanel({
  variant = 'full',
  documentType,
  detectedFormat,
  validationResults,
  canonicalJson,
  erpPayload,
  onFieldEdit,
  suppressPostDispatchUi = false,
  exceptionRecoveryHeader = false,
  outboundLineItemEditing = false,
  onHeaderCanonicalSave = null,
  documentDirection = null,
}) {
  const embedded = variant === 'embedded';
  const [mappingExpanded, setMappingExpanded] = useState(true);
  const [validationExpanded, setValidationExpanded] = useState(true);
  const [canonicalExpanded, setCanonicalExpanded] = useState(false);
  const [editingCell, setEditingCell] = useState(null);   // { lineNumber, field }
  const [saving, setSaving] = useState(false);
  const [recentlySaved, setRecentlySaved] = useState({}); // { "4-materialId": true }
  const [poDraft, setPoDraft] = useState('');
  const [dateDraft, setDateDraft] = useState('');
  const [vendorIdDraft, setVendorIdDraft] = useState('');
  const [customerIdDraft, setCustomerIdDraft] = useState('');
  const [invoiceDraft, setInvoiceDraft] = useState('');
  const [headerDirty, setHeaderDirty] = useState(false);
  const [headerSaving, setHeaderSaving] = useState(false);
  const [headerSavedOk, setHeaderSavedOk] = useState(false);
  const headerSkipSyncRef = useRef(false);
  const baselineHeaderRef = useRef({ po: '', date: '', inv: '' });

  const errorsRaw = (validationResults || []).filter(v => !v.valid);
  const errors = suppressPostDispatchUi ? [] : errorsRaw;
  const passes = (validationResults || []).filter(v => v.valid);
  const failedBlockingCount = errorsRaw.filter((e) => !e.auto_correctable).length;
  const autoFixedIssueCount = errorsRaw.filter((e) => e.auto_correctable).length;

  const header = canonicalJson?.header || {};
  const parties = canonicalJson?.parties || {};
  const lineItems = canonicalJson?.lineItems || canonicalJson?.line_items || [];
  const totals = canonicalJson?.totals || {};
  const audit = canonicalJson?.audit || {};
  const hasCanonical = canonicalJson && Object.keys(canonicalJson).length > 0;

  useEffect(() => {
    if (headerSkipSyncRef.current) return;
    const po = canonicalJson?.header?.poNumber ?? canonicalJson?.po_number ?? canonicalJson?.poNumber ?? '';
    const dt = canonicalJson?.header?.orderDate ?? canonicalJson?.date ?? '';
    const inv =
      canonicalJson?.header?.invoiceNumber ?? canonicalJson?.invoice_number ?? canonicalJson?.invoiceNumber ?? '';
    setPoDraft(po || '');
    setDateDraft(dt || '');
    setInvoiceDraft(inv || '');
    baselineHeaderRef.current = { po: po || '', date: dt || '', inv: inv || '' };
    setHeaderDirty(false);
  }, [canonicalJson]);

  const is810Doc = /\b810\b/.test(String(documentType || '').replace(/X12\s*/gi, ''));
  const isOutboundPanel = (documentDirection || '').toLowerCase() === 'outbound';

  const missingFields = canonicalJson?._missing_fields || [];
  const poMissing = missingFields.some((m) => /po/i.test(String(m)));

  const markHeaderDirty = () => {
    headerSkipSyncRef.current = true;
    setHeaderDirty(true);
    setHeaderSavedOk(false);
  };

  const revertExceptionHeader = () => {
    const b = baselineHeaderRef.current;
    setPoDraft(b.po);
    setDateDraft(b.date);
    setInvoiceDraft(b.inv);
    headerSkipSyncRef.current = false;
    setHeaderDirty(false);
    setHeaderSavedOk(false);
  };

  const saveExceptionHeader = async () => {
    if (!onHeaderCanonicalSave || !headerDirty) return;
    setHeaderSaving(true);
    setHeaderSavedOk(false);
    try {
      const body = {
        po_number: poDraft,
        order_date: dateDraft,
        vendor_id: vendorIdDraft,
        customer_id: customerIdDraft,
      };
      if (is810Doc && isOutboundPanel) {
        body.invoice_number = invoiceDraft;
      }
      await onHeaderCanonicalSave(body);
      headerSkipSyncRef.current = false;
      setHeaderDirty(false);
      setHeaderSavedOk(true);
      setTimeout(() => setHeaderSavedOk(false), 2500);
    } catch {
      /* toast from parent */
    } finally {
      setHeaderSaving(false);
    }
  };

  const severityStyle = (sevRaw) => {
    const s = String(sevRaw || '').toLowerCase();
    if (s === 'critical') return { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-[var(--status-error-text)]', badge: 'bg-transparent text-[var(--status-error-text)] border-red-500/40' };
    if (s === 'high') return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-[var(--status-warn-text)]', badge: 'bg-transparent text-[var(--status-warn-text)] border-amber-500/40' };
    if (s === 'medium') return { bg: 'bg-sky-500/8', border: 'border-sky-500/25', text: 'text-sky-300', badge: 'bg-sky-500/15 text-sky-300 border-sky-400/40' };
    return { bg: 'bg-[var(--bg-surface)]', border: 'border-[var(--border)]', text: 'text-[var(--text-secondary)]', badge: 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-focus)]' };
  };

  const autoCorrectRowStyle = () => ({
    bg: 'bg-primary/8',
    border: 'border-[var(--status-success)]',
    text: 'text-[var(--status-success-text)]',
    badge: 'bg-primary/25 text-emerald-200 border-emerald-400/50',
  });

  const getLineErrors = (lineNum, materialId) =>
    errors.filter(e =>
      (e.field || '').includes(`[${lineNum}]`) ||
      (e.message || '').includes(`line ${lineNum}`) ||
      (e.message || '').toLowerCase().includes((materialId || '').toLowerCase())
    );

  const fieldHasError = (lineNum, fieldName, materialId) =>
    errors.some(e => {
      const f = e.field || '';
      const m = (e.message || '').toLowerCase();
      if (fieldName === 'materialId') return f.includes(`[${lineNum}].materialId`) || (e.rule === 'gtin_checksum' && m.includes(materialId?.toLowerCase?.()));
      if (fieldName === 'unitPrice') return f.includes(`[${lineNum}].unitPrice`) || (e.rule === 'price_variance' && m.includes(`line ${lineNum}`));
      if (fieldName === 'quantity') return f.includes(`[${lineNum}].quantity`) || (e.rule === 'quantity_check' && m.includes(`line ${lineNum}`));
      return false;
    });

  const handleSave = async (lineNumber, field, newValue) => {
    if (!onFieldEdit) return;
    const key = `${lineNumber}-${field}`;
    setSaving(true);
    try {
      await onFieldEdit([{ lineNumber, field, value: newValue }]);
      setEditingCell(null);
      setRecentlySaved(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setRecentlySaved(prev => { const n = { ...prev }; delete n[key]; return n; }), 2000);
    } catch {
      /* DocumentDetail.handleFieldEdit toasts */
    } finally {
      setSaving(false);
    }
  };

  const isEditing = (lineNum, field) =>
    editingCell?.lineNumber === lineNum && editingCell?.field === field;

  const canEdit =
    !!onFieldEdit &&
    !suppressPostDispatchUi &&
    (exceptionRecoveryHeader || outboundLineItemEditing || errors.length > 0);

  const rowLineEditable =
    canEdit &&
    (
      (isOutboundPanel && outboundLineItemEditing) ||
      (!isOutboundPanel && (exceptionRecoveryHeader || errors.length > 0))
    );

  const recoveryTitle = getRecoveryFormTitle(documentType);

  return (
    <div
      className={
        embedded
          ? 'rounded-sm border border-[var(--border)]/70 bg-background/40 flex flex-col overflow-hidden'
          : 'rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] flex flex-col overflow-hidden'
      }
    >
      <div
        className={
          embedded
            ? 'px-3 py-2 border-b border-[var(--border-subtle)]/80 flex items-center gap-2 shrink-0 bg-[var(--bg-surface)]/30'
            : 'px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-2 shrink-0'
        }
      >
        {!embedded ? <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" /> : null}
        <span className="text-[10px] font-black font-mono text-[var(--text-secondary)] uppercase tracking-widest">
          {embedded ? 'Validation · Line items · Mapping summary' : 'CANONICAL JSON'}
        </span>
        {!suppressPostDispatchUi && errorsRaw.length > 0 ? (
          <span
            className={`ml-auto text-[9px] font-mono px-2 py-0.5 rounded border ${
              failedBlockingCount > 0
                ? 'bg-red-500/15 border-red-500/30 text-[var(--status-error-text)]'
                : 'bg-primary/12 border-emerald-500/35 text-[var(--status-success-text)]'
            }`}
          >
            {failedBlockingCount > 0
              ? `${failedBlockingCount} issue${failedBlockingCount !== 1 ? 's' : ''}`
              : `${autoFixedIssueCount} auto-fixed`}
          </span>
        ) : !suppressPostDispatchUi && validationResults?.length > 0 ? (
          <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded border bg-green-500/15 border-green-500/25 text-[var(--status-success-text)]">
            All passed
          </span>
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {exceptionRecoveryHeader && onHeaderCanonicalSave && !(is810Doc && isOutboundPanel) && (
          <div className="rounded-lg border border-amber-500/35 bg-amber-950/30 p-3 space-y-2">
            <p className="text-[9px] font-black font-mono text-[var(--status-warn-text)] uppercase tracking-widest">
              {recoveryTitle}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[9px] font-mono text-[var(--text-muted)]">PO number</span>
                <input
                  value={poDraft}
                  onChange={(e) => {
                    setPoDraft(e.target.value);
                    markHeaderDirty();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveExceptionHeader();
                    if (e.key === 'Escape') revertExceptionHeader();
                  }}
                  placeholder="Required if missing from EDI"
                  className={`w-full rounded border bg-background px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-amber-500/50 ${
                    headerDirty ? 'border-amber-400/60' : poMissing ? 'border-amber-500/60 ring-1 ring-amber-500/20' : 'border-[var(--border)]'
                  }`}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[9px] font-mono text-[var(--text-muted)]">Order date</span>
                <input
                  value={dateDraft}
                  onChange={(e) => { setDateDraft(e.target.value); markHeaderDirty(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveExceptionHeader(); if (e.key === 'Escape') revertExceptionHeader(); }}
                  placeholder="YYYYMMDD"
                  className={`w-full rounded border bg-background px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-amber-500/50 ${headerDirty ? 'border-amber-400/60' : 'border-[var(--border)]'}`}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[9px] font-mono text-[var(--status-error-text)] font-bold">Vendor ID (seller) *</span>
                <input
                  value={vendorIdDraft}
                  onChange={(e) => { setVendorIdDraft(e.target.value); markHeaderDirty(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveExceptionHeader(); if (e.key === 'Escape') revertExceptionHeader(); }}
                  placeholder="e.g. ACME001 — required"
                  className={`w-full rounded border bg-background px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-amber-500/50 ${vendorIdDraft ? 'border-emerald-500/60' : 'border-amber-500/60 ring-1 ring-amber-500/20'}`}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[9px] font-mono text-[var(--text-muted)]">Customer ID (buyer)</span>
                <input
                  value={customerIdDraft}
                  onChange={(e) => { setCustomerIdDraft(e.target.value); markHeaderDirty(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveExceptionHeader(); if (e.key === 'Escape') revertExceptionHeader(); }}
                  placeholder="e.g. WMT001"
                  className={`w-full rounded border bg-background px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-amber-500/50 ${headerDirty ? 'border-amber-400/60' : 'border-[var(--border)]'}`}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {headerDirty && !headerSaving && (
                <button
                  type="button"
                  onClick={() => saveExceptionHeader()}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold font-mono text-[var(--status-success-text)] hover:bg-primary/15"
                  title="Save header (Enter)"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save
                </button>
              )}
              {headerDirty && !headerSaving ? (
                <button
                  type="button"
                  onClick={revertExceptionHeader}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-focus)] px-2.5 py-1 text-[10px] font-bold font-mono text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                  title="Revert (Escape)"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
              ) : null}
              {headerSaving ? <Loader2 className="w-4 h-4 text-[var(--status-warn-text)] animate-spin" /> : null}
              {headerSavedOk ? <span className="text-[10px] font-mono text-[var(--status-success-text)]">Saved</span> : null}
            </div>
          </div>
        )}

        {exceptionRecoveryHeader && onHeaderCanonicalSave && is810Doc && isOutboundPanel && (
          <div className="rounded-lg border border-violet-500/35 bg-violet-950/25 p-3 space-y-2">
            <p className="text-[9px] font-black font-mono text-violet-300 uppercase tracking-widest">
              {recoveryTitle}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[9px] font-mono text-[var(--text-muted)]">Invoice number</span>
                <input
                  value={invoiceDraft}
                  onChange={(e) => {
                    setInvoiceDraft(e.target.value);
                    markHeaderDirty();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveExceptionHeader();
                    if (e.key === 'Escape') revertExceptionHeader();
                  }}
                  placeholder="Required — BIG/invoice reference"
                  className={`w-full rounded border bg-background px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-violet-500/50 ${
                    headerDirty ? 'border-violet-400/60' : 'border-[var(--border)]'
                  }`}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[9px] font-mono text-[var(--text-muted)]">PO reference</span>
                <input
                  value={poDraft}
                  onChange={(e) => {
                    setPoDraft(e.target.value);
                    markHeaderDirty();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveExceptionHeader();
                    if (e.key === 'Escape') revertExceptionHeader();
                  }}
                  placeholder="Purchase order reference"
                  className={`w-full rounded border bg-background px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-violet-500/50 ${
                    headerDirty ? 'border-violet-400/60' : 'border-[var(--border)]'
                  }`}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[9px] font-mono text-[var(--text-muted)]">Invoice / order date</span>
                <input
                  value={dateDraft}
                  onChange={(e) => {
                    setDateDraft(e.target.value);
                    markHeaderDirty();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveExceptionHeader();
                    if (e.key === 'Escape') revertExceptionHeader();
                  }}
                  placeholder="YYYYMMDD"
                  className={`w-full rounded border bg-background px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-violet-500/50 ${
                    headerDirty ? 'border-violet-400/60' : 'border-[var(--border)]'
                  }`}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[9px] font-mono text-[var(--text-muted)]">Grand total (from lines)</span>
                <input
                  readOnly
                  value={
                    totals?.grandTotal !== undefined && totals?.grandTotal !== null
                      ? String(totals.grandTotal)
                      : '—'
                  }
                  className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-[10px] font-mono text-[var(--text-secondary)] cursor-not-allowed"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {headerDirty && !headerSaving && (
                <button
                  type="button"
                  onClick={() => saveExceptionHeader()}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold font-mono text-[var(--status-success-text)] hover:bg-primary/15"
                  title="Save header (Enter)"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save
                </button>
              )}
              {headerDirty && !headerSaving ? (
                <button
                  type="button"
                  onClick={revertExceptionHeader}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-focus)] px-2.5 py-1 text-[10px] font-bold font-mono text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                  title="Revert (Escape)"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
              ) : null}
              {headerSaving ? <Loader2 className="w-4 h-4 text-violet-300 animate-spin" /> : null}
              {headerSavedOk ? <span className="text-[10px] font-mono text-[var(--status-success-text)]">Saved</span> : null}
            </div>
          </div>
        )}

        {/* Validation Results */}
        {!suppressPostDispatchUi && (validationResults || []).length > 0 && (
          <div className="rounded-lg border border-[var(--border)]/60 overflow-hidden">
            <button
              onClick={() => setValidationExpanded(e => !e)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-[var(--bg-subtle)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-[var(--status-warn-text)]" />
                <span className="text-[10px] font-black font-mono text-[var(--text-secondary)] uppercase tracking-widest">
                  Validation Rules
                </span>
                <span className="text-[9px] font-mono text-[var(--text-muted)]">
                  ({errorsRaw.length} failed · {passes.length} passed)
                </span>
              </div>
              {validationExpanded
                ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
            </button>
            {validationExpanded && (
              <div className="px-2 pb-2 space-y-1.5">
                {errors.map((v, i) => {
                  if (v.auto_correctable) {
                    const ac = autoCorrectRowStyle();
                    return (
                      <div key={`err-${i}`} className={`rounded-lg px-3 py-2.5 border ${ac.bg} ${ac.border}`}>
                        <div className="flex items-start gap-2">
                          <Sparkles className={`w-3.5 h-3.5 ${ac.text} shrink-0 mt-0.5`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-[9px] font-black font-mono px-1.5 py-0.5 rounded border ${ac.badge}`}>
                                Auto-fixed
                              </span>
                              {v.rule && (
                                <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase">
                                  {String(v.rule).replace(/_/g, ' ')}
                                </span>
                              )}
                            </div>
                            <p className={`text-[11px] font-mono ${ac.text} leading-relaxed`}>
                              {v.message}
                            </p>
                            {v.corrected_value != null && (
                              <p className="text-[9px] font-mono text-[var(--text-muted)] mt-1">
                                Corrected SE count → {v.corrected_value}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const s = severityStyle(v.severity);
                  return (
                    <div key={`err-${i}`} className={`rounded-lg px-3 py-2.5 border ${s.bg} ${s.border}`}>
                      <div className="flex items-start gap-2">
                        <AlertCircle className={`w-3.5 h-3.5 ${s.text} shrink-0 mt-0.5`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-[9px] font-black font-mono px-1.5 py-0.5 rounded border ${s.badge}`}>
                              {v.severity}
                            </span>
                            {v.rule && (
                              <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase">
                                {v.rule.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                          <p className={`text-[11px] font-mono ${s.text} leading-relaxed`}>
                            {v.message}
                          </p>
                          {v.field && (
                            <p className="text-[9px] font-mono text-[var(--text-muted)] mt-1">
                              Field: {v.field}
                            </p>
                          )}
                          {v.confidence !== undefined && v.confidence !== null && (
                            <p className="text-[9px] font-mono text-[var(--text-muted)] mt-0.5">
                              Confidence: {Math.round(v.confidence * 100)}%
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {passes.map((v, i) => (
                  <div key={`pass-${i}`} className="rounded-lg px-3 py-2 border border-green-500/20 bg-[var(--bg-subtle)] flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-success-text)] shrink-0" />
                    <span className="text-[10px] font-mono text-[var(--status-success-text)]">{v.message || v.rule}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Editable hint */}
        {!suppressPostDispatchUi && canEdit && (errors.length > 0 || exceptionRecoveryHeader || outboundLineItemEditing) && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--bg-subtle)] border border-cyan-500/15">
            <Pencil className="w-3 h-3 text-[var(--text-primary)] shrink-0" />
            <span className="text-[9px] font-mono text-[var(--text-primary)]/80">
              Click line cells or use header fields to edit. Changes save automatically (debounced) and re-validate.
            </span>
          </div>
        )}

        {/* Line Items Table */}
        {lineItems.length > 0 && (
          <div className="rounded-lg border border-[var(--border)]/60 overflow-hidden">
            <button
              onClick={() => setMappingExpanded(e => !e)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-[var(--bg-subtle)] transition-colors"
            >
              <span className="text-[10px] font-black font-mono text-[var(--text-secondary)] uppercase tracking-widest">
                Line Items ({lineItems.length})
              </span>
              {mappingExpanded
                ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
            </button>
            {mappingExpanded && (
              <div className="overflow-x-auto">
                <table className="w-full text-[9.5px] font-mono">
                  <thead>
                    <tr className="border-b border-[var(--border)]/60 bg-[var(--bg-surface)]/40">
                      <th className="text-left px-2.5 py-1.5 text-[var(--text-muted)]">#</th>
                      <th className="text-left px-2.5 py-1.5 text-[var(--text-muted)]">Material ID</th>
                      <th className="text-right px-2.5 py-1.5 text-[var(--text-muted)]">Qty</th>
                      <th className="text-left px-2.5 py-1.5 text-[var(--text-muted)]">UOM</th>
                      <th className="text-right px-2.5 py-1.5 text-[var(--text-muted)]">Unit Price</th>
                      <th className="text-center px-2.5 py-1.5 text-[var(--text-muted)]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li, i) => {
                      const lineNum = li.lineNumber || li.line_number || i + 1;
                      const materialId = li.materialId || li.product_id || '—';
                      const lineErrors = getLineErrors(lineNum, materialId);
                      const hasError = lineErrors.length > 0;

                      const matErr = fieldHasError(lineNum, 'materialId', materialId);
                      const priceErr = fieldHasError(lineNum, 'unitPrice', materialId);
                      const qtyErr = fieldHasError(lineNum, 'quantity', materialId);

                      const cellCls = (hasFieldErr, field) => {
                        const key = `${lineNum}-${field}`;
                        if (recentlySaved[key]) return 'bg-green-500/15 transition-colors duration-700';
                        if ((hasFieldErr || rowLineEditable) && canEdit) return 'cursor-pointer hover:bg-red-900/30';
                        return '';
                      };

                      const allowMat = matErr || rowLineEditable;
                      const allowQty = qtyErr || rowLineEditable;
                      const allowPrice = priceErr || rowLineEditable;
                      const allowUom = rowLineEditable;

                      return (
                        <tr key={i} className={`border-b border-[var(--border-subtle)]/60 last:border-0 ${hasError ? 'bg-red-900/10' : ''}`}>
                          <td className="px-2.5 py-2 text-[var(--text-muted)]">{lineNum}</td>

                          {/* Material ID */}
                          <td
                            className={`px-2.5 py-2 ${matErr ? 'text-red-300' : 'text-[var(--text-primary)]/90'} ${cellCls(matErr, 'materialId')}`}
                            onClick={() => allowMat && canEdit && !saving && setEditingCell({ lineNumber: lineNum, field: 'materialId' })}
                          >
                            {isEditing(lineNum, 'materialId') ? (
                              <InlineEditCell
                                value={materialId}
                                onSave={v => handleSave(lineNum, 'materialId', v)}
                                onCancel={() => setEditingCell(null)}
                              />
                            ) : (
                              <>
                                {materialId}
                                {matErr && <AlertCircle className="inline w-3 h-3 ml-1.5 text-[var(--status-error-text)]" />}
                                {allowMat && canEdit && <Pencil className="inline w-2.5 h-2.5 ml-1 text-[var(--status-error-text)]/50" />}
                              </>
                            )}
                          </td>

                          {/* Quantity */}
                          <td
                            className={`px-2.5 py-2 text-right ${qtyErr ? 'text-red-300' : 'text-[var(--text-primary)]'} ${cellCls(qtyErr, 'quantity')}`}
                            onClick={() => allowQty && canEdit && !saving && setEditingCell({ lineNumber: lineNum, field: 'quantity' })}
                          >
                            {isEditing(lineNum, 'quantity') ? (
                              <InlineEditCell
                                value={li.quantity || li.qty || 0}
                                type="number"
                                onSave={v => handleSave(lineNum, 'quantity', v)}
                                onCancel={() => setEditingCell(null)}
                              />
                            ) : (
                              <>
                                {li.quantity || li.qty || '—'}
                                {allowQty && canEdit && <Pencil className="inline w-2.5 h-2.5 ml-1 text-[var(--status-error-text)]/50" />}
                              </>
                            )}
                          </td>

                          <td
                            className={`px-2.5 py-2 text-[var(--text-secondary)] ${cellCls(false, 'uom')}`}
                            onClick={() => allowUom && canEdit && !saving && setEditingCell({ lineNumber: lineNum, field: 'uom' })}
                          >
                            {isEditing(lineNum, 'uom') ? (
                              <InlineEditCell
                                value={li.uom || li.unit || ''}
                                onSave={(v) => handleSave(lineNum, 'uom', v)}
                                onCancel={() => setEditingCell(null)}
                              />
                            ) : (
                              <>
                                {li.uom || li.unit || '—'}
                                {allowUom && canEdit && <Pencil className="inline w-2.5 h-2.5 ml-1 text-[var(--text-muted)]/80" />}
                              </>
                            )}
                          </td>

                          {/* Unit Price */}
                          <td
                            className={`px-2.5 py-2 text-right ${priceErr ? 'text-[var(--status-warn-text)] font-bold' : li.varianceFlag ? 'text-[var(--status-warn-text)] font-bold' : 'text-[var(--status-success-text)]/90'} ${cellCls(priceErr, 'unitPrice')}`}
                            onClick={() => allowPrice && canEdit && !saving && setEditingCell({ lineNumber: lineNum, field: 'unitPrice' })}
                          >
                            {isEditing(lineNum, 'unitPrice') ? (
                              <InlineEditCell
                                value={Number(li.unitPrice || li.unit_price || 0).toFixed(2)}
                                type="number"
                                onSave={v => handleSave(lineNum, 'unitPrice', v)}
                                onCancel={() => setEditingCell(null)}
                              />
                            ) : (
                              <>
                                ${Number(li.unitPrice || li.unit_price || 0).toFixed(2)}
                                {(priceErr || li.varianceFlag) && <span className="ml-1 text-[var(--status-warn-text)]">⚠</span>}
                                {allowPrice && canEdit && <Pencil className="inline w-2.5 h-2.5 ml-1 text-[var(--status-warn-text)]/50" />}
                              </>
                            )}
                          </td>

                          <td className="px-2.5 py-2 text-center">
                            {hasError
                              ? <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-transparent text-[var(--status-error-text)] border border-red-500/30">FAIL</span>
                              : <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-green-500/15 text-[var(--status-success-text)] border border-green-500/25">OK</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Header & Parties Summary */}
        <div className="rounded-lg border border-[var(--border)]/60 bg-[var(--bg-surface)]/30 p-3 space-y-2">
          <p className="text-[9px] font-black font-mono text-[var(--text-muted)] uppercase tracking-widest">Mapping Summary</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
            {(header.poNumber || canonicalJson?.po_number || canonicalJson?.poNumber) && (
              <>
                <span className="font-mono text-[var(--text-muted)]">PO Number</span>
                <span className="font-mono text-[var(--text-primary)] text-right">
                  {header.poNumber || canonicalJson?.po_number || canonicalJson?.poNumber}
                </span>
              </>
            )}
            {header.invoiceNumber && (
              <>
                <span className="font-mono text-[var(--text-muted)]">Invoice #</span>
                <span className="font-mono text-[var(--text-primary)] text-right">{header.invoiceNumber}</span>
              </>
            )}
            {header.currency && (
              <>
                <span className="font-mono text-[var(--text-muted)]">Currency</span>
                <span className="font-mono text-[var(--text-primary)] text-right">{header.currency}</span>
              </>
            )}
            {parties?.seller?.name && (
              <>
                <span className="font-mono text-[var(--text-muted)]">Seller</span>
                <span className="font-mono text-[var(--text-primary)]/80 text-right">{parties.seller.name}</span>
              </>
            )}
            {parties?.buyer?.name && (
              <>
                <span className="font-mono text-[var(--text-muted)]">Buyer</span>
                <span className="font-mono text-[var(--text-primary)]/80 text-right">{parties.buyer.name}</span>
              </>
            )}
            {totals.grandTotal !== undefined && (
              <>
                <span className="font-mono text-[var(--text-muted)]">Grand Total</span>
                <span className="font-mono text-[var(--status-success-text)] text-right font-bold">${Number(totals.grandTotal).toLocaleString()}</span>
              </>
            )}
            {audit.confidence && (
              <>
                <span className="font-mono text-[var(--text-muted)]">AI Confidence</span>
                <span className="font-mono text-[var(--text-secondary)] text-right font-bold">{Math.round(audit.confidence * 100)}%</span>
              </>
            )}
          </div>
        </div>

        {/* Full Canonical JSON (collapsible) */}
        {hasCanonical && (
          <div className="rounded-lg border border-[var(--border)]/60 overflow-hidden">
            <button
              onClick={() => setCanonicalExpanded(e => !e)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-[var(--bg-subtle)] transition-colors"
            >
              <span className="text-[10px] font-black font-mono text-[var(--text-secondary)] uppercase tracking-widest">
                Full Canonical JSON
              </span>
              {canonicalExpanded
                ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
            </button>
            {canonicalExpanded && (
              <pre className="px-3 pb-3 font-mono text-[9px] text-violet-300/70 leading-relaxed whitespace-pre-wrap break-all max-h-[240px] overflow-y-auto">
                {JSON.stringify(canonicalJson, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
