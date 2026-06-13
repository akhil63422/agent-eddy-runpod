import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { exceptionsService } from '@/services/exceptions';
import { partnersService } from '@/services/partners';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckCircle2,
  XCircle,
  Clock,
  Brain,
  Eye,
  RefreshCw,
  Sparkles,
  MoreHorizontal,
  UserPlus,
} from 'lucide-react';
import { KPICard } from '@/components/KPICard';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ITEMS_PER_PAGE = 20;

const TYPE_LABELS = {
  PARSE_FAILURE: 'Parse failure',
  VALIDATION_ERROR: 'Validation error',
  LOW_CONFIDENCE: 'Low AI confidence',
  PARTNER_MISMATCH: 'Partner mismatch',
  AUTOFIX_FAILED: 'Auto-fix failed',
  TRANSMISSION_FAILED: 'Transmission failure',
  MISSING_SEGMENT: 'Missing segment',
};

const TYPE_ORDER = Object.keys(TYPE_LABELS);

const SEVERITY_ROW_BORDER = {
  CRITICAL: 'border-l-red-500',
  HIGH: 'border-l-orange-500',
  MEDIUM: 'border-l-yellow-500',
  LOW: 'border-l-blue-500',
};

const BREAKDOWN_SEGMENT_CLASS = {
  PARSE_FAILURE: 'bg-red-500',
  VALIDATION_ERROR: 'bg-amber-400',
  LOW_CONFIDENCE: 'bg-blue-400',
  PARTNER_MISMATCH: 'bg-orange-500',
  AUTOFIX_FAILED: 'bg-purple-500',
  TRANSMISSION_FAILED: 'bg-rose-600',
  MISSING_SEGMENT: 'bg-red-700',
};

function TypeBreakdownBar({ breakdown }) {
  const entries = Object.entries(breakdown || {}).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!total) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-mono text-[var(--text-primary)]/80 uppercase tracking-wider">Exception types</p>
      <div className="flex h-3 w-full rounded-full overflow-hidden bg-[var(--bg-surface)] border border-[var(--border)]">
        {entries.map(([k, v]) => (
          <div
            key={k}
            className={BREAKDOWN_SEGMENT_CLASS[k] || 'bg-slate-500'}
            style={{ width: `${(v / total) * 100}%` }}
            title={`${TYPE_LABELS[k] || k}: ${v}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-[var(--text-secondary)]">
        {entries.map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${BREAKDOWN_SEGMENT_CLASS[k] || 'bg-slate-500'}`} />
            {TYPE_LABELS[k] || k}: {v}
          </span>
        ))}
      </div>
    </div>
  );
}

