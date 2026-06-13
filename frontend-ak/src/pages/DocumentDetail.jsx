import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Download, RefreshCw, Send, AlertCircle, CheckCircle2,
  ChevronRight, ChevronDown, Loader2, Sparkles, XCircle, Info,
  ClipboardCheck, Zap, Wrench, FileCode, Braces, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { documentsService } from '@/services/documents';
import { correctionsService } from '@/services/corrections';
import { OutboundProcessingModal } from '@/components/OutboundProcessingModal';
import { SourceStructurePanel } from '@/components/SourceStructurePanel';
import { GeneratedEDIPanel } from '@/components/GeneratedEDIPanel';
import { getDisplayDirection } from '@/utils/directionMatrix';
import {
  inboundFormatBadgeLabel,
  inboundFormatShortFromDoc,
  outboundFormatBadgeLabel,
} from '@/utils/formatLabels';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';

// ─────────────────────────────────────────────────────────────────────────────
// Tiny helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

/** Read line item field from canonical JSON before a user edit (for learning-loop corrections). */
function getCanonicalLineField(canonical, lineNumber, field) {
  if (!canonical) return null;
  const lines = canonical.lineItems || canonical.line_items || [];
  const li = lines.find(
    (l) =>
      (l.lineNumber ?? l.line_number) === lineNumber ||
      (l.lineNumber ?? l.line_number) === Number(lineNumber),
  );
  if (!li) return null;
  if (field === 'materialId') return li.materialId ?? li.product_id ?? null;
  if (field === 'unitPrice') return li.unitPrice ?? li.unit_price ?? null;
  if (field === 'quantity') return li.quantity ?? li.qty ?? null;
  return li[field] ?? null;
}

const confColor = (c) => {
  if (c >= 1.0) return 'var(--status-success-text)';
  if (c >= 0.9) return 'var(--status-success-text)';
  if (c >= 0.75) return '#facc15';
  return 'var(--status-error-text)';
};

/** Case-insensitive status compare */
function statusIsOneOf(s, ...labels) {
  const n = (s || '').trim().toLowerCase();
  return labels.some((l) => n === (l || '').trim().toLowerCase());
}

function isDispatchSuccessStatus(s) {
  return statusIsOneOf(s, 'Dispatched', 'Delivered');
}

function isFailedStatus(s) {
  return statusIsOneOf(s, 'Failed');
}

/** Open exception rows that should drive a red "Exception" badge (not minor / warning-class). */
function exceptionIsBlocking(exc) {
  if (!exc || (exc.status && exc.status !== 'Open')) return false;
  const sev = String(exc.severity || '').toLowerCase();
  if (sev === 'high' || sev === 'critical' || sev === 'error') return true;
  const t = String(exc.exception_type || '').toLowerCase();
  return t.includes('blocking') || t.includes('fatal');
}

function isHighCriticalValidationIssue(i) {
  if (!i) return false;
  const sev = String(i.severity || '').toLowerCase();
  return sev === 'high' || sev === 'critical';
}

/** HIGH/Critical issues that target document header (PO, invoice, envelope) — drives recovery form only. */
function isHeaderExceptionRecoveryIssue(i) {
  if (!isHighCriticalValidationIssue(i)) return false;
  const code = String(i.code || '').toUpperCase().replace(/-/g, '_');
  const rule = String(i.rule || '');
  const field = String(i.field || '').toLowerCase();
  if (
    ['MISSING_MANDATORY_FIELD', 'MISSING_MANDATORY_SEGMENT', 'BLANK_PO_NUMBER', 'MISSING_INVOICE_NUMBER'].includes(
      code,
    )
  ) {
    return true;
  }
  if (rule === 'mandatory_field' && field && field !== 'line_items') {
    return true;
  }
  return false;
}

/** Hide AI suggestion banners, segment NEEDS REVIEW, validation alarm UI */
function suppressAiSuggestionWorkflow(s) {
  return isDispatchSuccessStatus(s) || isFailedStatus(s);
}

const PROCESSING_STATUS_LABELS = [
  'Received', 'Parsed', 'Validated', 'Canonical Generated', 'Routing', 'Delivering',
  'Created',
];

function isProcessingStatus(s) {
  const n = (s || '').trim().toLowerCase();
  return PROCESSING_STATUS_LABELS.some((l) => n === l.toLowerCase());
}

