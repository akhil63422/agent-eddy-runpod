import React, { useMemo } from 'react';
import { Download, Loader2, FileCode, Settings2, RefreshCw, GitCompare } from 'lucide-react';
import { outboundFormatBadgeLabel, contentLooksLikeX12 } from '@/utils/formatLabels';

/**
 * Right panel: system-generated output (never raw upload). Body may be X12, JSON, XML, or CSV per partner.
 * Status: pending | generated | dispatched
 */
export function GeneratedEDIPanel({
  x12Content,
  /** Partner-configured outbound format label, e.g. EDI_X12 | JSON | XML | CSV */
  outputFormat = 'EDI_X12',
  outputStatus = 'pending',
  dispatchedAt = null,
  onGenerate,
  generating = false,
  onDownload,
  generateError = null,
  onRetryGenerate,
  rawInputForDiff = '',
  showDiff = false,
  onToggleDiff,
  /** Document direction: "Inbound" | "Outbound". Controls the panel title. */
  direction = null,
  /** Optional hint under the panel body (e.g. SE count auto-fix). */
  generationFootnote = null,
}) {
  const hasContent = x12Content && String(x12Content).trim().length > 0;
  const formatBadge = outboundFormatBadgeLabel(outputFormat);
  const renderAsEdiSegments =
    (String(outputFormat || '').toUpperCase().replace(/\s+/g, '_') === 'EDI_X12' || String(outputFormat || '').toUpperCase() === 'X12') &&
    contentLooksLikeX12(x12Content);

  const normalizedForDiff = useMemo(() => {
    const raw = (rawInputForDiff || '').trim();
    const gen = (x12Content || '').trim();
    if (!renderAsEdiSegments || !contentLooksLikeX12(raw) || !contentLooksLikeX12(gen)) return null;
    if (!raw || !gen) return null;
    const rawSegs = new Set(
      raw
        .split('~')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const genSegs = gen.split('~').map((s) => s.trim()).filter(Boolean);
    return genSegs.map((seg) => ({
      seg,
      added: !rawSegs.has(seg),
    }));
  }, [rawInputForDiff, x12Content, renderAsEdiSegments]);

  const statusBadge = () => {
    if (outputStatus === 'dispatched') {
      return (
        <span
          className="text-[9px] font-mono px-1.5 py-0.5 rounded ml-auto"
          style={{ background: '#3b82f622', color: '#60a5fa', border: '1px solid #3b82f644' }}
        >
          DISPATCHED
        </span>
      );
    }
    if (hasContent || outputStatus === 'generated') {
      return (
        <span
          className="text-[9px] font-mono px-1.5 py-0.5 rounded ml-auto"
          style={{ background: 'var(--status-success-text)22', color: 'var(--status-success-text)', border: '1px solid var(--status-success-text)44' }}
        >
          GENERATED
        </span>
      );
    }
    return (
      <span
        className="text-[9px] font-mono px-1.5 py-0.5 rounded ml-auto"
        style={{ background: '#facc1522', color: '#facc15', border: '1px solid #facc1544' }}
      >
        PENDING
      </span>
    );
  };

  const renderBody = () => {
    if (generateError) {
      return (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 py-10 px-3">
          <p className="text-xs font-mono text-[var(--status-error-text)] text-center max-w-sm">{generateError}</p>
          {(onRetryGenerate || onGenerate) && (
            <button
              type="button"
              onClick={onRetryGenerate || onGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 rounded-sm text-xs font-bold font-mono border border-red-500/40 text-red-300 hover:bg-red-950/40"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Retry
            </button>
          )}
        </div>
      );
    }

    if (hasContent) {
      const showDiffMode = showDiff && normalizedForDiff && normalizedForDiff.length > 0;
      const bodyText = renderAsEdiSegments
        ? String(x12Content)
            .split('~')
            .filter(Boolean)
            .map((seg, i) => `${seg}~`)
            .join('\n')
        : String(x12Content);
      return (
        <>
          {onToggleDiff && normalizedForDiff && normalizedForDiff.length > 0 && (
            <div className="flex items-center justify-end mb-2 shrink-0">
              <button
                type="button"
                onClick={onToggleDiff}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-mono border transition-colors ${
                  showDiff
                    ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <GitCompare className="w-3.5 h-3.5" />
                View Diff
              </button>
            </div>
          )}
          <pre className="font-mono text-[9.5px] leading-relaxed whitespace-pre-wrap break-all flex-1 overflow-y-auto min-h-0">
            {showDiffMode
              ? normalizedForDiff.map((row, i) => (
                  <span key={i} className={row.added ? 'text-[var(--status-success-text)] block' : 'text-emerald-200/85 block'}>
                    {row.seg}~
                  </span>
                ))
              : bodyText}
          </pre>
          {showDiffMode && (
            <p className="text-[9px] font-mono text-[var(--text-muted)] mt-2 shrink-0">
              Green segments are new vs. raw input (~-delimited). Same line as input stays light.
            </p>
          )}
          {onDownload && (
            <div className="pt-3 mt-3 border-t border-[var(--border-subtle)]/60 shrink-0">
              <button
                type="button"
                onClick={onDownload}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold font-mono transition-all"
                style={{
                  background: 'linear-gradient(135deg,#0ea5e9,#0284c7)',
                  color: '#fff',
                  border: '1px solid #0ea5e966',
                }}
              >
                <Download className="w-3.5 h-3.5" />
                Download file
              </button>
            </div>
          )}
        </>
      );
    }

    const isInboundDir = (direction || '').toLowerCase() === 'inbound';
    const pendingLbl =
      isInboundDir
        ? 'ERP Payload (IDoc JSON)'
        : (String(outputFormat || '').toUpperCase().replace(/\s+/g, '_') === 'EDI_X12' || String(outputFormat || '').toUpperCase() === 'X12'
          ? 'EDI X12'
          : formatBadge);
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 py-10 px-4">
        <div
          className="w-14 h-14 rounded-sm flex items-center justify-center border border-[var(--border)]"
          style={{ background: isInboundDir ? '#6366f118' : '#0ea5e918' }}
        >
          <Settings2 className={`w-7 h-7 ${isInboundDir ? 'text-[var(--text-secondary)]' : 'text-[var(--text-secondary)]'}`} />
        </div>
        <div className="text-center space-y-2 max-w-[280px]">
          <p className="text-sm font-bold font-mono text-[var(--text-primary)]">
            {isInboundDir ? 'ERP payload not yet available' : 'Output not yet generated'}
          </p>
          <p className="text-[10px] font-mono text-[var(--text-muted)] leading-relaxed">
            {isInboundDir
              ? 'The ERP payload (IDoc JSON) is generated automatically by the pipeline after the document is processed.'
              : `Generate the partner-configured outbound file (${pendingLbl}) from canonical JSON.`}
          </p>
        </div>
        {onGenerate && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 rounded-sm text-xs font-bold font-mono transition-all"
            style={{
              background: 'linear-gradient(135deg,#0ea5e9,#0284c7)',
              color: '#fff',
              border: '1px solid #0ea5e966',
              boxShadow: '0 0 20px #0ea5e944',
              opacity: generating ? 0.7 : 1,
            }}
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
            {generating ? 'Generating…' : `Generate ${pendingLbl}`}
          </button>
        )}
        {generationFootnote && (
          <p className="text-[9px] font-mono text-[var(--text-muted)] text-center max-w-xs leading-relaxed px-2">
            {generationFootnote}
          </p>
        )}
      </div>
    );
  };

  const panelTitle = (() => {
    const dir = (direction || '').toLowerCase();
    if (dir === 'inbound') return 'ERP PAYLOAD (IDOC JSON)';
    if (dir === 'outbound') return 'GENERATED EDI X12';
    return 'GENERATED OUTPUT';
  })();

  return (
    <div className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-2 shrink-0 flex-wrap">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        <span className="text-[10px] font-black font-mono text-[var(--text-secondary)] uppercase tracking-widest">
          {panelTitle}
        </span>
        <span
          className="text-[9px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: '#10b98122', color: '#34d399', border: '1px solid #10b98144' }}
        >
          {formatBadge}
        </span>
        {statusBadge()}
      </div>
      {dispatchedAt && outputStatus === 'dispatched' && (
        <div className="px-4 py-1.5 border-b border-[var(--border-subtle)]/80 bg-[var(--bg-base)]">
          <p className="text-[9px] font-mono text-[var(--text-muted)]">
            Dispatched{' '}
            <span className="text-[var(--status-info-text)]/90">{new Date(dispatchedAt).toLocaleString()}</span>
          </p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col min-h-0">{renderBody()}</div>
      {generationFootnote && hasContent && (
        <p className="px-3 pb-2 text-[9px] font-mono text-[var(--text-muted)] shrink-0 border-t border-[var(--border-subtle)]/50 pt-2">
          {generationFootnote}
        </p>
      )}
    </div>
  );
}
