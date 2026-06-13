import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { documentsService } from '@/services/documents';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Eye, ChevronRight, ChevronDown, ArrowRight, AlertTriangle } from 'lucide-react';
import { getDocumentStatusBadge } from '@/lib/statusBadgeClasses';

function docTypeIcon(docType) {
  const t = (docType || '').toUpperCase();
  if (t.includes('850')) return '📦';
  if (t.includes('997') || t.includes('999')) return '✔';
  if (t.includes('855')) return '📩';
  if (t.includes('856')) return '🚚';
  if (t.includes('810')) return '🧾';
  if (t.includes('820')) return '💳';
  return '📄';
}

function getStatusBadge(status) {
  const { label, className } = getDocumentStatusBadge(status);
  return <span className={className}>{label}</span>;
}

/** Root / child row: primary status badge plus optional warning glyph when warnings live in metadata. */
function flowRowStatusBadge(node) {
  if (!node) return getStatusBadge('Processing');
  const st = node.status || '';
  const low = st.toLowerCase().trim();
  const showWarn =
    node.has_warnings &&
    (low === 'dispatched' ||
      low === 'delivered' ||
      low === 'completed' ||
      low === 'ready for dispatch');
  const n = Number(node.warning_count);
  const tip =
    Number.isFinite(n) && n > 0
      ? `${n} validation warning(s) — document proceeded`
      : 'Validation warnings — document proceeded';
  return (
    <span className="inline-flex items-center gap-1">
      {getStatusBadge(st)}
      {showWarn && (
        <span title={tip}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--status-warn-text)]" aria-hidden />
        </span>
      )}
    </span>
  );
}

/** File upload / receive time from API ISO string */
function formatUploadTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Prefer trading partner business name; fall back to partner code. */
function partnerLabel(partnerName, partnerCode) {
  const name = (partnerName || '').trim();
  if (name) return name;
  const code = (partnerCode || '').trim();
  return code || '—';
}

function partnerTitle(partnerName, partnerCode) {
  const name = (partnerName || '').trim();
  const code = (partnerCode || '').trim();
  if (name && code && name !== code) return `${name} (${code})`;
  if (name || code) return name || code;
  return undefined;
}

