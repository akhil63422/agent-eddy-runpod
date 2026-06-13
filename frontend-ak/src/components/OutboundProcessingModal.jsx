import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  X, CheckCircle2, AlertTriangle, GitBranch, FileJson, Truck, BarChart3,
  ArrowUpFromLine,
} from 'lucide-react';
import { documentsService } from '@/services/documents';
import { Button } from '@/components/ui/button';

// ─────────────────────────────────────────────────────────────────────────────
// Outbound pipeline: 4 steps (Route → Transform → Deliver → Monitor)
// ─────────────────────────────────────────────────────────────────────────────
const STEPS = [
  { num: 1, key: 'route',    label: 'ROUTE',    short: 'RTE', icon: GitBranch,  color: '#60a5fa', glow: '#60a5fa' },
  { num: 2, key: 'transform', label: 'TRANSFORM', short: 'XFM', icon: FileJson,   color: '#a78bfa', glow: '#a78bfa' },
  { num: 3, key: 'deliver',  label: 'DELIVER',  short: 'DLV', icon: Truck,      color: '#34d399', glow: '#34d399' },
  { num: 4, key: 'monitor',  label: 'MONITOR',  short: 'LOG', icon: BarChart3,  color: '#22d3ee', glow: '#22d3ee' },
];

const TERMINAL = ['Delivered', 'Failed', 'Needs Review', 'COMPLETED'];
const ROW1 = STEPS;

// Map backend stage/status to step number (Created→1, Routing→2, Delivering→3, Delivered→4)
function statusToStep(status, stage) {
  const s = (stage || status || '').toLowerCase();
  if (s === 'delivered') return 4;
  if (s === 'completed') return 4;
  if (s === 'needs review') return 4;
  if (s === 'delivering') return 3;
  if (s === 'routing') return 2;
  return 1; // Created or default
}

function getStepStatus(stepNum, currentStep, finalStatus) {
  if (finalStatus === 'Failed' && stepNum === currentStep) return 'error';
  if (stepNum < currentStep) return 'done';
  if (stepNum === currentStep) return TERMINAL.includes(finalStatus) ? 'done' : 'active';
  return 'idle';
}

