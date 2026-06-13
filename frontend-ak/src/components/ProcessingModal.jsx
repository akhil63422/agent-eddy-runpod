import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  X, CheckCircle2, AlertTriangle, Zap, Shield, Cpu,
  Radio, CloudUpload, ClipboardList, ArrowDownToLine,
} from 'lucide-react';
import { documentsService } from '@/services/documents';
import { inboundFormatShortFromDoc } from '@/utils/formatLabels';
import { Button } from '@/components/ui/button';

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline step definitions
// ─────────────────────────────────────────────────────────────────────────────
// Inbound pipeline: 5 steps only (Receive → Detect → Parse → ACK → Transform → Ready for Dispatch)
const STEPS = [
  { num: 1,  key: 'receive',    label: 'RECEIVE',        short: 'RCV', icon: CloudUpload, color: 'var(--status-error-text)', glow: 'var(--status-error-text)' },
  { num: 2,  key: 'detect',     label: 'DETECT STD',     short: 'DET', icon: Radio,       color: '#fb923c', glow: '#fb923c' },
  { num: 3,  key: 'parse',      label: 'PARSE+VALIDATE', short: 'PRS', icon: Shield,      color: '#facc15', glow: '#facc15' },
  { num: 4,  key: 'ack',        label: 'SEND ACK',       short: 'ACK', icon: Zap,         color: 'var(--status-success-text)', glow: 'var(--status-success-text)' },
  { num: 5,  key: 'transform',  label: 'TRANSFORM',      short: 'XFM', icon: Cpu,         color: '#2dd4bf', glow: '#2dd4bf' },
];

const TERMINAL = [
  'Ready for Dispatch', 'Completed', 'Needs Review', 'Failed', 'Duplicate',
  'Generated', 'Dispatched', 'Delivered', 'Sent', 'Exception', 'Rejected',
];

/** Allow slow pipelines after async upload returns; upload itself is no longer blocked on processing. */
const POLL_MAX_MS = 180000;
const ROW1 = STEPS; // All 5 steps in single row

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getStepStatus(stepNum, currentStep, finalStatus) {
  if (finalStatus === 'Failed' && stepNum === currentStep) return 'error';
  if (finalStatus === 'Duplicate' && stepNum === 1) return 'duplicate';
  if (stepNum < currentStep) return 'done';
  if (stepNum === currentStep) return TERMINAL.includes(finalStatus) ? 'done' : 'active';
  return 'idle';
}

