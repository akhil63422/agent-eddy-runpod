import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Circle,
  Loader2,
  ChevronRight,
  Flag,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { inboundFormatShortFromDoc } from '@/utils/formatLabels';

// Step names per pipeline (matches backend STEP_NAMES)
const STEP_NAMES = {
  1: 'Received',
  2: 'Detect Standard',
  3: 'Parse & Validate',
  4: 'Send ACK',
  5: 'Transform',
  6: 'Route',
  7: 'Post to ERP',
  8: 'Generate Reply',
  9: 'Deliver',
  10: 'Log & Monitor',
};

// Status → lifecycle display label (EDICOM-style)
const STATUS_LIFECYCLE = {
  Received: { label: 'Received', icon: Circle, variant: 'secondary', iconColor: 'text-[var(--text-muted)]' },
  'Parsing EDI': { label: 'Parsing', icon: Loader2, variant: 'processing', iconColor: 'text-[var(--status-info-text)]' },
  Processing: { label: 'Processing', icon: Loader2, variant: 'processing', iconColor: 'text-[var(--status-info-text)]' },
  'Ready for Dispatch': { label: 'Ready for Dispatch', icon: CheckCircle2, variant: 'success', iconColor: 'text-[var(--status-success-text)]' },
  Dispatched: { label: 'Dispatched', icon: CheckCircle2, variant: 'success', iconColor: 'text-[var(--status-success-text)]' },
  Completed: { label: 'Completed', icon: CheckCircle2, variant: 'success', iconColor: 'text-[var(--status-success-text)]' },
  'ERP Posted': { label: 'Processed', icon: CheckCircle2, variant: 'success', iconColor: 'text-[var(--status-success-text)]' },
  Delivered: { label: 'Delivered', icon: CheckCircle2, variant: 'success', iconColor: 'text-[var(--status-success-text)]' },
  'ACK Received': { label: 'ACK Received', icon: CheckCircle2, variant: 'success', iconColor: 'text-[var(--status-success-text)]' },
  'Needs Review': { label: 'Needs Review', icon: AlertTriangle, variant: 'warning', iconColor: 'text-[var(--status-warn-text)]' },
  Warning: { label: 'Warning', icon: AlertTriangle, variant: 'warning', iconColor: 'text-[var(--status-warn-text)]' },
  Failed: { label: 'Failed', icon: XCircle, variant: 'error', iconColor: 'text-[var(--status-error-text)]' },
  Duplicate: { label: 'Duplicate', icon: AlertTriangle, variant: 'warning', iconColor: 'text-[var(--status-warn-text)]' },
  Created: { label: 'Created', icon: Circle, variant: 'secondary', iconColor: 'text-[var(--text-muted)]' },
  Routing: { label: 'Routing', icon: Loader2, variant: 'processing', iconColor: 'text-[var(--status-info-text)]' },
  Delivering: { label: 'Delivering', icon: Loader2, variant: 'processing', iconColor: 'text-[var(--status-info-text)]' },
  'Pending ACK': { label: 'Pending ACK', icon: Clock, variant: 'warning', iconColor: 'text-[var(--status-warn-text)]' },
  Generated: { label: 'Generated', icon: CheckCircle2, variant: 'success', iconColor: 'text-[var(--status-success-text)]' },
};

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const s = String(dateStr).trim();
  let d;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (isDateOnly) {
    // Date-only: parse as local noon to avoid UTC-midnight day shift
    d = new Date(s + 'T12:00:00');
  } else {
    // Datetime: if no timezone, assume UTC (backend uses utcnow)
    const hasTz = s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s);
    const normalized = hasTz ? s : s.replace(' ', 'T') + 'Z';
    d = new Date(normalized);
  }
  if (Number.isNaN(d.getTime())) return '—';
  if (isDateOnly) {
    return d.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  return d.toLocaleString('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).replace(',', '');
}

function getDocNumber(doc) {
  const canonical = doc.canonical_json || {};
  const fields = canonical.fields || {};
  return (
    fields.control_number ||
    fields.po_number ||
    fields.invoice_number ||
    canonical.control_number ||
    canonical.po_number ||
    doc._id?.slice(-8) ||
    doc.id?.slice(-8) ||
    '—'
  );
}

function getFormat(doc) {
  return inboundFormatShortFromDoc(doc);
}

function getSituationDisplay(doc, direction) {
  const status = doc.status || 'Received';
  const step = doc.processing_step;
  const config = STATUS_LIFECYCLE[status] || STATUS_LIFECYCLE['Processing'];
  const Icon = config.icon;

  let label = config.label;
  if (step != null && step >= 1 && step <= 10 && status === 'Processing') {
    label = STEP_NAMES[step] || label;
  }

  const meta = doc.metadata || {};
  const low = String(status).toLowerCase();
  const showMetaWarn =
    meta.has_warnings &&
    ['dispatched', 'delivered', 'completed', 'ready for dispatch'].includes(low);
  const wn = Number(meta.warning_count);
  const warnTitle =
    Number.isFinite(wn) && wn > 0
      ? `${wn} validation warning(s) — document proceeded`
      : 'Validation warnings — document proceeded';

  return (
    <div className="flex items-center gap-2">
      {Icon === Loader2 ? (
        <Icon className={`w-4 h-4 animate-spin ${config.iconColor}`} />
      ) : (
        <Icon className={`w-4 h-4 ${config.iconColor}`} />
      )}
      <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
      {showMetaWarn && (
        <span title={warnTitle}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--status-warn-text)]" aria-hidden />
        </span>
      )}
    </div>
  );
}