export const ActivityGroupedTable = ({ groups = [], onRefresh }) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  const [reprocessingId, setReprocessingId] = useState(null);

  const handleReprocess = async (e, docId) => {
    e.stopPropagation();
    setReprocessingId(docId);
    try {
      const res = await documentsService.reprocess(docId);
      if (res?.success === false) {
        toast.error(res?.message || 'Partner still not configured. Add partner first.');
      } else {
        toast.success(res?.message || 'Pipeline re-started');
      }
      onRefresh?.();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Reprocess failed';
      toast.error(String(msg));
    } finally {
      setReprocessingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      const hay = [
        g.flow_label,
        g.group_id,
        g.document_number,
        g.file_name,
        g.partner_code,
        g.partner_name,
        g.doc_type,
        g.received_at,
        g.root?.received_at,
        ...(g.children || []).map((c) =>
          [c.file_name, c.doc_type, c.document_number, c.received_at, c.partner_code, c.partner_name].join(' ')
        ),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [groups, filter]);

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        queueMicrotask(() => onRefresh?.());
      }
      return next;
    });
  };

  const openDoc = (e, id) => {
    e.stopPropagation();
    navigate(`/document/${id}`);
  };

  if (!groups.length) {
    return (
      <div className="rounded-sm border border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--text-secondary)]">
        No EDI activity yet. Upload a document to see grouped transactions.
      </div>
    );
  }

  if (!filtered.length) {
    return (
      <div className="space-y-3">
        <Input
          placeholder="Filter by PO #, file name, partner…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-md"
        />
        <div className="rounded-sm border border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--text-secondary)]">
          No flows match your filter.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter by PO #, file name, partner…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-md"
        />
        <span className="font-mono text-xs text-[var(--text-muted)]">{filtered.length} flow(s)</span>
      </div>

      <div className="overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--bg-surface)]">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-[var(--border-subtle)] hover:bg-[#0f0f0f]">
              <TableHead className="w-10" />
              <TableHead>Flow / File</TableHead>
              <TableHead>Doc #</TableHead>
              <TableHead className="whitespace-nowrap">Uploaded</TableHead>
              <TableHead>From</TableHead>
              <TableHead className="w-4" />
              <TableHead>To</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((g) => {
              const rid = g.root_document_id;
              const isOpen = expanded.has(rid);
              const hasKids = (g.children || []).length > 0;

              return (
                <React.Fragment key={rid}>
                  <TableRow
                    className="cursor-pointer border-b border-[var(--border-subtle)] bg-[var(--bg-base)] hover:bg-[var(--bg-subtle)]"
                    onClick={() => hasKids && toggle(rid)}
                  >
                    <TableCell className="align-middle w-10">
                      {hasKids ? (
                        <button
                          type="button"
                          className="rounded-sm p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(rid);
                          }}
                          aria-expanded={isOpen}
                        >
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      ) : (
                        <span className="inline-block w-6" />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[11px] text-[var(--text-secondary)]">{g.flow_label}</span>
                        <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                          <span>{docTypeIcon(g.doc_type)}</span>
                          <span className="truncate max-w-[280px]" title={g.file_name}>
                            {g.file_name}
                          </span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-[var(--text-primary)]">
                      {g.document_number || '—'}
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap text-xs text-[var(--text-secondary)]"
                      title={g.received_at || g.root?.received_at || ''}
                    >
                      {formatUploadTime(g.received_at || g.root?.received_at)}
                    </TableCell>
                    {/* FROM */}
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--bg-surface)]">
                            <span className="font-mono text-[10px] font-medium text-[var(--text-secondary)]">
                              {(g.sender_name || '?').charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="max-w-[110px] truncate text-sm font-medium text-[var(--text-primary)]" title={g.sender_name}>
                            {g.sender_name || '—'}
                          </span>
                        </div>
                        {g.partner_validation_status === 'INVALID' && (
                          <Badge variant="error" className="w-fit normal-case">
                            Partner Not Configured
                          </Badge>
                        )}
                        {g.processing_error_message && g.partner_validation_status === 'INVALID' && (
                          <span className="max-w-[160px] text-[10px] leading-tight text-[var(--status-error-text)]">
                            {g.processing_error_message}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {/* Arrow */}
                    <TableCell className="px-0">
                      <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    </TableCell>
                    {/* TO */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--bg-surface)]">
                          <span className="font-mono text-[10px] font-medium text-[var(--text-secondary)]">
                            {(g.receiver_name || '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="max-w-[110px] truncate text-sm font-medium text-[var(--text-primary)]" title={g.receiver_name}>
                          {g.receiver_name || '—'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="draft" className="text-xs normal-case">
                        {g.doc_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs normal-case text-[var(--text-secondary)]">
                        {g.direction}
                      </Badge>
                    </TableCell>
                    <TableCell>{flowRowStatusBadge(g.root)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {g.partner_validation_status === 'INVALID' && (
                          <>
                            <Button variant="outline" size="sm" asChild className="h-7 text-[10px] text-[var(--status-error-text)]">
                              <Link to="/partners" onClick={(e) => e.stopPropagation()}>
                                Add Partner
                              </Link>
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-7 text-[10px]"
                              disabled={reprocessingId === rid}
                              onClick={(e) => handleReprocess(e, rid)}
                            >
                              {reprocessingId === rid ? '…' : 'Reprocess'}
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => openDoc(e, rid)}
                          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {isOpen &&
                    (g.children || []).map((c) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer border-b border-[var(--border-subtle)] bg-[var(--bg-base)] hover:bg-[var(--bg-subtle)]"
                        onClick={(e) => openDoc(e, c.id)}
                      >
                        <TableCell />
                        <TableCell>
                          <div className="ml-2 border-l-2 border-[var(--border)] py-0.5 pl-8">
                            <span className="mr-2 text-xs text-[var(--text-muted)]">↳</span>
                            <span className="mr-2 text-xs text-[var(--text-secondary)]">{docTypeIcon(c.doc_type)}</span>
                            <span className="inline-block max-w-[240px] truncate align-middle text-xs text-[var(--text-primary)]">
                              {c.file_name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-[var(--text-muted)]">
                          {c.document_number || '—'}
                        </TableCell>
                        <TableCell
                          className="whitespace-nowrap text-[11px] text-[var(--text-muted)]"
                          title={c.received_at || ''}
                        >
                          {formatUploadTime(c.received_at)}
                        </TableCell>
                        {/* child FROM */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--bg-surface)]">
                              <span className="font-mono text-[10px] font-medium text-[var(--text-secondary)]">
                                {(c.sender_name || '?').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="max-w-[110px] truncate text-sm font-medium text-[var(--text-primary)]" title={c.sender_name}>
                              {c.sender_name || '—'}
                            </span>
                          </div>
                        </TableCell>
                        {/* child arrow */}
                        <TableCell className="px-0">
                          <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                        </TableCell>
                        {/* child TO */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--bg-surface)]">
                              <span className="font-mono text-[10px] font-medium text-[var(--text-secondary)]">
                                {(c.receiver_name || '?').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="max-w-[110px] truncate text-sm font-medium text-[var(--text-primary)]" title={c.receiver_name}>
                              {c.receiver_name || '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="draft" className="text-[10px] normal-case">
                            {c.doc_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] normal-case text-[var(--text-secondary)]">
                            {c.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{flowRowStatusBadge(c)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            onClick={(e) => openDoc(e, c.id)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