// Floating particle component (travels along pipe)
const Particle = ({ delay = 0, row = 0 }) => (
  <motion.div
    className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[var(--text-muted)]"
    style={{ left: '-8px' }}
    animate={{ left: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
    transition={{ duration: 2.4, delay, repeat: Infinity, ease: 'linear' }}
  />
);

// Animated connecting line with flowing particles
const PipeLine = ({ active, done }) => (
  <div className="relative flex-1 mx-1 h-[2px] overflow-visible">
    <div className={`absolute inset-0 rounded-full transition-colors duration-500
      ${done ? 'bg-[var(--mdb-green-dark)]' : active ? 'bg-[var(--bg-subtle)] animate-pulse' : 'bg-[var(--bg-surface)]/60'}`}
    />
    {(active || done) && (
      <>
        <Particle delay={0} />
        <Particle delay={0.8} />
        <Particle delay={1.6} />
      </>
    )}
  </div>
);

// Individual step node
const StepNode = ({ step, status }) => {
  const Icon = step.icon;
  const isDone      = status === 'done';
  const isActive    = status === 'active';
  const isError     = status === 'error';
  const isDuplicate = status === 'duplicate';
  const isIdle      = status === 'idle';

  return (
    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
      {/* Hex node */}
      <div className="relative">
        {/* Outer glow pulse for active */}
        {isActive && (
          <motion.div
            className="absolute -inset-2 rounded-sm"
            style={{ boxShadow: `0 0 20px 6px ${step.glow}66` }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
        {/* Done ripple */}
        {isDone && (
          <motion.div
            className="absolute -inset-1 rounded-sm border"
            style={{ borderColor: step.color + '44' }}
            initial={{ scale: 0.8, opacity: 1 }}
            animate={{ scale: 1.4, opacity: 0 }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}

        <motion.div
          initial={false}
          animate={{
            backgroundColor: isDone
              ? '#003d4f'
              : isActive
              ? '#003d4f'
              : isError || isDuplicate
              ? '#5a2a1a'
              : '#003d4f',
            borderColor: isDone
              ? step.color
              : isActive
              ? step.color
              : isError || isDuplicate
              ? '#fa6e39'
              : '#5c6c7a',
            boxShadow: isDone
              ? `0 0 10px 2px ${step.color}44`
              : isActive
              ? `0 0 14px 3px ${step.color}55`
              : 'none',
          }}
          className="w-11 h-11 rounded-lg border-2 flex items-center justify-center transition-all duration-500 relative z-10"
        >
          {isDone && <CheckCircle2 className="w-5 h-5" style={{ color: step.color }} />}
          {isActive && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            >
              <Icon className="w-5 h-5" style={{ color: step.color }} />
            </motion.div>
          )}
          {(isError || isDuplicate) && <AlertTriangle className="w-5 h-5 text-[var(--status-error-text)]" />}
          {isIdle && <Icon className="w-4 h-4 text-[var(--text-muted)]" />}
        </motion.div>
      </div>

      {/* Step number badge */}
      <div className={`text-[9px] font-black font-mono px-1.5 py-0.5 rounded
        ${isDone ? 'text-[var(--status-success-text)] bg-[var(--bg-subtle)]' : isActive ? 'text-[var(--text-primary)] bg-primary/10' : 'text-[var(--text-muted)] bg-[var(--bg-subtle)]'}`}
        style={isDone ? { color: step.color } : {}}
      >
        {step.short}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Modal
// ─────────────────────────────────────────────────────────────────────────────
export const ProcessingModal = ({ documentId, fileName, onClose }) => {
  const navigate          = useNavigate();
  const [doc, setDoc]     = useState(null);
  const [error, setError] = useState(null);
  const [logs, setLogs]   = useState(['[INIT] Pipeline boot sequence started...']);
  const intervalRef       = useRef(null);
  const logRef            = useRef(null);
  const prevStep          = useRef(0);
  const pollStartMs       = useRef(0);

  // Fake realtime log lines per step
  const STEP_LOGS = {
    1:  '[RECV] File received · dedup hash computed · queued for processing',
    2:  '[SCAN] Probing envelope headers · detecting ISA/UNB markers...',
    3:  '[PARSE] Splitting segments · running 47 validation rules...',
    4:  '[ACK]  Generating 997 Functional Acknowledgement...',
    5:  '[XFRM] Mapping segments → canonical JSON model...',
    6:  '[ROUTE] Evaluating 12 routing rules · selecting target...',
    7:  '[ERP]  Connecting to ERP endpoint · posting canonical payload...',
    8:  '[REPLY] Generating outbound reply document via template...',
    9:  '[DLVR] Staging outbound delivery queue...',
    10: '[LOG]  Writing audit trail · running anomaly detection...',
  };

  useEffect(() => {
    if (!documentId) return;

    pollStartMs.current = Date.now();

    const stopPoll = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const poll = async () => {
      try {
        if (Date.now() - pollStartMs.current > POLL_MAX_MS) {
          stopPoll();
          try {
            const data = await documentsService.getById(documentId, true);
            setDoc(data);
            setLogs((prev) => [...prev, '[WARN] Polling timed out — opening document.']);
          } catch {
            setError('Connection lost to processing engine.');
          }
          navigate(`/document/${documentId}`);
          return;
        }

        const data = await documentsService.getById(documentId, true);
        setDoc(data);

        const step = data?.processing_step ?? 1;
        if (step !== prevStep.current) {
          prevStep.current = step;
          const line = STEP_LOGS[step];
          if (line) {
            setLogs(prev => [...prev.slice(-20), line]);
            setTimeout(() => logRef.current?.scrollTo({ top: 9999, behavior: 'smooth' }), 50);
          }
        }

        if (TERMINAL.includes(data?.status)) {
          stopPoll();
          const aiFixed = (data?.metadata?.ai_fixed_errors || []).length;
          const dir = data?.effective_direction || data?.direction || 'Inbound';
          const dirLabel = dir === 'Outbound' ? 'Outbound' : 'Inbound';
          const finalLine =
            data.status === 'Ready for Dispatch' || data.status === 'Completed'
              ? aiFixed
                ? '[DONE] ✓ File corrected using AI — ready for dispatch.'
                : `[DONE] ✓ ${dirLabel} complete — ready for dispatch. Go to ${dirLabel}.`
            : data.status === 'Generated'
              ? '[DONE] ✓ Outbound complete — X12 generated. View document.'
            : data.status === 'Dispatched' || data.status === 'Delivered' || data.status === 'Sent'
              ? `[DONE] ✓ Dispatched to partner successfully.`
            : data.status === 'Needs Review'
              ? '[DONE] ✓ File has validation errors — review and fix before dispatch.'
            : data.status === 'Exception'
              ? '[DONE] ✓ Validation exception — open document to review and correct.'
            : data.status === 'Duplicate'
              ? '[SKIP] Duplicate document detected — pipeline halted.'
            : '[ERR]  Pipeline failed — see validation report.';
          setLogs(prev => [...prev, finalLine]);
        }
      } catch {
        setError('Connection lost to processing engine.');
        stopPoll();
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 1500);
    return () => stopPoll();
  }, [documentId, navigate]);

  const currentStep = doc?.processing_step ?? 1;
  const finalStatus = doc?.status;
  const isDone      = TERMINAL.includes(finalStatus);
  const progress    = Math.min(Math.round((currentStep / 5) * 100), 100);

  const confidence  = doc?.ai_confidence_score ?? 0;
  const ackSent     = doc?.acknowledgment_sent;
  const erpPosted   = doc?.erp_posted;
  const replyId     = doc?.metadata?.reply_document_id;
  const segments    = (doc?.parsed_segments ?? []).length;
  const inboundFmt  = doc ? inboundFormatShortFromDoc(doc) : '—';
  const valErrors   = (doc?.validation_results ?? []).filter(v => v.type === 'error' || v.severity === 'High' || v.severity === 'Critical').length;
  const anomaly     = doc?.metadata?.is_anomaly;

  const statusColor = finalStatus === 'Ready for Dispatch' || finalStatus === 'Completed' || finalStatus === 'Dispatched' || finalStatus === 'Delivered' || finalStatus === 'Sent' || finalStatus === 'Generated' ? 'var(--status-success-text)'
    : finalStatus === 'Needs Review' ? '#facc15'
    : finalStatus === 'Exception' ? '#f97316'
    : finalStatus === 'Failed' || finalStatus === 'Duplicate' ? 'var(--status-error-text)'
    : '#22d3ee';

  const aiFixedCount = (doc?.metadata?.ai_fixed_errors || []).length;
  const displayDir = doc?.effective_direction || doc?.direction || 'Inbound';
  const isOutbound = displayDir === 'Outbound';
  const statusLabel =
    finalStatus === 'Ready for Dispatch' || finalStatus === 'Completed'
      ? (aiFixedCount ? 'FILE CORRECTED' : 'READY FOR DISPATCH')
      : finalStatus === 'Generated'
      ? 'OUTBOUND COMPLETE'
      : finalStatus === 'Dispatched' || finalStatus === 'Delivered' || finalStatus === 'Sent'
      ? 'DISPATCHED TO PARTNER'
      : finalStatus === 'Needs Review'
      ? 'NEEDS REVIEW'
      : finalStatus === 'Exception'
      ? 'EXCEPTION — REVIEW REQUIRED'
      : finalStatus === 'Failed'
      ? 'PIPELINE FAILED'
      : finalStatus === 'Duplicate'
      ? 'DUPLICATE DETECTED'
      : `PROCESSING — STEP ${currentStep}/5`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/85 backdrop-blur-md"
          onClick={isDone ? onClose : undefined}
        />

        {/* Main panel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          className="relative z-10 w-full max-w-3xl overflow-hidden rounded-xl"
          style={{
            background: 'var(--bg-surface)',
            border: `1px solid ${statusColor}55`,
            boxShadow: `rgba(0, 30, 43, 0.16) 0px 16px 48px -8px, 0 0 30px ${statusColor}12`,
          }}
        >

          {/* ── Header ── */}
          <div className="relative z-10 px-6 pt-5 pb-3 border-b border-[var(--border)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                {/* Status badge */}
                <motion.div
                  animate={{ opacity: isDone ? 1 : [1, 0.6, 1] }}
                  transition={{ duration: 1.4, repeat: isDone ? 0 : Infinity }}
                  className="inline-flex items-center gap-2 mb-2"
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
                  <span className="text-xs font-semibold tracking-wide" style={{ color: statusColor }}>
                    {statusLabel}
                  </span>
                </motion.div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">EDI Pipeline</h2>
                <p className="text-xs font-mono text-[var(--text-muted)] mt-0.5 truncate max-w-sm">{fileName || documentId}</p>
              </div>

              <div className="flex flex-col items-end gap-2">
                {isDone && (
                  <button onClick={onClose} className="p-1.5 rounded-md hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono" style={{ color: statusColor }}>{progress}%</div>
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">complete</div>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3 h-1 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${statusColor}88, ${statusColor})` }}
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* ── Pipeline Track (5 steps only) ── */}
          <div className="relative z-10 px-6 py-4">
            <div className="flex items-center">
              {ROW1.map((step, i) => (
                <React.Fragment key={step.num}>
                  <StepNode step={step} status={getStepStatus(step.num, currentStep, finalStatus)} />
                  {i < ROW1.length - 1 && (
                    <PipeLine
                      done={currentStep > step.num + 1 || (isDone && currentStep >= step.num + 1)}
                      active={currentStep === step.num + 1 && !isDone}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* ── Active step highlight ── */}
          <AnimatePresence mode="wait">
            {!isDone && (
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="relative z-10 mx-6 mb-4 px-4 py-3 rounded-lg border border-[var(--border-focus)] bg-[var(--bg-elevated)]"
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    className="w-1 h-7 rounded-full"
                    style={{ backgroundColor: STEPS[currentStep - 1]?.color ?? 'var(--mdb-green)' }}
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 0.9, repeat: Infinity }}
                  />
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {STEPS[currentStep - 1]?.label ?? '—'}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">
                      {STEP_LOGS[currentStep]?.replace(/^\[\w+\]\s+/, '') ?? 'Processing…'}
                    </p>
                  </div>
                  <motion.div
                    className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      color: STEPS[currentStep - 1]?.color ?? 'var(--mdb-green)',
                      backgroundColor: (STEPS[currentStep - 1]?.color ?? '#00ed64') + '18',
                    }}
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  >
                    Active
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Console log ── */}
          <div
            ref={logRef}
            className="relative z-10 mx-6 mb-4 h-20 overflow-y-auto rounded-lg bg-[var(--bg-base)] border border-[var(--border)] p-3 font-mono"
          >
            {logs.map((line, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                className={`text-[10px] leading-5 ${
                  line.includes('[DONE]') ? 'text-[var(--status-success-text)]' :
                  line.includes('[WARN]') ? 'text-yellow-400' :
                  line.includes('[ERR]') || line.includes('[SKIP]') ? 'text-[var(--status-error-text)]' :
                  'text-[var(--text-primary)]/70'
                }`}
              >
                {line}
              </motion.p>
            ))}
            {!isDone && (
              <motion.span
                className="inline-block w-2 h-3 bg-[var(--text-muted)] ml-1 align-middle"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              />
            )}
          </div>

          {/* ── Stats bar ── */}
          <div className="relative z-10 mx-6 mb-5 grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: 'Format', value: inboundFmt, ok: inboundFmt !== '—' },
              { label: 'Segments', value: segments > 0 ? segments : '—', ok: segments > 0 },
              { label: 'Confidence', value: confidence > 0 ? `${(confidence * 100).toFixed(0)}%` : 'N/A', ok: confidence >= 0.85 },
              { label: 'ACK', value: ackSent ? `${doc?.acknowledgment_type ?? '997'}` : isDone ? 'Skip' : '…', ok: ackSent },
              { label: 'ERP Post', value: erpPosted ? 'Sent' : isDone ? 'Skip' : '…', ok: erpPosted },
            ].map(stat => (
              <div key={stat.label}
                className="flex flex-col items-center justify-center py-2 px-1 rounded-lg border text-center"
                style={{
                  borderColor: stat.ok ? 'rgba(0, 237, 100, 0.2)' : 'var(--border)',
                  background: stat.ok ? 'rgba(0, 104, 74, 0.15)' : 'var(--bg-elevated)',
                }}
              >
                <span className={`text-sm font-semibold font-mono ${stat.ok ? 'text-[var(--status-success-text)]' : 'text-[var(--text-secondary)]'}`}>
                  {stat.value}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] mt-0.5">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* ── Final result card ── */}
          <AnimatePresence>
            {isDone && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="relative z-10 mx-6 mb-5 overflow-hidden"
              >
                <div
                  className="rounded-lg p-4 border border-[var(--border-focus)] bg-[var(--bg-elevated)]"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {finalStatus === 'Completed' || finalStatus === 'Ready for Dispatch' ? (
                        <CheckCircle2 className="w-4 h-4 text-[var(--status-success-text)]" />
                      ) : (
                        <AlertTriangle className="w-4 h-4" style={{ color: statusColor }} />
                      )}
                      <span className="text-sm font-semibold" style={{ color: statusColor }}>
                        {finalStatus === 'Ready for Dispatch' || finalStatus === 'Completed'
                          ? ((doc?.metadata?.ai_fixed_errors || []).length
                              ? 'File corrected using AI'
                              : 'Ready for dispatch')
                          : finalStatus === 'Dispatched' || finalStatus === 'Delivered' || finalStatus === 'Sent'
                          ? 'Dispatched to partner'
                          : finalStatus === 'Generated'
                          ? 'Outbound generated'
                          : finalStatus === 'Needs Review'
                          ? 'Needs review — fix validation errors'
                          : finalStatus === 'Exception'
                          ? 'Exception — open document to fix'
                          : finalStatus === 'Duplicate' ? 'Duplicate — pipeline halted' :
                         'Pipeline failure'}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-[var(--text-muted)]">
                      {doc?.document_type} · {inboundFmt}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Reply Doc', value: replyId ? 'Generated' : 'None', ok: !!replyId },
                      { label: 'Val Errors', value: valErrors === 0 ? 'Clear' : `${valErrors} errors`, ok: valErrors === 0 },
                      { label: 'Anomaly', value: anomaly ? 'Flagged ⚠' : 'Clear', ok: !anomaly },
                    ].map(s => (
                      <div key={s.label}
                        className="rounded-lg px-3 py-2 text-center border"
                        style={{
                          borderColor: s.ok ? 'rgba(0, 237, 100, 0.2)' : 'rgba(250, 110, 57, 0.25)',
                          background: s.ok ? 'rgba(0, 104, 74, 0.18)' : 'rgba(90, 42, 26, 0.35)',
                        }}
                      >
                        <div className={`text-xs font-semibold font-mono ${s.ok ? 'text-[var(--status-success-text)]' : 'text-[var(--status-error-text)]'}`}>{s.value}</div>
                        <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Footer ── */}
          <div className="relative z-10 px-6 pb-5 pt-3 border-t border-[var(--border)] flex items-center justify-between">
            <div className="text-[11px] font-mono text-[var(--text-muted)]">
              {documentId?.slice(-12)?.toUpperCase() ?? '—'}
            </div>
            {isDone ? (
              <div className="flex items-center gap-2">
                {/* Go to Inbound/Outbound — primary action */}
                {(finalStatus === 'Ready for Dispatch' || finalStatus === 'Completed' || finalStatus === 'Needs Review' ||
                  finalStatus === 'Generated' || finalStatus === 'Dispatched' || finalStatus === 'Delivered' || finalStatus === 'Sent' ||
                  finalStatus === 'Exception') && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}>
                    <Button
                      size="sm"
                      onClick={() => {
                        onClose();
                        if (finalStatus === 'Exception') {
                          navigate(`/document/${documentId}`);
                        } else {
                          navigate(isOutbound ? '/outbound' : '/inbound');
                        }
                      }}
                    >
                      <ArrowDownToLine className="w-4 h-4" />
                      {finalStatus === 'Exception' ? 'Open document' : `Go to ${displayDir}`}
                    </Button>
                  </motion.div>
                )}
                {/* Check Corrections — when AI fixed errors */}
                {(doc?.metadata?.ai_fixed_errors || []).length > 0 && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { onClose(); navigate(`/document/${documentId}`); }}
                    >
                      <ClipboardList className="w-4 h-4" />
                      Check Corrections
                    </Button>
                  </motion.div>
                )}
                {(finalStatus === 'Failed' || finalStatus === 'Duplicate') && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => { onClose(); navigate(`/document/${documentId}`); }}
                    >
                      <ClipboardList className="w-4 h-4" />
                      View Error Details
                    </Button>
                  </motion.div>
                )}
                <Button variant="outline" size="sm" onClick={onClose}>
                  Close
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <motion.div
                  className="w-1.5 h-1.5 rounded-full bg-[var(--mdb-green)]"
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
                Live · polling every 1.5s
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