export function DocumentTable({
  documents,
  direction,
  onViewDetails,
  isLoading,
  emptyMessage = 'No documents found',
  pagination,
}) {
  const navigate = useNavigate();
  const handleView = (id) => {
    if (onViewDetails) onViewDetails(id);
    else navigate(`/document/${id}`);
  };

  const cols = [
    'Situation',
    'Insertion date',
    'Origin',
    'Destination',
    'Doc No',
    'Document type',
    'Date',
    'Situation change date',
    'Flags',
    'Format',
  ];

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-[var(--border-subtle)]">
            {cols.map((c) => (
              <TableHead key={c} className="whitespace-nowrap">
                {c}
              </TableHead>
            ))}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={cols.length + 1} className="text-center py-12">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--text-muted)]" />
                <p className="text-muted-foreground mt-2">Loading...</p>
              </TableCell>
            </TableRow>
          ) : documents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={cols.length + 1} className="text-center py-8 text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            documents.map((doc) => {
              const id = doc._id || doc.id;
              const situationChangeDate = doc.processed_at || doc.updated_at;

              return (
                <TableRow
                  key={id}
                  className="cursor-pointer border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--bg-subtle)]"
                  onClick={() => handleView(id)}
                >
                  <TableCell>{getSituationDisplay(doc, direction)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDateTime(doc.received_at || doc.created_at)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {doc.source_system || doc.partner_code || '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {doc.target_system || '—'}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-[var(--text-primary)]">
                    {getDocNumber(doc)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="draft" className="font-mono text-xs normal-case">
                      {doc.document_type || doc.metadata?.doc_type_hint || '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDateTime(
                      doc.canonical_json?.fields?.date ||
                        doc.canonical_json?.date ||
                        doc.received_at ||
                        doc.created_at
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDateTime(situationChangeDate)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {(doc.exception_ids?.length || 0) > 0 ? (
                        <>
                          <Flag className="h-3.5 w-3.5 text-[var(--status-warn-text)]" />
                          <span className="text-sm">{doc.exception_ids.length}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs normal-case text-[var(--text-secondary)]">
                      {getFormat(doc)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleView(id)}
                      className="text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
                    >
                      See details
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {pagination}
    </div>
  );
}
