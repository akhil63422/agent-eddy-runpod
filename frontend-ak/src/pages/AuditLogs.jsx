import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { auditLogService } from '@/services/audit';
import { partnersService } from '@/services/partners';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  User,
  Activity,
  Shield,
  Eye,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { KPICard } from '@/components/KPICard';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const PAGE_SIZE = 25;

const ACTION_TYPES = [
  'UPLOAD',
  'REVIEW',
  'CORRECTION',
  'EXPORT',
  'LOGIN',
  'SETTINGS',
  'AI_DECISION',
  'TRANSMISSION',
];

const BADGE_BASE =
  'inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.05em] bg-transparent';
const ACTION_BADGE = {
  UPLOAD: `${BADGE_BASE} border-[var(--status-info)] text-[var(--status-info-text)]`,
  REVIEW: `${BADGE_BASE} border-[var(--status-info)] text-[var(--status-info-text)]`,
  CORRECTION: `${BADGE_BASE} border-[var(--status-warn)] text-[var(--status-warn-text)]`,
  EXPORT: `${BADGE_BASE} border-[var(--border)] text-[var(--text-muted)]`,
  LOGIN: `${BADGE_BASE} border-[var(--border)] text-[var(--text-muted)]`,
  SETTINGS: `${BADGE_BASE} border-[var(--status-warn)] text-[var(--status-warn-text)]`,
  AI_DECISION: `${BADGE_BASE} border-[var(--border)] text-[var(--text-secondary)]`,
  TRANSMISSION: `${BADGE_BASE} border-[var(--status-success)] text-[var(--status-success-text)]`,
};

function listParamsFromDateRange(dr) {
  const now = new Date();
  if (dr === 'today') {
    const s = new Date(now);
    s.setHours(0, 0, 0, 0);
    return { date_from: s.toISOString(), date_to: now.toISOString(), period_days: 1 };
  }
  if (dr === 'last30days') return { period_days: 30 };
  if (dr === 'last90days') return { period_days: 90 };
  return { period_days: 7 };
}