function formatBannerTimestamp(isoOrDate) {
  if (!isoOrDate) return '—';
  try {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  } catch {
    return '—';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    Completed:    'var(--status-success-text)',
    'Needs Review': '#facc15',
    Exception:    '#f97316',
    Failed:       'var(--status-error-text)',
    Duplicate:    'var(--status-error-text)',
    'Ready for Dispatch': '#22d3ee',
    Dispatched:  'var(--status-success-text)',
    Delivered:   'var(--status-success-text)',
    Routing:     '#94a3b8',
    Delivering:  '#94a3b8',
  };
  const c = map[status] || '#94a3b8';
  return (
    <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded border"
      style={{ background: c + '18', borderColor: c + '55', color: c }}>
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export const DocumentDetail = () => {
  const { confirm } = useConfirmDialog();
  const { id }   = useParams();
  const navigate = useNavigate();

  // ── server state ──────────────────────────────────────────────────────────
  const [loading, setLoading]       = useState(true);
  const [doc, setDoc]               = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [partner, setPartner]       = useState(null);
  const [error, setError]           = useState(null);

  // ── local UI state ────────────────────────────────────────────────────────
  const [expanded, setExpanded]   = useState([]);             // set of segment keys
  const [resolved, setResolved]   = useState({});             // idx → 'applied'|'kept'
  const [showCorrections, setShowCorrections] = useState(true); // Check Corrections: show old/new fields
  const [canonical, setCanonical] = useState(null);
  const [localConf, setLocalConf] = useState(null);           // override after resolution
  const [x12Output, setX12Output] = useState(null);            // generated EDI X12 (x12_output only)
  const [rawInputContent, setRawInputContent] = useState(''); // GET /raw-input — never mixed with generated
  const [x12OutputStatus, setX12OutputStatus] = useState('pending');
  const [x12DispatchedAt, setX12DispatchedAt] = useState(null);
  const [x12PanelError, setX12PanelError] = useState(null);
  const [showX12Diff, setShowX12Diff] = useState(false);
  const [correctionsResolved, setCorrectionsResolved] = useState(false); // true after Apply or Keep Original
  const [related, setRelated] = useState(null); // linked PO/Invoice and SLA data

  // ── in-flight flags ───────────────────────────────────────────────────────
  const [applying, setApplying]   = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generatingX12, setGeneratingX12] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [sending, setSending]     = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [outboundModal, setOutboundModal] = useState(null); // { outboundId, fileName }

  const inferGeneratedStatus = useCallback((d) => {
    const has = (d?.x12_output || '').trim();
    if (!has) return { status: 'pending', at: null };
    const st = d?.status || '';
    if (['Dispatched', 'Delivered'].includes(st)) {
      return { status: 'dispatched', at: d?.delivered_at || null };
    }
    return { status: 'generated', at: null };
  }, []);

  const refreshSplitPanels = useCallback(
    async (docSnapshot) => {
      if (!id || !docSnapshot) return;
      try {
        const raw = await documentsService.getRawInput(id);
        setRawInputContent(raw?.content ?? '');
      } catch {
        setRawInputContent(docSnapshot.raw_edi ?? '');
      }
      try {
        const g = await documentsService.getGeneratedX12(id);
        const content = g?.edi_content || null;
        setX12Output(content);
        setX12OutputStatus(g?.status || (content ? 'generated' : 'pending'));
        setX12DispatchedAt(g?.dispatched_at || null);
      } catch {
        const inf = inferGeneratedStatus(docSnapshot);
        const fallback = (docSnapshot.x12_output || '').trim() || null;
        setX12Output(fallback);
        setX12OutputStatus(fallback ? inf.status : 'pending');
        setX12DispatchedAt(inf.at ? (typeof inf.at === 'string' ? inf.at : new Date(inf.at).toISOString()) : null);
      }
    },
    [id, inferGeneratedStatus],
  );

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setX12PanelError(null);
    try {
      const data = await documentsService.getReview(id);
      setDoc(data.document);
      setExceptions(data.exceptions || []);
      const st = data.document?.status;
      const terminal = suppressAiSuggestionWorkflow(st);
      const sugFromApi = data.ai_suggestions || [];
      setSuggestions(terminal ? [] : sugFromApi);
      setPartner(data.partner);
      setCanonical(data.document?.canonical_json || null);
      setLocalConf(null);
      setCorrectionsResolved(!!data.document?.metadata?.ai_corrections_resolved);
      await refreshSplitPanels(data.document);

      // Auto-expand segments flagged by AI suggestions (not after dispatch / terminal)
      const suggForExpand = terminal ? [] : sugFromApi;
      const problemSegs = new Set(suggForExpand.map(s => s.segment_id).filter(Boolean));
      const segs = data.document?.parsed_segments || [];
      const autoExpand = segs
        .map((s, i) => `${s.segment_id}-${i}`)
        .filter((_, i) => problemSegs.has(segs[i]?.segment_id));
      setExpanded(autoExpand.length ? autoExpand : segs.slice(0, 1).map((s, i) => `${s.segment_id}-${i}`));
    } catch {
      try {
        const plain = await documentsService.getById(id, true);
        setDoc(plain);
        setCanonical(plain?.canonical_json || null);
        setCorrectionsResolved(!!plain?.metadata?.ai_corrections_resolved);
        setSuggestions([]);
        setExceptions([]);
        await refreshSplitPanels(plain);
      } catch {
        setError('Could not load document.');
      }
    } finally {
      setLoading(false);
    }
  }, [id, refreshSplitPanels]);

  /** Same data as load() without toggling the full-page loading spinner — use after X12 generate. */
  const refreshReview = useCallback(async () => {
    if (!id) return;
    try {
      const data = await documentsService.getReview(id);
      setDoc(data.document);
      setExceptions(data.exceptions || []);
      const st = data.document?.status;
      const terminal = suppressAiSuggestionWorkflow(st);
      const sugFromApi = data.ai_suggestions || [];
      setSuggestions(terminal ? [] : sugFromApi);
      setPartner(data.partner);
      setCanonical(data.document?.canonical_json || null);
      setLocalConf(null);
      setCorrectionsResolved(!!data.document?.metadata?.ai_corrections_resolved);
      await refreshSplitPanels(data.document);
      const suggForExpand = terminal ? [] : sugFromApi;
      const problemSegs = new Set(suggForExpand.map((s) => s.segment_id).filter(Boolean));
      const segs = data.document?.parsed_segments || [];
      const autoExpand = segs
        .map((s, i) => `${s.segment_id}-${i}`)
        .filter((_, i) => problemSegs.has(segs[i]?.segment_id));
      setExpanded(autoExpand.length ? autoExpand : segs.slice(0, 1).map((s, i) => `${s.segment_id}-${i}`));
    } catch {
      try {
        const plain = await documentsService.getById(id, true);
        setDoc(plain);
        setCanonical(plain?.canonical_json || null);
        setCorrectionsResolved(!!plain?.metadata?.ai_corrections_resolved);
        setSuggestions([]);
        setExceptions([]);
        await refreshSplitPanels(plain);
      } catch {
        /* ignore */
      }
    }
  }, [id, refreshSplitPanels]);

  useEffect(() => { load(); }, [load]);

  // ── fetch AI suggestions in background (non-blocking; poll until ready) ─────
  useEffect(() => {
    if (!id || loading || !doc) return;
    let cancelled = false;
    let intervalId = null;
    const poll = async () => {
      try {
        const res = await documentsService.getAiSuggestions(id);
        if (cancelled) return;
        if (res?.status === 'ready') {
          if (suppressAiSuggestionWorkflow(doc?.status)) {
            setSuggestions([]);
            return true;
          }
          setSuggestions(res.ai_suggestions || []);
          return true;
        }
      } catch {
        // Silent — user already has rule-based suggestions
      }
      return false;
    };
    (async () => {
      if (suppressAiSuggestionWorkflow(doc?.status)) {
        setSuggestions([]);
        return;
      }
      if (await poll()) return;
      intervalId = setInterval(async () => {
        if (cancelled) return;
        if (suppressAiSuggestionWorkflow(doc?.status)) {
          setSuggestions([]);
          if (intervalId) clearInterval(intervalId);
          return;
        }
        if (await poll() && intervalId) clearInterval(intervalId);
      }, 2000);
    })();
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [id, loading, doc?._id, doc?.status]);

  // Load related documents and SLA information
  useEffect(() => {
    if (!id) return;
    documentsService.getRelatedDocuments(id).then(setRelated).catch(() => {});
  }, [id]);

  // Terminal dispatch/failure: drop suggestion state so UI never flashes pending after status moves.
  useEffect(() => {
    if (doc && suppressAiSuggestionWorkflow(doc.status)) {
      setSuggestions([]);
    }
  }, [doc?.status, doc?._id]);

  // ── auto-generate Source Structure when missing (X12 only via explicit "Generate EDI X12") ──
  useEffect(() => {
    if (!doc || loading || !id) return;

    const format = doc?.metadata?.detected_standard || '';
    const isJsonXmlCsv = ['JSON', 'XML', 'CSV'].includes(format);
    const rawStart = (doc?.raw_edi || '').trim().slice(0, 10);
    const looksLikeJsonXmlCsv = !format && (
      rawStart.startsWith('{') || rawStart.startsWith('[') || rawStart.startsWith('<') ||
      (rawStart.includes(',') && (doc?.raw_edi || '').includes('\n'))
    );
    const needsSourceStructure = (isJsonXmlCsv || looksLikeJsonXmlCsv) && !doc?.metadata?.source_structure && doc?.raw_edi;

    const run = async () => {
      if (needsSourceStructure) {
        try {
          const res = await documentsService.generateSourceStructure(id);
          if (res?.source_structure) {
            setDoc(d => d ? { ...d, metadata: { ...d.metadata, source_structure: res.source_structure } } : d);
          }
        } catch (e) {
          // Silent fail — user can Re-run Translation
        }
      }
    };
    run();
  }, [doc?._id, doc?.metadata?.source_structure, doc?.canonical_json, doc?.raw_edi, doc?.metadata?.detected_standard, loading, id]);

  // ── when AI fixed or all suggestions resolved → confidence → 1.0 ─────────
  useEffect(() => {
    if (doc?.metadata?.ai_fixed_errors?.length) {
      setLocalConf(1.0);
    } else if (suggestions.length > 0 && suggestions.every((_, i) => resolved[i])) {
      setLocalConf(1.0);
    }
  }, [doc?.metadata?.ai_fixed_errors, resolved, suggestions]);

  // ── actions ───────────────────────────────────────────────────────────────
  const handleApply = async (idx, sugg) => {
    setApplying(idx);
    try {
      if (sugg.segment_id && sugg.suggested_value) {
        await documentsService.applyCorrection(id, {
          segment_id: sugg.segment_id,
          field_name: sugg.field_name,
          old_value: sugg.current_value || '',
          new_value: sugg.suggested_value,
          apply_to_canonical: true,
        });
      }
      setResolved(r => ({ ...r, [idx]: 'applied' }));
      toast.success(`Correction applied — canonical JSON updated`);
      // Refresh to get updated canonical (backend regenerates it dynamically)
      const data = await documentsService.getReview(id);
      setDoc(data.document);
      setCanonical(data.document?.canonical_json ?? canonical);
    } catch {
      toast.error('Failed to apply correction');
    } finally {
      setApplying(null);
    }
  };

  const handleKeep = (idx, sugg) => {
    setResolved(r => ({ ...r, [idx]: 'kept' }));
    toast.info(`Original kept — ${sugg.field_name}`);
  };

  const handleGenerateCanonical = async () => {
    setGenerating(true);
    try {
      const result = await documentsService.generateCanonical(id);
      setCanonical(result.canonical);
      setLocalConf(1.0);
      toast.success('Canonical JSON generated — Ready for Dispatch');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to generate canonical JSON');
    } finally {
      setGenerating(false);
    }
  };

  const handleRerun = async () => {
    setRerunning(true);
    try {
      await documentsService.reprocess(id);
      toast.success('Pipeline re-started — processing in background');
      setTimeout(() => navigate(-1), 1800);
    } catch {
      toast.error('Failed to re-trigger pipeline');
    } finally {
      setRerunning(false);
    }
  };

  const handleFieldEdit = async (edits) => {
    try {
      const partnerId = doc?.partner_id;
      const docType = doc?.document_type || '850';
      const result = await documentsService.patchCanonical(id, edits);
      if (result?.success) {
        if (partnerId && Array.isArray(edits)) {
          for (const edit of edits) {
            const oldVal = getCanonicalLineField(canonical, edit.lineNumber, edit.field);
            const newVal = edit.value;
            if (String(oldVal ?? '') === String(newVal ?? '')) continue;
            const fieldName = `lineItems[${edit.lineNumber}].${edit.field}`;
            correctionsService
              .create({
                partner_id: partnerId,
                document_type: String(docType).slice(0, 50),
                field_name: fieldName.slice(0, 500),
                ai_value: oldVal != null && oldVal !== '' ? String(oldVal) : undefined,
                corrected_value: newVal != null && newVal !== '' ? String(newVal) : undefined,
              })
              .catch(() => {});
          }
        }
        setCanonical(result.canonical_json);
        setDoc(d => {
          if (!d) return d;
          return {
            ...d,
            validation_results: result.validation_results,
            status: result.status,
            canonical_json: result.canonical_json,
            canonical_approve_blockers: result.canonical_approve_blockers ?? d.canonical_approve_blockers,
          };
        });
        if ((result.high_severity_count ?? 1) === 0 && (result.errors_remaining ?? 1) === 0) {
          toast.success('All validations pass — ready for approval');
        } else {
          toast.info(result.message);
        }
      } else {
        toast.error('Failed to save correction');
        throw new Error('Save failed');
      }
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to save correction');
      throw e;
    }
  };

  const flushHeaderCanonical = useCallback(async (header) => {
    try {
      const result = await documentsService.patchCanonical(id, { edits: [], header });
      if (result?.success) {
        setCanonical(result.canonical_json);
        setDoc((d) => {
          if (!d) return d;
          return {
            ...d,
            validation_results: result.validation_results,
            status: result.status,
            canonical_json: result.canonical_json,
            canonical_approve_blockers: result.canonical_approve_blockers ?? d.canonical_approve_blockers,
            ...(result.raw_edi != null && result.raw_edi !== undefined ? { raw_edi: result.raw_edi } : {}),
            ...(result.parsed_segments != null ? { parsed_segments: result.parsed_segments } : {}),
          };
        });
        if (result.raw_edi != null && result.raw_edi !== undefined) {
          setRawInputContent(result.raw_edi);
        }
        toast.info(result.message || 'Header saved');
        return result;
      }
      toast.error(result?.message || 'Failed to save header');
      throw new Error(result?.message || 'Failed to save header');
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to save header');
      throw e;
    }
  }, [id]);

  const handleReject = async () => {
    const confirmed = await confirm({
      title: 'Reject document',
      description: 'This will mark the document as Rejected.',
      confirmLabel: 'Reject',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setRejecting(true);
    try {
      await documentsService.reject(id, 'Rejected from review workspace');
      toast.success('Document rejected');
      await load();
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Reject failed');
    } finally {
      setRejecting(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const result = await documentsService.approve(id);
      if (result?.success) {
        toast.success(result.message || 'Document approved — ready for dispatch');
        setDoc(d => d ? { ...d, status: 'Ready for Dispatch', canonical_approve_blockers: [] } : d);
        await load();
      } else {
        toast.error(result?.message || 'Approval failed');
      }
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (detail && typeof detail === 'object' && detail.error) {
        toast.error(detail.error);
      } else {
        toast.error(typeof detail === 'string' ? detail : 'Failed to approve document');
      }
    } finally {
      setApproving(false);
    }
  };

  const handleCreateOutbound = async () => {
    if (sending) return;
    if (!canonical) { toast.error('Generate the canonical JSON first'); return; }
    const status = doc?.status;
    if (!['Ready for Dispatch', 'Completed'].includes(status)) {
      toast.error('Generate canonical JSON first to enable Create Outbound.');
      return;
    }
    if (doc?.metadata?.outbound_transaction_id) {
      toast.info('Outbound already created. Redirecting...');
      navigate(`/document/${doc.metadata.outbound_transaction_id}`);
      return;
    }
    setSending(true);
    try {
      const result = await documentsService.createOutboundFromInbound(id);
      if (result?.success && result?.outbound_id) {
        if (result?.already_exists) {
          toast.info(result?.message || 'Outbound already exists for this document.');
        } else {
          toast.success(result?.message || 'Outbound transmission created');
        }
        setDoc(d => d ? { ...d, metadata: { ...d.metadata, outbound_transaction_id: result.outbound_id } } : d);
        setOutboundModal({ outboundId: result.outbound_id, fileName: doc?.file_name || `outbound_${id.slice(-8)}` });
        await load();
      } else {
        toast.warning(result?.message || 'Failed to create outbound');
      }
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const msg = Array.isArray(detail) ? detail.map((d) => d?.msg || d).join('; ') : (typeof detail === 'string' ? detail : JSON.stringify(detail || 'Create outbound failed'));
      toast.error(msg || 'Create outbound failed');
    } finally {
      setSending(false);
    }
  };

  const handleDownloadAudit = () => {
    if (!doc) return;
    const blob = new Blob([JSON.stringify({ document: doc, exceptions, suggestions, canonical }, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `audit_${id?.slice(-8)}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const handleGenerateX12ForDocument = async () => {
    if (!canonical) { toast.error('Generate canonical JSON first'); return; }
    setGeneratingX12(true);
    setX12PanelError(null);
    try {
      const result = await documentsService.generateX12ForDocument(id);
      const ediContent = result?.edi_content || '';
      if (ediContent) {
        setX12Output(ediContent);
        setX12OutputStatus(result?.status || 'generated');
        setDoc((d) =>
          d
            ? {
                ...d,
                x12_output: ediContent,
                ...(result?.document_status ? { status: result.document_status } : {}),
                metadata: {
                  ...d.metadata,
                  ...(result?.outbound_format && { outbound_format: result.outbound_format }),
                  ...(result?.outbound_mime_type && { outbound_mime_type: result.outbound_mime_type }),
                  ...(result?.po_number_source != null && result?.po_number_source !== ''
                    ? { edi_po_number_source: result.po_number_source }
                    : {}),
                },
              }
            : d,
        );
        try {
          const g = await documentsService.getGeneratedX12(id);
          if (g?.edi_content) setX12Output(g.edi_content);
          if (g?.status) setX12OutputStatus(g.status);
          setX12DispatchedAt(g?.dispatched_at || null);
        } catch {
          /* keep local state */
        }
        await refreshReview();
        if (result?.po_number_source === 'raw_fallback') {
          toast.info('PO auto-resolved from source document');
        }
        if (result?.po_number_source === 'demo_fallback') {
          toast.info('PO auto-assigned (demo mode)');
        }
        toast.success(
          `${outboundFormatBadgeLabel(result?.outbound_format)} generated — review output, then approve before dispatch`,
        );
      } else {
        setX12PanelError('No EDI content generated');
        toast.error('No EDI content generated');
      }
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Failed to generate outbound file';
      setX12PanelError(msg);
      toast.error(msg);
    } finally {
      setGeneratingX12(false);
    }
  };

  const handleApplyCorrectionsAndRegenerateX12 = async () => {
    if (!canonical) { toast.error('Generate canonical JSON first'); return; }
    setGeneratingX12(true);
    setX12PanelError(null);
    try {
      const result = await documentsService.generateX12ForDocument(id);
      const ediContent = result?.edi_content || '';
      if (ediContent) {
        setX12Output(ediContent);
        setX12OutputStatus(result?.status || 'generated');
        setCorrectionsResolved(true);
        setDoc((d) =>
          d
            ? {
                ...d,
                x12_output: ediContent,
                ...(result?.document_status ? { status: result.document_status } : {}),
                metadata: {
                  ...d.metadata,
                  ai_corrections_resolved: 'applied',
                  ...(result?.outbound_format && { outbound_format: result.outbound_format }),
                  ...(result?.outbound_mime_type && { outbound_mime_type: result.outbound_mime_type }),
                  ...(result?.po_number_source != null && result?.po_number_source !== ''
                    ? { edi_po_number_source: result.po_number_source }
                    : {}),
                },
              }
            : d,
        );
        try {
          const g = await documentsService.getGeneratedX12(id);
          if (g?.status) setX12OutputStatus(g.status);
          setX12DispatchedAt(g?.dispatched_at || null);
        } catch {
          /* ignore */
        }
        await refreshReview();
        if (result?.po_number_source === 'raw_fallback') {
          toast.info('PO auto-resolved from source document');
        }
        if (result?.po_number_source === 'demo_fallback') {
          toast.info('PO auto-assigned (demo mode)');
        }
        toast.success(`AI corrections applied — ${outboundFormatBadgeLabel(result?.outbound_format)} regenerated`);
      } else {
        setX12PanelError('No EDI content generated');
        toast.error('No EDI content generated');
      }
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Failed to apply corrections';
      setX12PanelError(msg);
      toast.error(msg);
    } finally {
      setGeneratingX12(false);
    }
  };

  const handleKeepOriginalCorrections = async () => {
    try {
      await documentsService.setCorrectionsResolved(id, 'kept');
      setCorrectionsResolved(true);
      setDoc(d => d ? { ...d, metadata: { ...d.metadata, ai_corrections_resolved: 'kept' } } : d);
      toast.info('Original values kept');
    } catch {
      toast.error('Failed to save');
    }
  };

  const handleDownloadEDI = () => {
    const dir = (doc?.effective_direction || doc?.direction || '').toLowerCase();
    const st = doc?.status || '';
    const outboundApproved =
      dir === 'outbound' &&
      (statusIsOneOf(st, 'Ready for Dispatch', 'Completed') || isDispatchSuccessStatus(st));
    if (dir === 'outbound' && !outboundApproved) {
      toast.error('Review and approve the generated EDI before downloading.');
      return;
    }
    const content = x12Output || doc?.x12_output;
    if (!content) {
      toast.error('Generate output first');
      return;
    }
    const docType = (doc?.document_type || '850').replace(/^X12\s+/i, '').replace(/^DEFAULT\s+/i, '') || '850';
    const fmt = String(
      doc?.metadata?.outbound_format || partner?.edi_config?.format_config?.outbound_format || 'EDI_X12',
    )
      .toUpperCase()
      .replace(/\s+/g, '_');
    const mime =
      doc?.metadata?.outbound_mime_type ||
      (fmt === 'JSON' ? 'application/json' : fmt === 'XML' ? 'application/xml' : fmt === 'CSV' ? 'text/csv' : 'text/plain');
    let ext = 'edi';
    if (fmt === 'JSON') ext = 'json';
    else if (fmt === 'XML') ext = 'xml';
    else if (fmt === 'CSV') ext = 'csv';
    const blob = new Blob([content], { type: mime });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `${docType}_${id?.slice(-8) || 'export'}.${ext}`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(
      `Downloaded ${outboundFormatBadgeLabel(doc?.metadata?.outbound_format || partner?.edi_config?.format_config?.outbound_format)}`,
    );
  };

  const handleDispatchOutbound = async () => {
    if (dispatching) return;
    setDispatching(true);
    try {
      const r = await documentsService.dispatchOutbound(id);
      if (r?.success) {
        if (r?.already_dispatched) {
          toast.info(r.message || 'Already dispatched.');
        } else {
          toast.success(r.message || 'Dispatched to partner');
        }
        setDoc(d =>
          d && !isDispatchSuccessStatus(d?.status)
            ? { ...d, status: 'Dispatched', stage: 'Dispatched' }
            : d,
        );
        await load();
      } else {
        toast.error(r?.message || 'Dispatch failed');
      }
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Dispatch failed');
    } finally {
      setDispatching(false);
    }
  };

  const toggleSeg = (key) => setExpanded(e => e.includes(key) ? e.filter(k => k !== key) : [...e, key]);

  // ── derived ───────────────────────────────────────────────────────────────
  const parsedSegs    = doc?.parsed_segments || [];
  const rawEDI        = rawInputContent || doc?.raw_edi || '';
  const docId         = doc?._id || id || '';
  const suppressAiUi  = suppressAiSuggestionWorkflow(doc?.status);
  const effectiveSuggestions = suppressAiUi ? [] : suggestions;
  const pendingCount  = effectiveSuggestions.filter((_, i) => !resolved[i]).length;
  const allResolved   = effectiveSuggestions.length > 0 && pendingCount === 0;
  const viewerRole = typeof window !== 'undefined' ? localStorage.getItem('role') : null;
  const displayDir = doc?.effective_direction || getDisplayDirection(viewerRole, doc?.document_type) || doc?.direction;
  const dirLower = (displayDir || doc?.direction || '').trim().toLowerCase();
  const isInbound = dirLower === 'inbound';
  const isOutbound = dirLower === 'outbound';
  const canonicalApproveBlocked = (doc?.canonical_approve_blockers || []).length > 0;
  const showExceptionRecoveryHeader = useMemo(() => {
    const list = doc?.validation_results || [];
    return (
      doc?.status === 'Exception' &&
      list.some(isHighCriticalValidationIssue) &&
      list.some(isHeaderExceptionRecoveryIssue)
    );
  }, [doc?.status, doc?.validation_results]);
  const outboundLineItemEditing = useMemo(
    () => isOutbound && statusIsOneOf(doc?.status, 'Needs Review', 'Exception', 'Generated'),
    [isOutbound, doc?.status],
  );
  const hasHighEdiBlockers = useMemo(
    () =>
      (doc?.validation_results || []).some((v) => {
        if (!v || v.auto_correctable) return false;
        const code = String(v.rule || v.code || '');
        if (code === 'SE_COUNT_MISMATCH') return false;
        const s = String(v.severity || '').toLowerCase();
        return s === 'high' || s === 'critical';
      }),
    [doc?.validation_results],
  );
  const exceptionApproveBlocked =
    (doc?.status === 'Exception' && (canonicalApproveBlocked || hasHighEdiBlockers)) || false;
  const outboundCanDispatch =
    isOutbound &&
    (statusIsOneOf(doc?.status, 'Ready for Dispatch', 'Completed') || isDispatchSuccessStatus(doc?.status));
  const outboundNeedsApproval =
    isOutbound &&
    statusIsOneOf(doc?.status, 'Needs Review', 'Generated', 'Exception');
  const hasGeneratedOutboundContent = isOutbound && !!((x12Output || doc?.x12_output || '').trim());
  const hasGeneratedEdi = !!((x12Output || doc?.x12_output || '').trim());
  const metaUiException = doc?.metadata?.ui_exception;
  const openExceptions = useMemo(
    () => (exceptions || []).filter((e) => (e?.status || 'Open') === 'Open'),
    [exceptions],
  );
  const showRedExceptionBadge =
    !suppressAiUi &&
    !doc?.metadata?.ai_fixed_errors?.length &&
    (metaUiException === true ||
      (metaUiException !== false && openExceptions.length > 0 && !hasGeneratedEdi));
  const showWarningBadge =
    !showRedExceptionBadge &&
    !suppressAiUi &&
    !doc?.metadata?.ai_fixed_errors?.length &&
    (doc?.metadata?.ui_warnings_only === true ||
      (openExceptions.length > 0 && !openExceptions.some(exceptionIsBlocking)));
  const confidenceFromDoc =
    doc?.metadata?.ai_fixed_errors?.length
      ? 1.0
      : hasGeneratedEdi &&
          metaUiException === false &&
          !x12PanelError &&
          !(doc?.validation_results || []).some(
            (v) =>
              v &&
              (String(v.type || '').toLowerCase() === 'error' ||
                String(v.severity || '').toLowerCase() === 'critical' ||
                String(v.severity || '').toLowerCase() === 'high'),
          )
        ? Math.max(Number(doc?.ai_confidence_score ?? 0), 0.95)
        : Number(doc?.ai_confidence_score ?? 0);
  const confidence    = localConf !== null ? localConf : confidenceFromDoc;
  const outboundId   = doc?.metadata?.outbound_transaction_id;
  const canCreateOutbound = isInbound && !!canonical && ['Ready for Dispatch', 'Completed'].includes(doc?.status) && !outboundId;
  const inboundDispatchComplete = isInbound && isDispatchSuccessStatus(doc?.status);
  const partnerDispatchedLabel = partner?.business_name || partner?.partner_code || doc?.partner_code || 'partner';

  const inboundFmtCode =
    doc?.metadata?.inbound_source_format || doc?.detected_format || doc?.metadata?.detected_standard || '';
  const inboundFmtBadge = inboundFormatBadgeLabel(inboundFmtCode);
  const outboundFmtDisplay = outboundFormatBadgeLabel(
    doc?.metadata?.outbound_format || partner?.edi_config?.format_config?.outbound_format || 'EDI_X12',
  );

  // Panel 3 ERP payload (Inbound flow)
  const rawErpPayload = doc?.metadata?.erp_payload || doc?.idoc_payload || null;
  const erpPayloadContent = rawErpPayload
    ? (typeof rawErpPayload === 'string' ? rawErpPayload : JSON.stringify(rawErpPayload, null, 2))
    : '';

  const handleDownloadErpPayload = () => {
    if (!erpPayloadContent) { toast.error('No ERP payload available'); return; }
    const idocType = rawErpPayload?.idocType || 'payload';
    const blob = new Blob([erpPayloadContent], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `erp_${idocType}_${(doc?._id || id || '').slice(-8)}.json`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('ERP payload downloaded');
  };

  // map segment_id → list of suggestion indices (terminal states → empty)
  const segSuggMap = {};
  effectiveSuggestions.forEach((s, i) => {
    if (s.segment_id) {
      if (!segSuggMap[s.segment_id]) segSuggMap[s.segment_id] = [];
      segSuggMap[s.segment_id].push(i);
    }
  });

  /** Single top banner by backend status priority */
  const topBannerKind = (() => {
    if (isDispatchSuccessStatus(doc?.status)) return 'dispatched_ok';
    if (isFailedStatus(doc?.status)) return 'failed';
    if (doc?.metadata?.ai_fixed_errors?.length) return null;
    if (outboundNeedsApproval) return 'outbound_review';
    const readyLike =
      !isOutbound &&
      (statusIsOneOf(doc?.status, 'Ready for Dispatch') ||
        (effectiveSuggestions.length > 0 && pendingCount === 0));
    if (readyLike) return 'ready_dispatch';
    const showProcessing =
      isProcessingStatus(doc?.status) &&
      !hasGeneratedOutboundContent;
    if (showProcessing) {
      return 'processing';
    }
    return null;
  })();

  // ── loading / error ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-[70vh]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-9 h-9 text-[var(--text-primary)] animate-spin" />
        <p className="text-xs font-mono text-[var(--text-muted)]">Loading review workspace…</p>
      </div>
    </div>
  );

  if (error || !doc) return (
    <div className="flex items-center justify-center h-[70vh]">
      <div className="text-center space-y-3">
        <XCircle className="w-9 h-9 text-[var(--status-error-text)] mx-auto" />
        <p className="text-xs font-mono text-[var(--text-secondary)]">{error || 'Document not found'}</p>
        <button onClick={() => navigate(-1)} className="text-xs font-mono text-[var(--text-primary)] hover:underline">← Go back</button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-5 space-y-4"
      style={{ background: 'linear-gradient(135deg,#020817 0%,#080e1c 60%,#020817 100%)' }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate(-1)}
            className="mt-1 p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-focus)] transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-black font-mono text-[var(--text-primary)] text-base tracking-tight truncate max-w-xs">
                {docId.slice(-20).toUpperCase()}
              </h1>
              <StatusBadge status={doc?.metadata?.ai_fixed_errors?.length ? 'Completed' : doc.status} />
              {showRedExceptionBadge && (
                <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded border border-red-500/40 bg-red-900/20 text-[var(--status-error-text)]">
                  Exception
                </span>
              )}
              {showWarningBadge && (
                <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded border border-amber-500/45 bg-amber-900/25 text-[var(--status-warn-text)]">
                  Warning
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono text-[var(--text-muted)] mt-1">
              {partner?.partner_code || doc.partner_code || 'Unknown'}
              {' · '}{doc.document_type}
              {' · '}{doc.received_at ? new Date(doc.received_at).toLocaleString() : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ── TRANSACTION CHAIN (EARLY VISIBILITY) ──────────────────────────────── */}
      {related && (
        <div className="border border-green-500/40 rounded-lg p-4 space-y-3 bg-green-950/20">
          <p className="text-[10px] font-mono uppercase text-green-400 tracking-wider font-bold">✓ Transaction Chain</p>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              {related.linked_document && (
                <div className="space-y-1">
                  <p className="text-green-300">Linked to: <span className="text-green-100">{related.linked_document.transaction_type}</span></p>
                  <p className="text-green-300">Status: <span className="text-green-100">{related.linked_document.status}</span></p>
                </div>
              )}
            </div>
            <div>
              {related.sla?.status && (
                <div className="space-y-1">
                  <p className="text-cyan-300">SLA: <span className="text-cyan-100 font-bold">{related.sla.status}</span></p>
                  <p className="text-cyan-300">Hours: <span className="text-cyan-100">{related.sla.hours_allocated || 24}</span></p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {doc?.status === 'Exception' && (
        <div className="rounded-sm border border-amber-500/35 bg-amber-950/25 px-4 py-3 flex gap-3 items-start">
          <AlertCircle className="w-5 h-5 text-[var(--status-warn-text)] shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-bold font-mono text-amber-200">
              This document has validation errors and needs manual review
            </p>
            <p className="text-[11px] font-mono text-amber-100/85 leading-relaxed">
              Use the canonical panel to fix PO, order date, and line items. Edits save automatically.
              When canonical blockers are clear, use Approve and Continue. Structural EDI issues remain visible until you fix the raw file and use Re-run Translation.
              You can reject the document if it should not proceed.
            </p>
          </div>
        </div>
      )}

      {/* ── INBOUND / OUTBOUND STATUS BLOCKS ───────────────────────────────── */}
      {isInbound && (
        <div className="flex gap-4 flex-wrap">
          <div className="rounded-lg border border-[var(--border)] px-4 py-2.5 bg-[var(--bg-surface)]">
            <p className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-0.5">Inbound Status</p>
            <p className="text-sm font-bold font-mono text-[var(--text-primary)]">{doc?.status || '—'}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] px-4 py-2.5 bg-[var(--bg-surface)]">
            <p className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-0.5">Outbound Status</p>
            {inboundDispatchComplete ? (
              <div>
                <span
                  className="text-[10px] font-black font-mono px-2 py-0.5 rounded border"
                  style={{ background: 'rgba(0, 104, 74, 0.25)', borderColor: 'rgba(0, 237, 100, 0.35)', color: 'var(--status-success-text)' }}
                >
                  DISPATCHED
                </span>
                <p className="text-[11px] font-mono text-[var(--text-secondary)] mt-1.5">
                  {formatBannerTimestamp(doc?.delivered_at)}
                </p>
              </div>
            ) : outboundId ? (
              <a
                href={`#/document/${outboundId}`}
                onClick={(e) => { e.preventDefault(); navigate(`/document/${outboundId}`); }}
                className="text-sm font-bold font-mono text-[var(--text-primary)] hover:underline"
              >
                In Progress — {outboundId.slice(-12)}
              </a>
            ) : (
              <p className="text-sm font-mono text-[var(--text-muted)]">Not Created</p>
            )}
          </div>
        </div>
      )}
      {!isInbound && doc?.parent_transaction_id && (
        <div className="rounded-lg border border-[var(--border)] px-4 py-2.5 bg-[var(--bg-surface)] inline-block">
          <p className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-0.5">Linked Inbound</p>
          <a
            href={`#/document/${doc.parent_transaction_id}`}
            onClick={(e) => { e.preventDefault(); navigate(`/document/${doc.parent_transaction_id}`); }}
            className="text-sm font-bold font-mono text-[var(--text-primary)] hover:underline"
          >
            {doc.parent_transaction_id}
          </a>
        </div>
      )}

      {/* ── TRANSACTION CHAIN: PO ↔ INVOICE ↔ ASN ──────────────────────────── */}
      {related && (
        <div className="border border-[var(--border)] rounded-lg p-4 space-y-3 bg-[var(--bg-surface)]">
          <p className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">Transaction Chain</p>

          {/* SLA Status Badge */}
          {related.sla?.status && (
            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono
              ${related.sla.status === 'BREACHED' ? 'bg-red-900/30 text-red-400' :
                related.sla.status === 'AT_RISK'  ? 'bg-yellow-900/30 text-yellow-400' :
                related.sla.status === 'MET'      ? 'bg-green-900/30 text-green-400' :
                                                    'bg-[var(--bg-base)] text-[var(--text-secondary)]'}`}>
              SLA {related.sla.status} · Deadline {related.sla.deadline ? new Date(related.sla.deadline).toLocaleString() : '—'}
            </div>
          )}

          {/* Linked Document */}
          {related.linked_document && (
            <div
              onClick={() => navigate(`/document/${related.linked_document.id}`)}
              className="cursor-pointer flex items-center gap-3 p-3 rounded border border-[var(--border-subtle)] hover:border-[var(--border-focus)] transition-colors"
            >
              <span className="text-xs font-mono text-[var(--text-muted)]">
                {related.linked_document.transaction_type || 'Unknown'}
              </span>
              <span className="text-xs font-mono text-[var(--text-primary)] flex-1">
                {related.linked_document.id.slice(0, 12)}...
              </span>
              {related.item_match?.status && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded
                  ${related.item_match.status === 'MATCHED' ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
                  {related.item_match.status}
                </span>
              )}
            </div>
          )}

          {/* Item Discrepancies */}
          {(related.item_match?.discrepancies || []).length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
              <p className="text-[9px] font-mono uppercase text-[var(--text-muted)] tracking-wider">Discrepancies</p>
              {related.item_match.discrepancies.map((d, i) => (
                <div key={i} className="text-xs font-mono text-yellow-400 pl-3 border-l-2 border-yellow-800 py-1">
                  <p className="font-semibold">{d.type}: {d.product_id}</p>
                  <p className="text-[11px] text-yellow-300/80">
                    PO: {d.po_qty ?? d.po_price ?? '—'} / Invoice: {d.invoice_qty ?? d.invoice_price ?? '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── FIXED BY AI BANNER ─────────────────────────────────────────────── */}
      {doc?.metadata?.ai_fixed_errors?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-sm border p-4"
          style={{ background: 'rgba(0, 104, 74, 0.25)', borderColor: 'rgba(0, 237, 100, 0.35)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[var(--status-success-text)] flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-green-300 text-sm">Fixed by AI</p>
                <p className="text-[11px] text-green-200/80 mt-0.5">
                  File corrected using AI. {doc.metadata.ai_fixed_errors.length} correction{doc.metadata.ai_fixed_errors.length > 1 ? 's' : ''} applied during processing.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCorrections(s => !s)}
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all"
              style={{
                background: showCorrections ? '#065f46' : '#0f172a',
                border: '1px solid var(--status-success-text)66',
                color: 'var(--status-success-text)',
              }}>
              <Wrench className="w-4 h-4" />
              {showCorrections ? 'Hide Corrections' : 'Check Corrections'}
            </button>
          </div>

          {/* Old fields & New fields — toggleable */}
          {showCorrections && (
            <div className="mt-4 pt-4 border-t border-green-500/20 space-y-3">
              <p className="text-[10px] font-black font-mono text-[var(--text-muted)] uppercase tracking-widest">
                Corrections applied (Old → New)
              </p>
              <div className="grid gap-2">
                {doc.metadata.ai_fixed_errors.map((fix, i) => (
                  <div
                    key={i}
                    className="rounded-lg px-3 py-2.5 flex items-start gap-4 border"
                    style={{ borderColor: '#334155', background: '#0c1a2e' }}>
                    <div className="flex-1 min-w-0 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[9px] font-mono text-[var(--status-error-text)]/80 uppercase mb-0.5">Old field</p>
                        <p className="text-[11px] font-mono text-red-300 line-through break-all">{fix.old_value || '(empty)'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-mono text-[var(--status-success-text)]/80 uppercase mb-0.5">New field</p>
                        <p className="text-[11px] font-mono text-green-300 font-medium break-all">{fix.new_value}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-[10px] font-bold font-mono text-[var(--text-primary)]">{fix.segment_id}</span>
                      {fix.field_name && (
                        <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{fix.field_name}</p>
                      )}
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-[var(--status-success-text)] shrink-0 mt-1" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ── Status banner (single: dispatched → failed → ready → processing) ── */}
      <AnimatePresence mode="wait">
        {topBannerKind === 'dispatched_ok' && (
          <motion.div
            key="dispatched_ok"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-sm border p-4"
            style={{ background: 'rgba(0, 104, 74, 0.25)', borderColor: 'rgba(0, 237, 100, 0.35)' }}
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[var(--status-success-text)] flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-green-300 text-sm">This document has been dispatched successfully.</p>
                <p className="text-[12px] text-green-200/85 mt-1">
                  Dispatched on {formatBannerTimestamp(doc?.delivered_at)}.
                  {' '}Generated X12 sent to {partnerDispatchedLabel}.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {topBannerKind === 'failed' && (
          <motion.div
            key="failed"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-sm border p-4 flex items-start gap-3"
            style={{ background: 'rgba(250, 110, 57, 0.15)', borderColor: 'rgba(250, 110, 57, 0.35)', color: 'var(--status-error-text)' }}
          >
            <XCircle className="w-5 h-5 text-[var(--status-error-text)] flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-200 text-sm">Dispatch failed</p>
              <p className="text-[12px] text-red-200/85 mt-1">
                {doc?.processing_error_message || doc?.processing_error_type || 'Processing or delivery did not complete. Check audit logs or re-run translation.'}
              </p>
            </div>
          </motion.div>
        )}

        {topBannerKind === 'outbound_review' && (
          <motion.div
            key="outbound_review"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-sm border p-3.5 flex items-start gap-3"
            style={{ background: '#42200655', borderColor: '#facc1566' }}
          >
            <AlertCircle className="w-5 h-5 text-[var(--status-warn-text)] flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-amber-100/95">
              Review the generated EDI output in the right panel before approving. Verify sender IDs, PO references,
              pricing, and segment data are correct.
            </p>
          </motion.div>
        )}

        {topBannerKind === 'ready_dispatch' && (
          <motion.div
            key="ready_dispatch"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-sm border p-3.5 flex items-center gap-3"
            style={{ background: 'rgba(0, 104, 74, 0.25)', borderColor: 'rgba(0, 237, 100, 0.35)' }}
          >
            <CheckCircle2 className="w-4 h-4 text-[var(--status-success-text)] flex-shrink-0" />
            <p className="text-sm font-medium text-green-300">
              All AI suggestions resolved. Generate outbound output and dispatch to partner.
            </p>
          </motion.div>
        )}

        {topBannerKind === 'processing' && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-sm border p-3.5 flex items-center gap-3"
            style={{ background: '#0c1a2e', borderColor: '#38bdf855' }}
          >
            <Loader2 className="w-4 h-4 text-sky-400 animate-spin flex-shrink-0" />
            <p className="text-sm font-medium text-sky-200/90">
              Processing… AI suggestions and validation will appear when ready.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── METADATA HEADER ─────────────────────────────────────────────────── */}
      <div className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)]/80 px-4 py-3 flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Direction</span>
          <span className="text-xs font-bold font-mono text-[var(--text-primary)]">{displayDir}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Source Format</span>
          <span className="text-xs font-mono text-[var(--text-primary)]">
            {inboundFormatShortFromDoc(doc)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Doc type</span>
          <span className="text-xs font-mono text-[var(--text-primary)]">{doc?.document_type || '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Outbound format</span>
          <span className="text-xs font-mono text-[var(--text-primary)]">{outboundFmtDisplay}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Confidence Score</span>
          <span className="text-xs font-bold font-mono" style={{ color: confColor(confidence) }}>
            {Math.round((confidence ?? 0) * 100)}%
          </span>
        </div>
      </div>

      {/* ── THREE PANES ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4" style={{ minHeight: 560 }}>

        {/* ━━━ PANE 1: Raw Input (immutable upload) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] shrink-0" />
            <span className="text-[10px] font-black font-mono text-[var(--text-secondary)] uppercase tracking-widest">
              RAW INPUT
            </span>
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: '#6366f122', color: '#a5b4fc', border: '1px solid #6366f144' }}
            >
              {inboundFmtBadge}
            </span>
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded ml-auto"
              style={{ background: '#06b6d422', color: '#22d3ee', border: '1px solid #06b6d444' }}
            >
              RECEIVED
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <pre className="font-mono text-[9.5px] text-[var(--text-primary)]/75 leading-relaxed whitespace-pre-wrap break-all">
              {rawEDI || '(empty)'}
            </pre>
          </div>
        </div>

        {/* ━━━ PANE 2: Source Structure (AI-Corrected) or Parsed EDI segments ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <SourceStructurePanel
          sourceStructure={doc?.metadata?.source_structure}
          documentType={doc?.document_type}
          detectedFormat={doc?.metadata?.detected_standard}
          onApplyCorrections={handleApplyCorrectionsAndRegenerateX12}
          onKeepOriginal={handleKeepOriginalCorrections}
          applyingCorrections={generatingX12}
          correctionsResolved={correctionsResolved}
          validationResults={doc?.validation_results}
          canonicalJson={canonical}
          erpPayload={doc?.metadata?.erp_payload}
          onFieldEdit={handleFieldEdit}
          suppressPostDispatchUi={suppressAiUi}
          exceptionRecoveryHeader={showExceptionRecoveryHeader}
          outboundLineItemEditing={outboundLineItemEditing}
          documentDirection={displayDir || doc?.direction}
          onHeaderCanonicalSave={flushHeaderCanonical}
        >
          {!doc?.metadata?.source_structure && parsedSegs.length > 0 && (
          <div className="p-2.5 space-y-1.5">
            {parsedSegs.map((seg, si) => {
              const key         = `${seg.segment_id}-${si}`;
              const isOpen      = expanded.includes(key);
              const segData     = seg.data || {};
              const elements    = seg.elements || [];
              const suggIdxs    = segSuggMap[seg.segment_id] || [];
              const pendingSugg = suggIdxs.filter(i => !resolved[i]);
              const hasIssue    = pendingSugg.length > 0;

              return (
                <div key={key} className="rounded-lg border overflow-hidden transition-all duration-300"
                  style={{
                    borderColor: hasIssue ? 'var(--status-error-text)66' : '#1e293b',
                    background:  hasIssue ? '#2d0a0a22' : '#0f172a',
                    boxShadow:   hasIssue ? '0 0 0 1px var(--status-error-text)22' : 'none',
                  }}>
                  {/* ── Row header ── */}
                  <button onClick={() => toggleSeg(key)}
                    className="w-full px-3 py-2 flex items-center justify-between transition-colors hover:bg-white/5"
                    style={{ borderLeft: hasIssue ? '3px solid var(--status-error-text)' : '3px solid transparent' }}>
                    <div className="flex items-center gap-2">
                      {hasIssue
                        ? <AlertCircle className="w-3.5 h-3.5 text-[var(--status-error-text)] shrink-0" />
                        : <span className="w-3.5 h-3.5 shrink-0" />}
                      <span className={`text-xs font-bold font-mono ${hasIssue ? 'text-red-300' : 'text-[var(--text-primary)]'}`}>
                        {seg.segment_id}
                      </span>
                      {hasIssue && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--status-error-text)25', color: 'var(--status-error-text)', border: '1px solid var(--status-error-text)44' }}>
                          NEEDS REVIEW
                        </span>
                      )}
                    </div>
                    {isOpen
                      ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                  </button>

                  {/* ── Expanded content ── */}
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-1 pt-1">
                      {/* ── Parsed fields ── */}
                      {Object.entries(segData).map(([k, v]) => {
                        const relatedSugg = pendingSugg
                          .map(i => effectiveSuggestions[i])
                          .find(s => String(s.current_value) === String(v) ||
                            s.field_name.toLowerCase().replace(/_/g, ' ') === k.toLowerCase().replace(/_/g, ' '));
                        return (
                          <div key={k}
                            className={`flex justify-between items-start gap-2 py-1 px-2 rounded text-[10px] ${relatedSugg ? 'bg-red-900/25' : ''}`}>
                            <span className="text-[var(--text-muted)] capitalize shrink-0">{k.replace(/_/g, ' ')}</span>
                            <span className={`font-mono font-medium text-right ${relatedSugg ? 'text-red-300' : 'text-[var(--text-primary)]'}`}>
                              {fmt(v)}
                              {relatedSugg && <AlertCircle className="inline w-3 h-3 ml-1 text-[var(--status-error-text)]" />}
                            </span>
                          </div>
                        );
                      })}
                      {/* raw elements when no structured data */}
                      {Object.keys(segData).length === 0 && elements.map((el, ei) => (
                        <div key={ei} className="flex justify-between text-[10px] py-1 px-2">
                          <span className="text-[var(--text-muted)]">el-{ei + 1}</span>
                          <span className="font-mono text-[var(--text-secondary)]">{fmt(el)}</span>
                        </div>
                      ))}

                      {/* ── AI Suggests (reference: Detected / Suggested in blue, Apply blue primary, Keep white) ── */}
                      {pendingSugg.map((idx) => {
                        const s = effectiveSuggestions[idx];
                        return (
                          <motion.div key={idx}
                            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                            className="mt-2.5 rounded-lg p-3.5 space-y-2.5 border border-amber-300/50"
                            style={{ background: '#fffbeb' }}>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-amber-900">
                                AI Suggests:
                              </span>
                              <span className="ml-auto text-[9px] font-mono text-amber-600">
                                {Math.round((s.confidence || 0) * 100)}% confidence
                              </span>
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex items-baseline gap-2">
                                <span className="text-[10px] font-medium text-[var(--text-muted)] shrink-0">Detected:</span>
                                <span className="font-mono text-[11px] font-semibold text-slate-800 break-all">{fmt(s.current_value) || '(empty)'}</span>
                              </div>
                              <div className="flex items-baseline gap-2">
                                <span className="text-[10px] font-medium text-[var(--text-muted)] shrink-0">Suggested:</span>
                                <span className="font-mono text-[11px] font-bold text-blue-600 break-all">{fmt(s.suggested_value) || '—'}</span>
                              </div>
                            </div>

                            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed italic">{s.reason || s.issue}</p>

                            <div className="flex gap-2 pt-1">
                              <button disabled={applying === idx}
                                onClick={() => handleApply(idx, s)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all bg-primary hover:bg-blue-700 text-[var(--text-primary)]">
                                {applying === idx
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <CheckCircle2 className="w-3.5 h-3.5" />}
                                Apply Suggestion
                              </button>
                              <button onClick={() => handleKeep(idx, s)}
                                className="flex-1 py-2 rounded-lg text-[11px] font-semibold transition-all bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">
                                Keep Original
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}

                      {/* resolved indicator */}
                      {suggIdxs.length > 0 && pendingSugg.length === 0 && (
                        <div className="mt-1.5 px-2 py-1.5 rounded-lg border border-green-500/25 bg-green-900/10 flex items-center gap-2">
                          <CheckCircle2 className="w-3 h-3 text-[var(--status-success-text)]" />
                          <span className="text-[10px] font-mono text-green-300">
                            {resolved[suggIdxs[0]] === 'applied' ? 'Correction applied' : 'Original kept'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* open issues strip (blocking → red, minor → amber) */}
            {openExceptions.length > 0 && !suppressAiUi && (
              <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]/80 space-y-1.5">
                <p className="text-[9px] font-black font-mono text-slate-700 uppercase tracking-widest">Open issues</p>
                {openExceptions.map((exc) => {
                  const blocking = exceptionIsBlocking(exc);
                  return (
                    <div
                      key={exc._id || exc.id}
                      className={
                        blocking
                          ? 'rounded-lg px-2.5 py-2 border border-red-500/20 bg-red-900/10'
                          : 'rounded-lg px-2.5 py-2 border border-amber-500/25 bg-amber-900/10'
                      }
                    >
                      <p
                        className={
                          blocking
                            ? 'text-[10px] font-bold font-mono text-[var(--status-error-text)]'
                            : 'text-[10px] font-bold font-mono text-[var(--status-warn-text)]'
                        }
                      >
                        {exc.exception_type}
                        {!blocking && (
                          <span className="ml-1.5 text-[9px] font-mono font-normal text-amber-200/80">(warning)</span>
                        )}
                      </p>
                      <p className="text-[9px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{exc.description}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </SourceStructurePanel>

        {/* ━━━ PANE 3: ERP Payload (Inbound) | Generated EDI (Outbound) ━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <GeneratedEDIPanel
          x12Content={isInbound ? erpPayloadContent : (x12Output || doc?.x12_output || '')}
          outputFormat={
            isInbound
              ? 'JSON'
              : (doc?.metadata?.outbound_format || partner?.edi_config?.format_config?.outbound_format || 'EDI_X12')
          }
          outputStatus={isInbound ? (erpPayloadContent ? 'generated' : 'pending') : x12OutputStatus}
          dispatchedAt={isInbound ? null : x12DispatchedAt}
          onGenerate={isInbound ? null : handleGenerateX12ForDocument}
          generating={isInbound ? false : generatingX12}
          onDownload={
            isInbound
              ? (erpPayloadContent ? handleDownloadErpPayload : null)
              : outboundCanDispatch || isDispatchSuccessStatus(doc?.status)
                ? handleDownloadEDI
                : null
          }
          generateError={isInbound ? null : x12PanelError}
          onRetryGenerate={isInbound ? null : handleGenerateX12ForDocument}
          rawInputForDiff={isInbound ? '' : (rawInputContent || doc?.raw_edi || '')}
          showDiff={isInbound ? false : showX12Diff}
          onToggleDiff={isInbound ? null : (() => setShowX12Diff((v) => !v))}
          direction={doc?.direction || null}
          generationFootnote={
            isInbound
              ? null
              : 'SE segment counts are recalculated automatically when you generate X12.'
          }
        />
      </div>

      {/* ── ERP PAYLOAD PANE (for inbound docs with generated ERP payload) ── */}
      {doc?.metadata?.erp_payload && (
        <div className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-2">
            <Braces className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="text-[10px] font-black font-mono text-[var(--text-secondary)] uppercase tracking-widest">
              ERP Payload ({doc.metadata.erp_payload?.idocType || 'Generated'})
            </span>
            <span className="ml-auto text-[9px] font-mono text-[var(--text-muted)]">
              Ready for SAP import
            </span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase">IDoc Type</span>
                <span className="text-xs font-bold font-mono text-[var(--text-secondary)]">
                  {doc.metadata.erp_payload?.idocType || '—'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase">PO Number</span>
                <span className="text-xs font-mono text-[var(--text-primary)]">
                  {doc.metadata.erp_payload?.poNumber || '—'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase">Line Items</span>
                <span className="text-xs font-mono text-[var(--text-primary)]">
                  {doc.metadata.erp_payload?.lineItems?.length || 0}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase">Total</span>
                <span className="text-xs font-bold font-mono text-[var(--status-success-text)]">
                  ${doc.metadata.erp_payload?.totals?.grandTotal?.toLocaleString() || '—'}
                </span>
              </div>
            </div>
            <pre className="font-mono text-[9.5px] text-[var(--text-primary)]/75 leading-relaxed whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              {JSON.stringify(doc.metadata.erp_payload, null, 2)}
            </pre>
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(doc.metadata.erp_payload, null, 2)], { type: 'application/json' });
                const a = Object.assign(document.createElement('a'), {
                  href: URL.createObjectURL(blob),
                  download: `erp_${doc.metadata.erp_payload?.idocType || 'payload'}_${(doc._id || id).slice(-8)}.json`,
                });
                a.click();
                URL.revokeObjectURL(a.href);
                toast.success('ERP payload downloaded');
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold font-mono transition-colors"
              style={{ background: '#1e1b4b', border: '1px solid #6366f144', color: '#818cf8' }}
            >
              <Download className="w-3.5 h-3.5" />
              Download ERP Payload
            </button>
          </div>
        </div>
      )}

      {/* ── ERP PAYLOAD FROM OUTBOUND INGESTION (metadata.erp_payload from /ingestion/erp) ── */}
      {doc?.metadata?.upload_source === 'erp_ingestion' && doc?.metadata?.erp_payload && !doc?.metadata?.erp_payload?.idocType && (
        <div className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-2">
            <Braces className="w-4 h-4 text-[var(--status-warn-text)]" />
            <span className="text-[10px] font-black font-mono text-[var(--text-secondary)] uppercase tracking-widest">
              Source ERP Payload
            </span>
          </div>
          <div className="p-4">
            <pre className="font-mono text-[9.5px] text-[var(--status-warn-text)]/75 leading-relaxed whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              {JSON.stringify(doc.metadata.erp_payload, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* ── ACTION FOOTER ──────────────────────────────────────────────────── */}
      <div className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)]/95 backdrop-blur px-5 py-4 flex items-center justify-between gap-4"
        style={{ boxShadow: '0 -4px 50px #000a' }}>
        <button onClick={handleDownloadAudit}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] text-[11px] font-mono hover:border-[var(--border-focus)] hover:text-[var(--text-primary)] transition-colors shrink-0">
          <Download className="w-3.5 h-3.5" />
          Download Audit Report
        </button>

        <div className="flex items-center gap-3">
          {canonical && !isDispatchSuccessStatus(doc?.status) && !isInbound && (
            <button
              onClick={handleGenerateX12ForDocument}
              disabled={generatingX12}
              className="flex items-center gap-2 px-5 py-2 rounded-sm text-[11px] font-black font-mono transition-all shrink-0"
              style={{
                background: 'linear-gradient(135deg,#0ea5e9,#0284c7)',
                color: '#fff',
                border: '1px solid #0ea5e966',
                boxShadow: '0 0 20px #0ea5e944',
                opacity: generatingX12 ? 0.7 : 1,
              }}
              title="Generate partner outbound file from canonical — displays in panel and persists for dispatch"
            >
              {generatingX12 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCode className="w-3.5 h-3.5" />}
              {generatingX12 ? 'Generating…' : `Generate ${outboundFmtDisplay}`}
            </button>
          )}
          {(x12Output || doc?.x12_output) && (
            <button
              onClick={handleDownloadEDI}
              disabled={
                isOutbound && !outboundCanDispatch && !isDispatchSuccessStatus(doc?.status)
              }
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold font-mono transition-colors shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
              style={{ background: '#0c4a6e', border: '1px solid #0ea5e966', color: '#38bdf8' }}
              title={
                !isOutbound ||
                outboundCanDispatch ||
                isDispatchSuccessStatus(doc?.status)
                  ? 'Download generated output file'
                  : 'Review and approve the generated EDI before downloading'
              }
            >
              <Download className="w-3.5 h-3.5" />
              Download {outboundFmtDisplay}
            </button>
          )}
          {isOutbound &&
            outboundCanDispatch &&
            hasGeneratedEdi &&
            !isDispatchSuccessStatus(doc?.status) && (
              <button
                onClick={handleDispatchOutbound}
                disabled={dispatching}
                className="flex items-center gap-2 px-5 py-2 rounded-sm text-[11px] font-black font-mono transition-all shrink-0"
                style={{
                  background: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
                  color: '#fff',
                  border: '1px solid #7c3aed66',
                  boxShadow: '0 0 20px #7c3aed44',
                  opacity: dispatching ? 0.7 : 1,
                }}
                title="Send generated EDI to partner via configured transport"
              >
                {dispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {dispatching ? 'Dispatching…' : 'Dispatch'}
              </button>
            )}
          {(doc?.status === 'Needs Review' ||
            doc?.status === 'Generated' ||
            doc?.status === 'Exception') &&
            !suppressAiUi && (
            <button
              onClick={handleApprove}
              disabled={approving || exceptionApproveBlocked}
              className="flex items-center gap-2 px-5 py-2 rounded-sm text-[11px] font-black font-mono transition-all shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg,#10b981,#059669)',
                color: '#fff',
                border: '1px solid #10b98166',
                boxShadow: '0 0 20px #10b98144',
                opacity: approving ? 0.7 : 1,
              }}
              title={
                doc?.status === 'Exception' && (canonicalApproveBlocked || hasHighEdiBlockers)
                  ? canonicalApproveBlocked
                    ? 'Resolve canonical blockers (see panel) before approving'
                    : 'Resolve HIGH/Critical EDI structural issues before approving'
                  : 'Approve this document and move to Ready for Dispatch'
              }
            >
              {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {approving ? 'Approving…' : 'Approve & Continue'}
            </button>
          )}

          {doc?.status === 'Exception' && !suppressAiUi && (
            <button
              type="button"
              onClick={handleReject}
              disabled={rejecting}
              className="flex items-center gap-2 px-4 py-2 rounded-sm text-[11px] font-black font-mono transition-all shrink-0 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg,#7f1d1d,#991b1b)',
                color: '#fecaca',
                border: '1px solid var(--status-error-text)66',
              }}
            >
              {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              {rejecting ? 'Rejecting…' : 'Reject Document'}
            </button>
          )}

          <button onClick={handleRerun} disabled={rerunning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold font-mono transition-colors shrink-0"
            style={{ background: '#0c1a2e', border: '1px solid #22d3ee44', color: '#22d3ee' }}>
            {rerunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Re-run Translation
          </button>

          {/* Dispatch to Partner — for inbound Ready for Dispatch (hidden during Exception) */}
          {isInbound && doc?.status !== 'Exception' && (
            <button
              onClick={handleCreateOutbound}
              disabled={sending || !canCreateOutbound}
              className="flex items-center gap-2 px-5 py-2 rounded-sm text-[11px] font-black font-mono transition-all shrink-0"
              style={{
                background: outboundId
                  ? '#052e16'
                  : canCreateOutbound
                  ? 'linear-gradient(135deg,#7c3aed,#6d28d9)'
                  : '#1e293b',
                border: outboundId
                  ? '1px solid var(--status-success-text)44'
                  : canCreateOutbound
                  ? '1px solid #7c3aed'
                  : '1px solid #334155',
                color: outboundId ? 'var(--status-success-text)' : canCreateOutbound ? '#fff' : '#475569',
                boxShadow: canCreateOutbound && !outboundId ? '0 0 24px #7c3aed55' : 'none',
                cursor: !canCreateOutbound && !outboundId ? 'not-allowed' : 'pointer',
              }}>
              {sending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : outboundId
                ? <ClipboardCheck className="w-4 h-4" />
                : <Zap className="w-4 h-4" />}
              {sending ? 'Creating…' : outboundId ? 'Outbound Created' : 'Dispatch'}
            </button>
          )}
        </div>
      </div>

      {/* Outbound Pipeline Popup — same layout as inbound */}
      {outboundModal && (
        <OutboundProcessingModal
          documentId={outboundModal.outboundId}
          fileName={outboundModal.fileName}
          inboundId={id}
          onClose={() => {
            setOutboundModal(null);
            load();
          }}
        />
      )}
    </div>
  );
};