const Particle = ({ delay = 0 }) => (
  <motion.div
    className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[var(--text-muted)]"
    style={{ left: '-8px' }}
    animate={{ left: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
    transition={{ duration: 2.4, delay, repeat: Infinity, ease: 'linear' }}
  />
);

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

const StepNode = ({ step, status }) => {
  const Icon = step.icon;
  const isDone = status === 'done';
  const isActive = status === 'active';
  const isError = status === 'error';
  const isIdle = status === 'idle';

  return (
    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
      <div className="relative">
        {isActive && (
          <motion.div
            className="absolute -inset-2 rounded-sm"
            style={{ boxShadow: `0 0 20px 6px ${step.glow}66` }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
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
            backgroundColor: isDone ? '#003d4f' : isActive ? '#003d4f' : isError ? '#5a2a1a' : '#003d4f',
            borderColor: isDone ? step.color : isActive ? step.color : isError ? '#fa6e39' : '#5c6c7a',
            boxShadow: isDone ? `0 0 10px 2px ${step.color}44` : isActive ? `0 0 14px 3px ${step.color}55` : 'none',
          }}
          className="w-11 h-11 rounded-lg border-2 flex items-center justify-center transition-all duration-500 relative z-10"
        >
          {isDone && <CheckCircle2 className="w-5 h-5" style={{ color: step.color }} />}
          {isActive && (
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
              <Icon className="w-5 h-5" style={{ color: step.color }} />
            </motion.div>
          )}
          {isError && <AlertTriangle className="w-5 h-5 text-[var(--status-error-text)]" />}
          {isIdle && <Icon className="w-4 h-4 text-[var(--text-muted)]" />}
        </motion.div>
      </div>
      <div className={`text-[9px] font-black font-mono px-1.5 py-0.5 rounded
        ${isDone ? 'text-[var(--status-success-text)] bg-[var(--bg-subtle)]' : isActive ? 'text-[var(--text-primary)] bg-primary/10' : 'text-[var(--text-muted)] bg-[var(--bg-subtle)]'}`}
        style={isDone ? { color: step.color } : {}}
      >
        {step.short}
      </div>
    </div>
  );
};

const STEP_LOGS = {
  1: '[RTE] Evaluating routing rules · selecting target system...',
  2: '[XFRM] Applying transformations if required...',
  3: '[DLV] Posting to ERP · delivering via transport...',
  4: '[LOG] Writing audit trail · monitoring ACK...',
};

export const OutboundProcessingModal = ({ documentId, fileName, inboundId, onClose }) => {
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState(['[INIT] Outbound pipeline started...']);
  const intervalRef = useRef(null);
  const logRef = useRef(null);
  const prevStep = useRef(0);

  useEffect(() => {
    if (!documentId) return;

    const poll = async () => {
      try {
        const data = await documentsService.getById(documentId, true);
        setDoc(data);

        const stage = data?.stage || data?.status;
        const step = statusToStep(data?.status, stage);
        if (step !== prevStep.current) {
          prevStep.current = step;
          const line = STEP_LOGS[step];
          if (line) {
            setLogs(prev => [...prev.slice(-20), line]);
            setTimeout(() => logRef.current?.scrollTo({ top: 9999, behavior: 'smooth' }), 50);
          }
        }

        if (TERMINAL.includes(data?.status)) {
          clearInterval(intervalRef.current);
          let finalLine = '[DONE] ✓ Pipeline finished.';
          if (data.status === 'Delivered') {
            finalLine =
              '[DONE] ✓ Outbound transmission delivered — parent inbound marked Dispatched.';
          } else if (data.status === 'Failed') {
            finalLine = '[ERR]  Outbound pipeline failed — see validation report.';
          } else if (data.status === 'Needs Review') {
            finalLine =
              '[DONE] ✓ Outbound generated — open the document to review, approve, then dispatch.';
          }
          setLogs(prev => [...prev, finalLine]);
        }
      } catch {
        setError('Connection lost.');
        clearInterval(intervalRef.current);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 1500);
    return () => clearInterval(intervalRef.current);
  }, [documentId]);

  // Use backend's processing_step if available, otherwise calculate from status
  const currentStep = doc ? (doc.processing_step || statusToStep(doc.status, doc.stage)) : 1;
  const finalStatus = doc?.status;
  const isDone = TERMINAL.includes(finalStatus);
  // For terminal states (Delivered, Failed, Needs Review, COMPLETED), always show 100%
  const progress = isDone ? 100 : Math.min(Math.round((currentStep / 4) * 100), 100);


  const erpPosted = doc?.erp_posted;
  const statusColor =
    finalStatus === 'Delivered'
      ? 'var(--status-success-text)'
      : finalStatus === 'COMPLETED'
        ? 'var(--status-success-text)'
        : finalStatus === 'Failed'
          ? 'var(--status-error-text)'
          : finalStatus === 'Needs Review'
            ? '#facc15'
            : '#22d3ee';
  const statusLabel = finalStatus === 'Delivered'
    ? 'DELIVERY COMPLETE'
    : finalStatus === 'COMPLETED'
      ? 'PROCESSING COMPLETE'
      : finalStatus === 'Failed'
        ? 'PIPELINE FAILED'
        : finalStatus === 'Needs Review'
          ? 'READY FOR YOUR REVIEW'
          : `PROCESSING — STEP ${currentStep}/4`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/85 backdrop-blur-md"
          onClick={isDone ? onClose : undefined}
        />
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

          {/* Header */}
          <div className="relative z-10 px-6 pt-5 pb-3 border-b border-[var(--border)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <motion.div className="inline-flex items-center gap-2 mb-2"
                  animate={{ opacity: isDone ? 1 : [1, 0.6, 1] }}
                  transition={{ duration: 1.4, repeat: isDone ? 0 : Infinity }}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
                  <span className="text-xs font-semibold tracking-wide" style={{ color: statusColor }}>{statusLabel}</span>
                </motion.div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">Outbound Pipeline</h2>
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

          {/* Pipeline Track */}
          <div className="relative z-10 px-6 py-4">
            <div className="flex items-center">
              {ROW1.map((step, i) => (
                <React.Fragment key={step.num}>
                  <StepNode step={step} status={getStepStatus(step.num, currentStep, finalStatus)} />
                  {i < ROW1.length - 1 && (
                    <PipeLine done={currentStep > step.num + 1 || (isDone && currentStep >= step.num + 1)} active={currentStep === step.num + 1 && !isDone} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Active step highlight */}
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
                  <motion.div className="w-1 h-7 rounded-full" style={{ backgroundColor: STEPS[currentStep - 1]?.color ?? 'var(--mdb-green)' }}
                    animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{STEPS[currentStep - 1]?.label ?? '—'}</p>
                    <p className="text-xs font-mono text-[var(--text-secondary)] mt-0.5">{STEP_LOGS[currentStep]?.replace(/^\[\w+\]\s+/, '') ?? 'Processing…'}</p>
                  </div>
                  <motion.div className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-full"
                    style={{ color: STEPS[currentStep - 1]?.color ?? 'var(--mdb-green)', backgroundColor: (STEPS[currentStep - 1]?.color ?? '#00ed64') + '18' }}
                    animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
                    Active
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Console log */}
          <div ref={logRef} className="relative z-10 mx-6 mb-4 h-20 overflow-y-auto rounded-lg bg-[var(--bg-base)] border border-[var(--border)] p-3 font-mono">
            {logs.map((line, i) => (
              <motion.p key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                className={`text-[10px] leading-5 ${
                  line.includes('[DONE]') ? 'text-[var(--status-success-text)]' :
                  line.includes('[ERR]') ? 'text-[var(--status-error-text)]' : 'text-[var(--text-primary)]/70'
                }`}>
                {line}
              </motion.p>
            ))}
            {!isDone && (
              <motion.span className="inline-block w-2 h-3 bg-[var(--text-muted)] ml-1 align-middle"
                animate={{ opacity: [1, 0] }} transition={{ duration: 0.6, repeat: Infinity }} />
            )}
          </div>

          {/* Stats bar */}
          <div className="relative z-10 mx-6 mb-5 grid grid-cols-4 gap-2">
            {[
              { label: 'ERP Post', value: erpPosted ? 'Sent' : isDone ? 'Skip' : '…', ok: erpPosted },
              { label: 'Doc Type', value: doc?.document_type || '—', ok: !!doc?.document_type },
              { label: 'Parent', value: inboundId ? inboundId.slice(-12) : '—', ok: !!inboundId },
              { label: 'Status', value: doc?.status || '…', ok: finalStatus === 'Delivered' },
            ].map(stat => (
              <div key={stat.label} className="flex flex-col items-center justify-center py-2 px-1 rounded-lg border text-center"
                style={{
                  borderColor: stat.ok ? 'rgba(0, 237, 100, 0.2)' : 'var(--border)',
                  background: stat.ok ? 'rgba(0, 104, 74, 0.15)' : 'var(--bg-elevated)',
                }}>
                <span className={`text-sm font-semibold font-mono ${stat.ok ? 'text-[var(--status-success-text)]' : 'text-[var(--text-secondary)]'}`}>{stat.value}</span>
                <span className="text-[10px] text-[var(--text-muted)] mt-0.5">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="relative z-10 px-6 pb-5 pt-3 border-t border-[var(--border)] flex items-center justify-between">
            <div className="text-[11px] font-mono text-[var(--text-muted)]">{documentId?.slice(-12)?.toUpperCase() ?? '—'}</div>
            {isDone ? (
              <div className="flex items-center gap-2">
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}>
                  <Button size="sm" onClick={() => { onClose(); navigate('/outbound'); }}>
                    <ArrowUpFromLine className="w-4 h-4" />
                    Go to Outbound
                  </Button>
                </motion.div>
                <Button variant="outline" size="sm" onClick={onClose}>
                  Close
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <motion.div className="w-1.5 h-1.5 rounded-full bg-[var(--mdb-green)]" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />
                Live · polling every 1.5s
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
