import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { analyticsService } from '@/services/analytics';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Download,
  RefreshCw,
  AlertCircle,
  Cpu,
} from 'lucide-react';
import { toast } from 'sonner';

const BG = '#0a0f1e';
const TEAL = '#06b6d4';
const PURPLE = '#a855f7';
const ORANGE = '#fb923c';
const ACCENTS = [TEAL, PURPLE, '#22d3ee', '#c084fc', '#f472b6', '#34d399', '#fbbf24', '#94a3b8'];

const PERIODS = [
  { id: '7d', label: '7D' },
  { id: '14d', label: '14D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
];

function periodToDays(p) {
  const m = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
  return m[p] || 7;
}

function formatMs(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return '—';
  const n = Number(ms);
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

function escapeCsvCell(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function SectionFrame({ title, error, onRetry, children, className = '' }) {
  return (
    <Card className={`border border-[var(--border)] bg-[var(--bg-surface)] shadow-none ${className}`}>
      <CardHeader className="border-b border-[var(--border-subtle)] py-3">
        <CardTitle className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-widest">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <AlertCircle className="w-8 h-8 text-[var(--status-warn-text)]" />
            <p className="text-sm font-mono text-[var(--status-warn-text)] max-w-md">{error}</p>
            {onRetry && (
              <Button type="button" variant="outline" size="sm" className="font-mono border-[var(--border-focus)]" onClick={onRetry}>
                Retry
              </Button>
            )}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <div className="h-[140px] rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-subtle)] animate-pulse" />
  );
}

function SuccessRing({ pct, size = 88, stroke = 8 }) {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (p / 100) * c;
  const color = p >= 90 ? 'var(--status-success-text)' : p >= 70 ? '#fbbf24' : 'var(--status-error-text)';
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={off}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

export const AnalyticsDashboard = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('7d');
  const [data, setData] = useState({
    summary: null,
    throughput: null,
    partners: null,
    docTypes: null,
    excTrends: null,
    aiPerf: null,
    procSla: null,
    aiUsage: null,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [ageSec, setAgeSec] = useState(0);

  const load = useCallback(async () => {
    const p = period;
    const days = periodToDays(p);
    setErrors({});
    setRefreshing(true);
    const keys = ['summary', 'throughput', 'partners', 'docTypes', 'excTrends', 'aiPerf', 'procSla', 'aiUsage'];
    const tasks = [
      () => analyticsService.getSummary(p),
      () => analyticsService.getThroughput(p),
      () => analyticsService.getPartnerPerformance(null, days, p),
      () => analyticsService.getDocumentTypes(days, 50),
      () => analyticsService.getExceptionTrends(p),
      () => analyticsService.getAiPerformance(p),
      () => analyticsService.getProcessingSla(p),
      () => analyticsService.getAiUsage(),
    ];
    const next = {
      summary: null,
      throughput: null,
      partners: null,
      docTypes: null,
      excTrends: null,
      aiPerf: null,
      procSla: null,
      aiUsage: null,
    };
    const nextErr = {};
    for (let i = 0; i < tasks.length; i++) {
      try {
        const v = await tasks[i]();
        next[keys[i]] = v;
      } catch (e) {
        const msg = e.response?.data?.detail || e.message || 'Request failed';
        nextErr[keys[i]] = typeof msg === 'string' ? msg : JSON.stringify(msg);
        next[keys[i]] = null;
      }
    }
    setData(next);
    setErrors(nextErr);
    setLastUpdated(Date.now());
    setLoading(false);
    setRefreshing(false);
  }, [period]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [period, load]);

  useEffect(() => {
    const id = setInterval(() => setAgeSec(Math.floor((Date.now() - lastUpdated) / 1000)), 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  useEffect(() => {
    const id = setInterval(() => {
      load();
    }, 60000);
    return () => clearInterval(id);
  }, [load]);

  const manualRefresh = () => {
    load();
    toast.success('Refreshing analytics');
  };

  const exportCsv = () => {
    const s = data.summary;
    const lines = [];
    lines.push(['Agent Eddy — Analytics', 'period', period, new Date().toISOString()].map(escapeCsvCell).join(','));
    if (s) {
      lines.push(['summary', 'total_files', s.total_files_processed, 'inbound', s.total_inbound, 'outbound', s.total_outbound].join(','));
      lines.push(['summary', 'success_rate', s.success_rate, 'avg_proc_ms', s.avg_processing_time_ms].join(','));
    }
    (Array.isArray(data.throughput) ? data.throughput : []).forEach((row) => {
      lines.push(
        ['throughput', row.date, row.inbound, row.outbound, row.success, row.failed, row.exceptions].map(escapeCsvCell).join(','),
      );
    });
    (data.partners?.partners || []).forEach((row) => {
      lines.push(
        [
          'partner',
          row.partner_id,
          row.partner || row.partner_name,
          row.total_files ?? row.total_documents,
          row.success_rate,
          row.avg_processing_time_ms,
          row.exceptions,
          row.last_activity,
        ]
          .map(escapeCsvCell)
          .join(','),
      );
    });
    (data.docTypes?.combined || []).forEach((row) => {
      lines.push(['doc_type', row.doc_type, row.count, row.success_rate, row.direction].map(escapeCsvCell).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-eddy-analytics-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  const docChartData = useMemo(() => {
    const c = data.docTypes?.combined;
    if (!Array.isArray(c) || !c.length) return [];
    const total = c.reduce((acc, r) => acc + (r.count || 0), 0) || 1;
    return c.map((r) => ({
      name: `${r.doc_type} (${r.direction})`,
      value: r.count,
      pct: Math.round(((r.count || 0) / total) * 1000) / 10,
    }));
  }, [data.docTypes]);

  const aiDonut = useMemo(() => {
    const a = data.aiPerf;
    if (!a) return [];
    const items = [
      { name: 'Accepted', value: a.accepted || 0, color: '#34d399' },
      { name: 'Rejected', value: a.rejected || 0, color: 'var(--status-error-text)' },
      { name: 'Overridden', value: a.overridden || 0, color: '#fbbf24' },
    ].filter((x) => x.value > 0);
    if (!items.length) {
      return [{ name: 'No data', value: 1, color: '#334155' }];
    }
    return items;
  }, [data.aiPerf]);

  const symLlmBar = useMemo(() => {
    const u = data.aiUsage;
    if (!u) return [];
    const s = u.symbolic_hits || 0;
    const l = u.llm_hits || 0;
    if (!s && !l) return [];
    return [
      { name: 'Symbolic rules', pct: u.symbolic_pct ?? 0, hits: s, fill: TEAL },
      { name: 'LLM', pct: u.llm_pct ?? 0, hits: l, fill: PURPLE },
    ];
  }, [data.aiUsage]);

  const tokenConsumption = useMemo(() => {
    const u = data.aiUsage;
    if (!u) return { total_requests: 0, total_prompt_tokens: 0, total_completion_tokens: 0, total_tokens: 0, by_partner: [] };
    return {
      total_requests: u.total_requests || 0,
      total_prompt_tokens: u.total_prompt_tokens || 0,
      total_completion_tokens: u.total_completion_tokens || 0,
      total_tokens: u.total_tokens || 0,
      by_partner: u.by_partner || [],
    };
  }, [data.aiUsage]);

  const summary = data.summary;
  const proc = data.procSla;

  return (
    <div className="min-h-screen p-6 space-y-8" style={{ backgroundColor: BG }}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-medium font-mono uppercase tracking-tight text-[var(--text-primary)]">
            Master Analytics
          </h1>
          <p className="text-sm text-[var(--text-muted)] font-mono mt-1">Operations, throughput, partners, SLA — live from PostgreSQL</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {PERIODS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPeriod(id)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-colors ${
                period === id
                  ? 'border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="text-[11px] font-mono text-[var(--text-muted)] mx-1">|</span>
          <span className="text-xs font-mono text-[var(--text-muted)] whitespace-nowrap">Updated {ageSec}s ago</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-mono border-[var(--border-focus)] text-[var(--text-primary)]"
            onClick={manualRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            className="font-mono border border-[var(--border-focus)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)]"
            onClick={exportCsv}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {loading && !summary ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <SectionFrame title="Total files processed" error={errors.summary} onRetry={load}>
            {summary && (
              <div className="flex flex-col gap-2">
                <p className="text-3xl font-black font-mono text-[var(--text-primary)] tabular-nums">{summary.total_files_processed}</p>
                <p className="text-xs font-mono text-[var(--text-muted)] flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-1 text-[var(--status-success-text)]">
                    <ArrowDownToLine className="w-3.5 h-3.5" /> {summary.total_inbound} inbound
                  </span>
                  <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]">
                    <ArrowUpFromLine className="w-3.5 h-3.5" /> {summary.total_outbound} outbound
                  </span>
                </p>
                <p className="text-[11px] font-mono text-[var(--text-muted)]">{summary.active_partners} active partners · {summary.period_days}d window</p>
              </div>
            )}
          </SectionFrame>

          <SectionFrame title="Success rate" error={errors.summary} onRetry={load}>
            {summary && (
              <div className="flex items-center gap-4">
                <SuccessRing pct={summary.success_rate} />
                <div>
                  <p className="text-3xl font-black font-mono text-[var(--text-primary)] tabular-nums">{summary.success_rate}%</p>
                  <p className="text-xs font-mono text-[var(--text-muted)] mt-1">Completed + processed</p>
                </div>
              </div>
            )}
          </SectionFrame>

          <SectionFrame title="Avg processing time" error={errors.summary || errors.procSla} onRetry={load}>
            {summary && proc && (
              <div>
                <p className="text-3xl font-medium font-mono text-[var(--text-primary)] tabular-nums">{formatMs(summary.avg_processing_time_ms)}</p>
                <p className="text-xs font-mono text-[var(--text-muted)] mt-2">
                  P95: {formatMs(proc.p95_processing_time_ms)} · P99: {formatMs(proc.p99_processing_time_ms)}
                </p>
              </div>
            )}
          </SectionFrame>

          <SectionFrame title="AI auto-fix rate" error={errors.summary} onRetry={load}>
            {summary && (
              <div>
                <p className="text-3xl font-medium font-mono text-[var(--text-primary)] tabular-nums">{summary.auto_fix_rate}%</p>
                <p className="text-xs font-mono text-[var(--text-muted)] mt-2">
                  {summary._auto_fixes_applied ?? 0} auto-fixes applied · Avg AI conf {summary.ai_confidence_avg}%
                </p>
              </div>
            )}
          </SectionFrame>
        </div>
      )}

      <SectionFrame title="EDI throughput" error={errors.throughput} onRetry={load}>
        {Array.isArray(data.throughput) && data.throughput.length > 0 && (
          <div className="h-[320px] w-full">
            <ResponsiveContainer>
              <LineChart data={data.throughput} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'monospace' }} tickFormatter={(v) => (v ? String(v).slice(5) : '')} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', fontFamily: 'monospace', fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 11 }} />
                <Line type="monotone" dataKey="inbound" name="Inbound" stroke={TEAL} strokeWidth={2} dot={false} isAnimationActive />
                <Line type="monotone" dataKey="outbound" name="Outbound" stroke={PURPLE} strokeWidth={2} dot={false} isAnimationActive />
                <Line type="monotone" dataKey="exceptions" name="Exceptions" stroke={ORANGE} strokeWidth={2} dot={false} isAnimationActive />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionFrame>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SectionFrame title="Partner performance" error={errors.partners} onRetry={load}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-left">
                  <th className="pb-2 pr-2">Partner</th>
                  <th className="pb-2 pr-2 text-right">Files</th>
                  <th className="pb-2 pr-2 text-right">Success</th>
                  <th className="pb-2 pr-2 text-right">Avg</th>
                  <th className="pb-2 text-right">Excs</th>
                </tr>
              </thead>
              <tbody>
                {(data.partners?.partners || []).map((row) => {
                  const rate = row.success_rate ?? 0;
                  const rateColor = rate >= 90 ? 'text-[var(--status-success-text)]' : rate >= 70 ? 'text-[var(--status-warn-text)]' : 'text-[var(--status-error-text)]';
                  const pid = row.partner_id || row._id;
                  return (
                    <tr
                      key={String(pid)}
                      className={pid ? 'border-b border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] cursor-pointer' : 'border-b border-[var(--border-subtle)]'}
                      onClick={() => pid && navigate(`/partners/${pid}`)}
                    >
                      <td className="py-2 pr-2 text-[var(--text-primary)] truncate max-w-[160px]">{row.partner || row.partner_name || row.partner_code}</td>
                      <td className="py-2 pr-2 text-right text-[var(--text-primary)] tabular-nums">{row.total_files ?? row.total_documents ?? 0}</td>
                      <td className={`py-2 pr-2 text-right tabular-nums ${rateColor}`}>{rate}%</td>
                      <td className="py-2 pr-2 text-right text-[var(--text-secondary)] tabular-nums">{formatMs(row.avg_processing_time_ms)}</td>
                      <td className="py-2 text-right text-[var(--status-warn-text)] tabular-nums">{row.exceptions ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data.partners?.partners?.length && !errors.partners && (
              <p className="text-sm font-mono text-[var(--text-muted)] text-center py-8">No partner activity in this period</p>
            )}
          </div>
        </SectionFrame>

        <SectionFrame title="Document type breakdown" error={errors.docTypes} onRetry={load}>
          {docChartData.length > 0 ? (
            <div className="h-[280px] flex flex-row items-center gap-4">
              <div className="flex-1 h-full min-h-[200px]">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={docChartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={2}
                      isAnimationActive
                    >
                      {docChartData.map((_, i) => (
                        <Cell key={i} fill={ACCENTS[i % ACCENTS.length]} stroke={BG} strokeWidth={1} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', fontSize: 12, fontFamily: 'monospace' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-[44%] max-h-[240px] overflow-y-auto text-[11px] font-mono space-y-1 text-[var(--text-secondary)]">
                {docChartData.map((row, i) => (
                  <li key={row.name} className="flex justify-between gap-2 border-b border-[var(--border-subtle)] pb-1">
                    <span className="truncate" style={{ color: ACCENTS[i % ACCENTS.length] }}>
                      {row.name}
                    </span>
                    <span className="text-[var(--text-primary)] tabular-nums shrink-0">
                      {row.value} ({row.pct}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            !errors.docTypes && <p className="text-sm font-mono text-[var(--text-muted)] text-center py-8">No document types in range</p>
          )}
        </SectionFrame>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SectionFrame title="Exception trends" error={errors.excTrends} onRetry={load}>
          {Array.isArray(data.excTrends) && data.excTrends.length > 0 && (
            <div className="h-[300px]">
              <ResponsiveContainer>
                <AreaChart data={data.excTrends} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 9, fontFamily: 'monospace' }} tickFormatter={(v) => (v ? String(v).slice(5) : '')} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', fontSize: 11, fontFamily: 'monospace' }} />
                  <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 10 }} />
                  <Area type="monotone" stackId="1" dataKey="validation_errors" name="Validation" fill="#ef4444" stroke="#ef4444" fillOpacity={0.6} />
                  <Area type="monotone" stackId="1" dataKey="parse_failures" name="Parse" fill="#fb923c" stroke="#fb923c" fillOpacity={0.6} />
                  <Area type="monotone" stackId="1" dataKey="partner_mismatches" name="Partner" fill="#facc15" stroke="#facc15" fillOpacity={0.6} />
                  <Area type="monotone" stackId="1" dataKey="low_confidence" name="Low conf" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.6} />
                  <Area type="monotone" stackId="1" dataKey="transmission_failures" name="Transmission" fill={PURPLE} stroke={PURPLE} fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionFrame>

        <SectionFrame title="AI performance" error={errors.aiPerf} onRetry={load}>
          {data.aiPerf && (
            <div className="flex flex-col md:flex-row gap-6 items-center">
              <div className="h-[220px] w-full md:w-1/2 min-h-[200px]">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={aiDonut} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={2} isAnimationActive>
                      {aiDonut.map((e, i) => (
                        <Cell key={e.name} fill={e.color} stroke={BG} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', fontFamily: 'monospace', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono text-[var(--text-secondary)] w-full">
                <span className="text-[var(--text-muted)]">Suggestions</span>
                <span className="text-right text-[var(--text-primary)] tabular-nums">{data.aiPerf.total_ai_suggestions}</span>
                <span className="text-[var(--text-muted)]">Accepted</span>
                <span className="text-right text-[var(--status-success-text)] tabular-nums">{data.aiPerf.accepted}</span>
                <span className="text-[var(--text-muted)]">Rejected</span>
                <span className="text-right text-[var(--status-error-text)] tabular-nums">{data.aiPerf.rejected}</span>
                <span className="text-[var(--text-muted)]">Overridden</span>
                <span className="text-right text-[var(--status-warn-text)] tabular-nums">{data.aiPerf.overridden}</span>
                <span className="text-[var(--text-muted)]">Avg confidence</span>
                <span className="text-right text-[var(--text-primary)] tabular-nums">{data.aiPerf.avg_confidence}%</span>
                <span className="text-[var(--text-muted)]">Auto-fix success</span>
                <span className="text-right text-[var(--text-secondary)] tabular-nums">{data.aiPerf.auto_fix_success_rate}%</span>
                <span className="text-[var(--text-muted)]">Auto-fixed docs</span>
                <span className="text-right text-[var(--text-primary)] tabular-nums">{data.aiPerf.auto_fixed}</span>
              </div>
            </div>
          )}
        </SectionFrame>
      </div>

      <SectionFrame title="Token Consumption" error={errors.aiUsage} onRetry={load}>
        {tokenConsumption && tokenConsumption.total_tokens > 0 ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-[var(--border-subtle)] rounded-lg p-4 bg-[var(--bg-base)]">
                <p className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider mb-2">Total Requests</p>
                <p className="text-2xl font-mono font-bold text-[var(--text-primary)] tabular-nums">{tokenConsumption.total_requests}</p>
              </div>
              <div className="border border-[var(--border-subtle)] rounded-lg p-4 bg-[var(--bg-base)]">
                <p className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider mb-2">Prompt Tokens</p>
                <p className="text-2xl font-mono font-bold text-[var(--text-primary)] tabular-nums">{(tokenConsumption.total_prompt_tokens || 0).toLocaleString()}</p>
              </div>
              <div className="border border-[var(--border-subtle)] rounded-lg p-4 bg-[var(--bg-base)]">
                <p className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider mb-2">Completion Tokens</p>
                <p className="text-2xl font-mono font-bold text-[var(--text-primary)] tabular-nums">{(tokenConsumption.total_completion_tokens || 0).toLocaleString()}</p>
              </div>
            </div>
            <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--bg-base)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider mb-1">Total Tokens</p>
                  <p className="text-3xl font-mono font-bold text-[var(--text-primary)] tabular-nums">{(tokenConsumption.total_tokens || 0).toLocaleString()}</p>
                </div>
                <div className="flex items-center justify-end">
                  <p className="text-xs font-mono text-[var(--text-secondary)] text-right">
                    {tokenConsumption.total_requests > 0 ? (
                      <>
                        <span className="block text-[var(--text-muted)]">Avg tokens per request</span>
                        <span className="text-xl font-bold text-[var(--text-primary)]">{Math.round((tokenConsumption.total_tokens || 0) / tokenConsumption.total_requests)}</span>
                      </>
                    ) : (
                      'No requests yet'
                    )}
                  </p>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <p className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider mb-2">Per Partner</p>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-left">
                    <th className="pb-2 pr-2">Partner</th>
                    <th className="pb-2 pr-2 text-right">Requests</th>
                    <th className="pb-2 pr-2 text-right">Prompt Tokens</th>
                    <th className="pb-2 pr-2 text-right">Completion Tokens</th>
                    <th className="pb-2 text-right">Total Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {(tokenConsumption.by_partner || []).map((row, i) => (
                    <tr key={`${row.partner_name}-${i}`} className="border-b border-[var(--border-subtle)]">
                      <td className="py-2 pr-2 text-[var(--text-primary)] truncate max-w-[200px]">{row.partner_name}</td>
                      <td className="py-2 pr-2 text-right text-[var(--text-secondary)]/90 tabular-nums">{row.requests ?? 0}</td>
                      <td className="py-2 pr-2 text-right text-[var(--text-secondary)]/90 tabular-nums">{(row.prompt_tokens ?? 0).toLocaleString()}</td>
                      <td className="py-2 pr-2 text-right text-[var(--text-secondary)]/90 tabular-nums">{(row.completion_tokens ?? 0).toLocaleString()}</td>
                      <td className="py-2 text-right text-[var(--text-primary)] tabular-nums font-semibold">{(row.total_tokens ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(tokenConsumption.by_partner || []).length ? (
                <p className="text-sm font-mono text-[var(--text-muted)] text-center py-6">No per-partner token data yet</p>
              ) : null}
            </div>
          </div>
        ) : (
          !errors.aiUsage && (
            <p className="text-sm font-mono text-[var(--text-muted)] text-center py-8">
              No token consumption data yet — process documents to start tracking LLM token usage.
            </p>
          )
        )}
      </SectionFrame>

      <SectionFrame title="SLA compliance (processing latency)" error={errors.procSla} onRetry={load}>
        {proc && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-3 flex flex-col items-center gap-2">
              <SuccessRing pct={proc.sla_compliance_rate} size={112} stroke={10} />
              <p className="text-lg font-mono text-[var(--text-primary)] font-bold">{proc.sla_compliance_rate}%</p>
              <p className="text-[10px] font-mono text-[var(--text-muted)] text-center">Within {formatMs(proc.sla_threshold_ms)} target</p>
            </div>
            <div className="lg:col-span-5 space-y-2">
              <p className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">Files within vs breached</p>
              <div className="h-4 rounded-full bg-[var(--bg-surface)] overflow-hidden flex">
                {(() => {
                  const d = proc.files_within_sla + proc.files_breached_sla;
                  const wIn = d ? (100 * proc.files_within_sla) / d : 0;
                  const wBr = d ? (100 * proc.files_breached_sla) / d : 0;
                  return (
                    <>
                      <div className="h-full bg-[var(--primary)] transition-all duration-500" style={{ width: `${wIn}%` }} />
                      <div className="h-full bg-[var(--mdb-teal)] transition-all duration-500" style={{ width: `${wBr}%` }} />
                    </>
                  );
                })()}
              </div>
              <div className="flex justify-between text-[11px] font-mono text-[var(--text-muted)]">
                <span className="text-[var(--status-success-text)]">Within: {proc.files_within_sla}</span>
                <span className="text-[var(--status-error-text)]">Breached: {proc.files_breached_sla}</span>
              </div>
            </div>
            <div className="lg:col-span-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded-lg p-4 bg-[var(--bg-base)]">
              <span className="text-[var(--text-muted)] flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5" /> Avg proc
              </span>
              <span className="text-right text-[var(--text-primary)]">{formatMs(proc.avg_processing_time_ms)}</span>
              <span className="text-[var(--text-muted)]">P95</span>
              <span className="text-right text-[var(--text-primary)]">{formatMs(proc.p95_processing_time_ms)}</span>
              <span className="text-[var(--text-muted)]">P99</span>
              <span className="text-right text-[var(--text-primary)]">{formatMs(proc.p99_processing_time_ms)}</span>
              <span className="text-[var(--text-muted)]">Threshold</span>
              <span className="text-right text-[var(--text-primary)]/90">{formatMs(proc.sla_threshold_ms)}</span>
            </div>
          </div>
        )}
      </SectionFrame>

      <p className="text-[10px] font-mono text-[var(--text-muted)] text-center pb-4 flex items-center justify-center gap-2">
        <Activity className="w-3 h-3" /> Auto-refreshes every 60s · Data: documents, exceptions, partners, corrections, audit logs
      </p>
    </div>
  );
};
