import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

/**
 * Unknown trading partner after strict upload validation (422 PARTNER_VALIDATION_FAILED).
 * Dark theme; "+ Add Trading Partner" / "Cancel Upload" — no document was created.
 */
export function PartnerNotConfiguredModal({
  open,
  onOpenChange,
  senderId,
  gsSenderId,
  fileName,
  docType,
  detailMessage,
  onAddTradingPartner,
  onCancelUpload,
}) {
  const senderDisplay = [senderId, gsSenderId].filter(Boolean).join(' · ') || '—';

  const handleAdd = () => {
    onAddTradingPartner?.();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancelUpload?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xl [&>button]:text-[var(--text-secondary)] [&>button]:hover:text-[var(--text-primary)]">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/35">
              <AlertTriangle className="h-5 w-5 text-[var(--status-warn-text)]" aria-hidden />
            </div>
            <DialogTitle className="text-left text-lg font-semibold text-[var(--text-primary)]">
              Unknown Trading Partner
            </DialogTitle>
          </div>
          <DialogDescription className="text-left text-sm text-[var(--text-primary)] leading-relaxed">
            We couldn&apos;t match this file to a known trading partner in your portal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-left rounded-lg border border-[var(--border-focus)] bg-[var(--bg-elevated)] px-3 py-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Detected from file</p>
          <ul className="space-y-2 text-xs text-[var(--text-primary)]">
            <li>
              <span className="text-[var(--text-muted)]">Sender ID (ISA / primary):</span>{' '}
              <span className="font-mono text-amber-200/90">{senderDisplay}</span>
            </li>
            {fileName ? (
              <li>
                <span className="text-[var(--text-muted)]">File name:</span>{' '}
                <span className="font-mono text-[var(--text-primary)]">{fileName}</span>
              </li>
            ) : null}
            {docType ? (
              <li>
                <span className="text-[var(--text-muted)]">Doc type:</span>{' '}
                <span className="font-mono text-[var(--text-primary)]">{docType}</span>
              </li>
            ) : null}
          </ul>
        </div>
        <p className="text-xs text-[var(--text-secondary)] text-left">
          To process this file, add the trading partner in your Partner Portal first.
        </p>
        {detailMessage ? (
          <p className="text-xs text-amber-200/80 border-l-2 border-amber-500/40 pl-3 py-0.5 text-left">
            {detailMessage}
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row sm:justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={handleCancel}
          >
            Cancel Upload
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={handleAdd}
          >
            + Add Trading Partner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