export const Exceptions = () => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [partners, setPartners] = useState([]);
  const [filters, setFilters] = useState({
    dateRange: 'last30days',
    partner: 'all',
    severity: 'all',
    status: 'all',
    exceptionType: 'all',
    search: '',
  });
  const [searchDraft, setSearchDraft] = useState('');
  const searchDebounceRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [typeBreakdown, setTypeBreakdown] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [tick, setTick] = useState(0);

  const [kpiData, setKpiData] = useState([
    {
      title: 'Active Exceptions',
      value: '0',
      subtitle: 'Requiring attention',
      trend: 'neutral',
      trendValue: null,
      variant: 'warning',
      icon: AlertTriangle,
    },
    {
      title: 'Resolved Today',
      value: '0',
      subtitle: 'Last 24 hours',
      trend: 'neutral',
      trendValue: null,
      variant: 'success',
      icon: CheckCircle2,
    },
    {
      title: 'Low Confidence',
      value: '0',
      subtitle: 'AI review band',
      trend: 'neutral',
      trendValue: null,
      variant: 'warning',
      icon: Brain,
    },
    {
      title: 'Critical Errors',
      value: '0',
      subtitle: 'Immediate action',
      trend: 'neutral',
      trendValue: null,
      variant: 'error',
      icon: XCircle,
    },
  ]);

  const dateRangeParam = (dr) =>
    ({
      last7days: 'last7days',
      last30days: 'last30days',
      today: 'today',
      all: 'all',
    }[dr] || 'last30days');

  const fetchSummary = useCallback(async () => {
    try {
      const s = await exceptionsService.getSummary({
        date_range: dateRangeParam(filters.dateRange),
      });
      setKpiData([
        {
          title: 'Active Exceptions',
          value: String(s.active_exceptions ?? 0),
          subtitle: 'Requiring attention',
          trend: 'neutral',
          trendValue: null,
          variant: 'warning',
          icon: AlertTriangle,
        },
        {
          title: 'Resolved Today',
          value: String(s.resolved_today ?? 0),
          subtitle: 'Last 24 hours',
          trend: 'neutral',
          trendValue: null,
          variant: 'success',
          icon: CheckCircle2,
        },
        {
          title: 'Low Confidence',
          value: String(s.low_confidence ?? 0),
          subtitle: 'AI review band',
          trend: 'neutral',
          trendValue: null,
          variant: 'warning',
          icon: Brain,
        },
        {
          title: 'Critical Errors',
          value: String(s.critical_errors ?? 0),
          subtitle: 'Immediate action',
          trend: 'neutral',
          trendValue: null,
          variant: 'error',
          icon: XCircle,
        },
      ]);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load exception summary');
    }
  }, [filters.dateRange]);

  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      const data = await exceptionsService.getList({
        date_range: dateRangeParam(filters.dateRange),
        page: currentPage,
        page_size: ITEMS_PER_PAGE,
        partner: filters.partner,
        severity: filters.severity,
        status: filters.status,
        exception_type: filters.exceptionType,
        search: filters.search,
      });
      setRows(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total) || 0);
      setTypeBreakdown(data.type_breakdown || {});
      setLastUpdated(Date.now());
    } catch (e) {
      console.error(e);
      toast.error('Failed to load exceptions');
      setRows([]);
      setTotal(0);
      setTypeBreakdown({});
    } finally {
      setLoading(false);
    }
  }, [filters, currentPage]);

  const refreshAll = useCallback(async () => {
    await fetchSummary();
    await fetchList();
  }, [fetchSummary, fetchList]);

  useEffect(() => {
    (async () => {
      try {
        const list = await partnersService.getAll({ limit: 200, forceApi: true });
        const arr = Array.isArray(list) ? list : list?.items || [];
        setPartners(arr);
      } catch {
        setPartners([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchDraft }));
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(searchDebounceRef.current);
  }, [searchDraft]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const id = setInterval(() => {
      fetchSummary();
      fetchList();
    }, 30000);
    return () => clearInterval(id);
  }, [fetchSummary, fetchList]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const secondsAgo = useMemo(() => {
    if (lastUpdated == null) return null;
    return Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000));
  }, [lastUpdated, tick]);

  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

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

  const getSeverityBadge = (severity) => {
    const s = (severity || '').toUpperCase();
    const map = {
      CRITICAL: 'bg-red-500/15 text-[var(--status-error-text)] border-red-500/40',
      HIGH: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
      MEDIUM: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
      LOW: 'bg-blue-500/15 text-[var(--text-secondary)] border-[var(--border)]/40',
    };
    const cls = map[s] || map.MEDIUM;
    return (
      <Badge variant="outline" className={`${cls} border font-mono text-[10px]`}>
        {s}
      </Badge>
    );
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toUpperCase().replace(/\s/g, '_');
    const map = {
      ACTIVE: { cls: 'bg-red-500/15 text-[var(--status-error-text)] border-red-500/40', icon: AlertTriangle, label: 'Active' },
      IN_REVIEW: { cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40', icon: Clock, label: 'In review' },
      RESOLVED: { cls: 'bg-primary/15 text-[var(--status-success-text)] border-emerald-500/40', icon: CheckCircle2, label: 'Resolved' },
    };
    const cfg = map[s] || map.ACTIVE;
    const Icon = cfg.icon;
    return (
      <Badge variant="outline" className={`${cfg.cls} border gap-1 font-mono text-[10px]`}>
        <Icon className="w-3 h-3" />
        {cfg.label}
      </Badge>
    );
  };

  const handleResolve = async (row) => {
    try {
      const body = row.synthetic
        ? { document_id: row.file_id, exception_type: row.exception_type }
        : {};
      await exceptionsService.resolve(row.id, body);
      toast.success('Exception resolved');
      await refreshAll();
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || 'Resolve failed';
      toast.error(typeof msg === 'string' ? msg : 'Could not resolve exception');
    }
  };

  const handleAssign = () => {
    toast.message('Assignment is not available yet', {
      description: 'Connect user management to enable assign-to-user.',
    });
  };

  return (
    <div className="p-6 space-y-6 min-h-full bg-background text-[var(--text-primary)]">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3 font-mono tracking-tight">
            <AlertTriangle className="w-8 h-8 text-[var(--status-warn-text)]" />
            Exceptions — Management by Exception
          </h1>
          <p className="text-[var(--text-secondary)] mt-1 text-sm">
            Aggregated issues from documents and exception records: validation, parsing, partner matching, AI
            confidence, transmission, and auto-fix outcomes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {secondsAgo != null && (
            <span className="text-xs font-mono text-[var(--text-muted)]">
              Last updated: {secondsAgo}s ago
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refreshAll()}
            className="border-[var(--border-focus)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface)] font-mono"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiData.map((kpi, index) => (
          <KPICard key={kpi.title || index} {...kpi} />
        ))}
      </div>

      <Card className="bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-lg">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-muted)] font-mono">Date range</label>
              <Select
                value={filters.dateRange}
                onValueChange={(value) => handleFilterChange('dateRange', value)}
              >
                <SelectTrigger className="bg-background border-[var(--border)] font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="last7days">Last 7 days</SelectItem>
                  <SelectItem value="last30days">Last 30 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-muted)] font-mono">Partner</label>
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
              <label className="text-xs font-medium text-[var(--text-muted)] font-mono">Severity</label>
              <Select value={filters.severity} onValueChange={(v) => handleFilterChange('severity', v)}>
                <SelectTrigger className="bg-background border-[var(--border)] font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-muted)] font-mono">Status</label>
              <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v)}>
                <SelectTrigger className="bg-background border-[var(--border)] font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="IN_REVIEW">In review</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-muted)] font-mono">Exception type</label>
              <Select
                value={filters.exceptionType}
                onValueChange={(v) => handleFilterChange('exceptionType', v)}
              >
                <SelectTrigger className="bg-background border-[var(--border)] font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {TYPE_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-muted)] font-mono">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <Input
                  placeholder="File, partner, description…"
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
        <CardContent className="p-4 md:p-5 space-y-4 border-b border-[var(--border-subtle)]">
          <TypeBreakdownBar breakdown={typeBreakdown} />
        </CardContent>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:bg-[var(--bg-surface)]">
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">File name</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">Partner</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">Exception type</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">Severity</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">Status</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">AI conf.</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">Description</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90">Created</TableHead>
                  <TableHead className="font-mono text-xs text-[var(--text-primary)]/90 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-16 text-[var(--text-muted)] font-mono text-sm">
                      Loading exceptions…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3 text-[var(--text-secondary)]">
                        <Sparkles className="w-10 h-10 text-[var(--status-success-text)]/80" />
                        <p className="font-mono text-sm text-[var(--text-primary)]">System is healthy — no exceptions found</p>
                        <p className="text-xs text-[var(--text-muted)] max-w-md">
                          No rows matched your filters for this period. Adjust date range or filters, or refresh
                          after new traffic.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((exc) => {
                    const sev = (exc.severity || 'MEDIUM').toUpperCase();
                    const border = SEVERITY_ROW_BORDER[sev] || 'border-l-slate-600';
                    const pct =
                      exc.ai_confidence != null && exc.ai_confidence !== undefined
                        ? Math.round(Number(exc.ai_confidence) * 100)
                        : null;
                    return (
                      <TableRow
                        key={exc.id}
                        className={`border-l-4 ${border} border-[var(--border-subtle)]/80 hover:bg-[var(--bg-subtle)] transition-colors bg-background/40`}
                      >
                        <TableCell className="font-mono text-xs text-[var(--text-primary)] max-w-[180px] truncate" title={exc.file_name}>
                          {exc.file_name}
                        </TableCell>
                        <TableCell className="text-sm text-[var(--text-primary)]">{exc.partner}</TableCell>
                        <TableCell className="text-xs text-[var(--text-primary)]">
                          {TYPE_LABELS[exc.exception_type] || exc.exception_type}
                        </TableCell>
                        <TableCell>{getSeverityBadge(exc.severity)}</TableCell>
                        <TableCell>{getStatusBadge(exc.status)}</TableCell>
                        <TableCell className="w-[120px]">
                          {pct == null ? (
                            <span className="text-xs text-[var(--text-muted)] font-mono">N/A</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className="h-2 w-16 bg-[var(--bg-surface)]" />
                              <span className="text-[11px] font-mono text-[var(--text-secondary)]">{pct}%</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[240px]">
                          <p className="text-xs text-[var(--text-secondary)] line-clamp-2" title={exc.description}>
                            {exc.description}
                          </p>
                        </TableCell>
                        <TableCell className="text-xs text-[var(--text-muted)] font-mono whitespace-nowrap">
                          {exc.created_at
                            ? new Date(exc.created_at).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-[var(--text-primary)] hover:text-[var(--text-primary)] font-mono text-[11px]"
                              onClick={() => navigate(`/document/${exc.file_id}`)}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              View file
                            </Button>
                            {exc.status !== 'RESOLVED' && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 text-[var(--status-success-text)] hover:text-[var(--status-success-text)] font-mono text-[11px]"
                                onClick={() => handleResolve(exc)}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                Resolve
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button type="button" variant="ghost" size="sm" className="h-8 px-2">
                                  <MoreHorizontal className="w-4 h-4 text-[var(--text-secondary)]" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-[var(--bg-surface)] border-[var(--border)]">
                                <DropdownMenuItem
                                  className="font-mono text-xs cursor-pointer"
                                  onClick={handleAssign}
                                >
                                  <UserPlus className="w-3.5 h-3.5 mr-2" />
                                  Assign…
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {!loading && rows.length > 0 && (
            <div className="border-t border-[var(--border-subtle)] px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs font-mono text-[var(--text-muted)]">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                {Math.min(currentPage * ITEMS_PER_PAGE, total)} of {total}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[var(--border)] bg-[var(--bg-surface)]"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  <ChevronsLeft className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[var(--border)] bg-[var(--bg-surface)]"
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
                  className="border-[var(--border)] bg-[var(--bg-surface)]"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[var(--border)] bg-[var(--bg-surface)]"
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
            <Brain className="w-5 h-5 text-[var(--text-primary)] mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-[var(--text-primary)] mb-1 font-mono text-sm">Management by exception</p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                This view combines stored exception records with live document signals (validation JSON, partner
                gate, delivery status, and AI scores). Resolving a synthetic row records dismissal on the document and
                writes an audit entry; database exceptions are marked resolved in the exceptions table.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