function truncate(s, n = 60) {
  if (!s) return '';
  const t = String(s);
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function isUuid(s) {
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
}

export const AuditLogs = () => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    dateRange: 'last7days',
    user: 'all',
    actionType: 'all',
    partner: 'all',
    search: '',
  });
  const [searchDraft, setSearchDraft] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [facetUsers, setFacetUsers] = useState([]);
  const [partners, setPartners] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [tick, setTick] = useState(0);
  const [detailRow, setDetailRow] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportFormat, setExportFormat] = useState('csv');

  const [kpiData, setKpiData] = useState([
    { title: 'Total Events', value: '0', subtitle: 'Selected period', trend: 'neutral', trendValue: null, icon: Activity },
    { title: 'User Actions', value: '0', subtitle: 'Human', trend: 'neutral', trendValue: null, variant: 'success', icon: User },
    { title: 'AI Decisions', value: '0', subtitle: 'AI & automated', trend: 'neutral', trendValue: null, icon: Activity },
    { title: 'Security Events', value: '0', subtitle: 'Login & settings', trend: 'neutral', trendValue: null, variant: 'warning', icon: Shield },
  ]);

  const dateApiParams = useMemo(() => listParamsFromDateRange(filters.dateRange), [filters.dateRange]);

  const secondsAgo = useMemo(() => {
    if (lastUpdated == null) return null;
    return Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000));
  }, [lastUpdated, tick]);

  const loadSummary = useCallback(async () => {
    try {
      const s = await auditLogService.getSummary({
        period_days: dateApiParams.period_days ?? 7,
        date_to: dateApiParams.date_to,
        date_from: dateApiParams.date_from,
      });
      const pd = s.period_days ?? dateApiParams.period_days ?? 7;
      setKpiData([
        { title: 'Total Events', value: String(s.total_events ?? 0), subtitle: `Last ${pd} days`, trend: 'neutral', trendValue: null, icon: Activity },
        { title: 'User Actions', value: String(s.user_actions ?? 0), subtitle: 'Human', trend: 'neutral', trendValue: null, variant: 'success', icon: User },
        { title: 'AI Decisions', value: String(s.ai_decisions ?? 0), subtitle: 'AI & automated', trend: 'neutral', trendValue: null, icon: Activity },
        { title: 'Security Events', value: String(s.security_events ?? 0), subtitle: 'Login & settings', trend: 'neutral', trendValue: null, variant: 'warning', icon: Shield },
      ]);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load audit summary');
    }
  }, [dateApiParams.period_days, dateApiParams.date_to, dateApiParams.date_from]);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      const data = await auditLogService.getList({
        ...dateApiParams,
        page: currentPage,
        page_size: PAGE_SIZE,
        user: filters.user,
        action_type: filters.actionType,
        partner: filters.partner,
        search: filters.search,
      });
      setRows(Array.isArray(data.results) ? data.results : []);
      setTotal(Number(data.total) || 0);
      setLastUpdated(Date.now());
    } catch (e) {
      console.error(e);
      toast.error('Failed to load audit logs');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [currentPage, dateApiParams, filters.user, filters.actionType, filters.partner, filters.search]);

  const refreshAll = useCallback(async () => {
    await loadSummary();
    await loadList();
  }, [loadSummary, loadList]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      loadSummary();
      loadList();
    }, 30000);
    return () => clearInterval(id);
  }, [loadSummary, loadList]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchDraft }));
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchDraft]);

  useEffect(() => {
    (async () => {
      try {
        const f = await auditLogService.getFacets({
          ...dateApiParams,
          period_days: dateApiParams.period_days || 90,
        });
        setFacetUsers(Array.isArray(f.users) ? f.users : []);
      } catch {
        setFacetUsers([]);
      }
    })();
  }, [dateApiParams]);

  useEffect(() => {
    (async () => {
      try {
        const list = await partnersService.getAll({ limit: 300, forceApi: true });
        const arr = Array.isArray(list) ? list : [];
        setPartners(arr);
      } catch {
        setPartners([]);
      }
    })();
  }, []);

  useEffect(() => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    setExportTo(now.toISOString().slice(0, 10));
    setExportFrom(from.toISOString().slice(0, 10));
  }, [exportOpen]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const getResultStyle = (result) => {
    const r = (result || 'SUCCESS').toUpperCase();
    if (r === 'FAILED')
      return {
        badge: `${BADGE_BASE} border-[var(--status-error)] text-[var(--status-error-text)]`,
        border: 'border-l-[var(--status-error)]',
      };
    if (r === 'PENDING')
      return {
        badge: `${BADGE_BASE} border-[var(--status-warn)] text-[var(--status-warn-text)]`,
        border: 'border-l-[var(--status-warn)]',
      };
    return {
      badge: `${BADGE_BASE} border-[var(--status-success)] text-[var(--status-success-text)]`,
      border: 'border-l-[var(--status-success)]',
    };
  };

  const userVisual = (userType) => {
    const u = (userType || 'HUMAN').toUpperCase();
    if (u === 'AI') return { ring: 'ring-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]', label: 'AI' };
    if (u === 'SYSTEM') return { ring: 'ring-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)]', label: 'Sys' };
    return { ring: 'ring-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)]', label: 'H' };
  };

  const actionBadgeClass = (at) =>
    ACTION_BADGE[at] || `${BADGE_BASE} border-[var(--border)] text-[var(--text-muted)]`;

  const openEntity = (row) => {
    const et = (row.entity_type || '').toUpperCase();
    const eid = row.entity_id;
    if (et === 'DOCUMENT' && eid && isUuid(eid)) {
      navigate(`/document/${eid}`);
      return;
    }
    if (et === 'PARTNER' && eid && isUuid(eid)) {
      navigate(`/partners/${eid}`);
    }
  };

  const runExport = async () => {
    if (!exportFrom || !exportTo) {
      toast.error('Select date range');
      return;
    }
    const date_from = new Date(exportFrom + 'T00:00:00.000Z').toISOString();
    const date_to = new Date(exportTo + 'T23:59:59.999Z').toISOString();
    try {
      setExportLoading(true);
      const blob = await auditLogService.export({
        date_from,
        date_to,
        format: exportFormat,
        user: filters.user,
        action_type: filters.actionType,
        partner: filters.partner,
        search: filters.search,
      });
      const ext = exportFormat === 'json' ? 'json' : 'csv';
      const name = `audit_log_${exportFrom}_to_${exportTo}.${ext}`;
      const buf = await blob.arrayBuffer();
      const outBlob = new Blob([buf], { type: exportFormat === 'json' ? 'application/json' : 'text/csv' });
      const url = URL.createObjectURL(outBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      let n = 0;
      try {
        const text = new TextDecoder().decode(buf);
        if (exportFormat === 'json') {
          const parsed = JSON.parse(text);
          n = Array.isArray(parsed) ? parsed.length : 0;
        } else {
          n = Math.max(0, text.trim().split('\n').length - 1);
        }
      } catch {
        n = 0;
      }
      toast.success(`Export complete — ${n} records downloaded`);
      setExportOpen(false);
      await refreshAll();
    } catch (e) {
      console.error(e);
      toast.error('Export failed');
    } finally {
      setExportLoading(false);
    }
  };

  const partnerOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const p of partners) {
      const code = (p.partner_code || p.code || '').trim();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      out.push({ code, label: p.business_name || code });
    }
    return out.sort((a, b) => a.code.localeCompare(b.code));
  }, [partners]);

  return (
    <div className="p-6 space-y-6 bg-background min-h-full text-[var(--text-primary)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] flex items-center gap-3 font-mono tracking-tight">
            <FileText className="w-8 h-8 text-[var(--text-primary)]" />
            Audit Logs
          </h1>
          <p className="text-[var(--text-secondary)] mt-1 text-sm">
            Immutable audit trail — uploads, corrections, AI, transmission, security
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {secondsAgo != null && (
            <span className="text-xs font-mono text-[var(--text-muted)]">Last refreshed: {secondsAgo}s ago</span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refreshAll()}
            className="border-[var(--border-focus)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-mono"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 border-[var(--border-focus)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-mono"
            onClick={() => setExportOpen(true)}
          >
            <Download className="w-4 h-4" />
            Export Logs
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiData.map((kpi, i) => (
          <KPICard key={kpi.title || i} {...kpi} />
        ))}
      </div>

      <Card className="bg-[var(--bg-surface)] border-[var(--border-subtle)]">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-mono text-[var(--text-muted)]">Date range</label>
              <Select value={filters.dateRange} onValueChange={(v) => handleFilterChange('dateRange', v)}>
                <SelectTrigger className="bg-background border-[var(--border)] font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="last7days">Last 7 days</SelectItem>
                  <SelectItem value="last30days">Last 30 days</SelectItem>
                  <SelectItem value="last90days">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-[var(--text-muted)]">User</label>
              <Select value={filters.user} onValueChange={(v) => handleFilterChange('user', v)}>
                <SelectTrigger className="bg-background border-[var(--border)] font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {facetUsers.map((u) => (
                    <SelectItem key={u} value={String(u)}>
                      {String(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-[var(--text-muted)]">Action type</label>
              <Select value={filters.actionType} onValueChange={(v) => handleFilterChange('actionType', v)}>
                <SelectTrigger className="bg-background border-[var(--border)] font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {ACTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-[var(--text-muted)]">Partner</label>
              <Select value={filters.partner} onValueChange={(v) => handleFilterChange('partner', v)}>
                <SelectTrigger className="bg-background border-[var(--border)] font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All partners</SelectItem>
                  {partnerOptions.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.label} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-[var(--text-muted)]">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <Input
                  placeholder="Entity, details, user…"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  className="pl-10 bg-background border-[var(--border)] font-mono text-sm"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[var(--bg-surface)] border-[var(--border-subtle)] overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 border-[var(--border-subtle)] hover:bg-muted/40">
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">Timestamp</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">User</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">Action</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">Action type</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">Entity</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">Partner</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">Details</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">IP</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">Result</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90 text-right">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-16 text-center text-[var(--text-muted)] font-mono">
                      <Loader2 className="w-6 h-6 animate-spin inline mr-2 text-[var(--text-primary)]" />
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-[var(--text-muted)] font-mono text-sm">
                      No audit logs for this filter
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((log, idx) => {
                    const rs = getResultStyle(log.result);
                    const uv = userVisual(log.user_type);
                    const ts = log.timestamp ? new Date(log.timestamp) : null;
                    return (
                      <TableRow
                        key={log.id || idx}
                        className={`border-l-4 ${rs.border} border-[var(--border-subtle)] ${idx % 2 === 1 ? 'bg-[var(--bg-base)]' : 'bg-background/30'} hover:bg-[var(--bg-subtle)]`}
                      >
                        <TableCell className="font-mono text-xs text-[var(--text-secondary)] whitespace-nowrap">
                          {ts ? ts.toLocaleString() : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ring-2 ${uv.ring}`}
                            >
                              {uv.label}
                            </span>
                            <span className="text-sm text-[var(--text-primary)]">{log.user || 'System'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-[var(--text-primary)]">{log.action}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] font-mono border ${actionBadgeClass(log.action_type)}`}>
                            {log.action_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="text-left font-mono text-xs text-[var(--text-primary)] hover:underline"
                            onClick={() => openEntity(log)}
                          >
                            {log.entity_id || '—'}
                          </button>
                          <div className="text-[10px] text-[var(--text-muted)]">{log.entity_type}</div>
                        </TableCell>
                        <TableCell className="text-sm text-[var(--text-primary)]">{log.partner || 'System'}</TableCell>
                        <TableCell className="max-w-[220px] font-mono text-xs text-[var(--text-secondary)]">
                          {truncate(log.details, 60)}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-[var(--text-muted)]">{log.ip_address || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] font-mono border ${rs.badge}`}>
                            {log.result || 'SUCCESS'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            onClick={() => setDetailRow(log)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {!loading && total > 0 && (
            <div className="border-t border-[var(--border-subtle)] px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs font-mono text-[var(--text-muted)]">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)} of {total}{' '}
                entries
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[var(--border)]"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  <ChevronsLeft className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[var(--border)]"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="px-3 text-xs font-mono text-[var(--text-secondary)]">
                  Page {currentPage} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[var(--border)]"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[var(--border)]"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronsRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[var(--bg-surface)]/50 border-[var(--border-subtle)]">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-[var(--text-primary)] shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-[var(--text-primary)] mb-1 font-mono text-sm">Immutable log</p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Entries cannot be edited or deleted from this UI. Export actions are themselves recorded in the
                trail.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)}>
        <SheetContent className="bg-background border-[var(--border-subtle)] text-[var(--text-primary)] overflow-y-auto w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-mono text-[var(--text-primary)]">Audit entry</SheetTitle>
          </SheetHeader>
          {detailRow && (
            <div className="mt-6 space-y-4 text-sm font-mono">
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase">Timestamp</p>
                <p className="text-[var(--text-primary)]">
                  {detailRow.timestamp ? new Date(detailRow.timestamp).toLocaleString() : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase">Details</p>
                <p className="text-[var(--text-primary)] whitespace-pre-wrap break-words">{detailRow.details || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase">Entity ID</p>
                {detailRow.entity_id && isUuid(detailRow.entity_id) && detailRow.entity_type === 'DOCUMENT' ? (
                  <button
                    type="button"
                    className="text-[var(--text-primary)] hover:underline"
                    onClick={() => navigate(`/document/${detailRow.entity_id}`)}
                  >
                    {detailRow.entity_id}
                  </button>
                ) : (
                  <p className="text-[var(--text-primary)] break-all">{detailRow.entity_id || '—'}</p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs">
                {Object.entries(detailRow).map(([k, v]) => {
                  if (['details', 'metadata'].includes(k)) return null;
                  if (v == null || v === '') return null;
                  if (typeof v === 'object') return null;
                  return (
                    <div key={k} className="flex justify-between gap-2 border-b border-[var(--border-subtle)]/80 py-1">
                      <span className="text-[var(--text-muted)]">{k}</span>
                      <span className="text-[var(--text-primary)] text-right break-all">{String(v)}</span>
                    </div>
                  );
                })}
              </div>
              {detailRow.metadata && typeof detailRow.metadata === 'object' && (
                <div>
                  <p className="text-xs text-[var(--text-muted)] uppercase mb-2">Metadata</p>
                  <pre className="text-[11px] bg-[var(--bg-surface)] p-3 rounded-lg border border-[var(--border-subtle)] overflow-x-auto">
                    {JSON.stringify(detailRow.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="bg-background border-[var(--border-subtle)] text-[var(--text-primary)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono text-[var(--text-primary)]">Export Audit Logs</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono text-[var(--text-muted)]">Date from</label>
                <Input
                  type="date"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                  className="bg-[var(--bg-surface)] border-[var(--border)] font-mono mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-mono text-[var(--text-muted)]">Date to</label>
                <Input
                  type="date"
                  value={exportTo}
                  onChange={(e) => setExportTo(e.target.value)}
                  className="bg-[var(--bg-surface)] border-[var(--border)] font-mono mt-1"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-mono text-[var(--text-muted)]">Format</label>
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger className="bg-[var(--bg-surface)] border-[var(--border)] font-mono mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-[var(--text-muted)] font-mono">
              Current table filters (partner, action, user, search) apply to the export.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setExportOpen(false)} className="font-mono">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={runExport}
              disabled={exportLoading}
              className="font-mono bg-primary hover:bg-primary text-[var(--text-primary)]"
            >
              {exportLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
