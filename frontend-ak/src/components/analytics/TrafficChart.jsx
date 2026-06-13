import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import { analyticsService } from '@/services/analytics';
import { documentsService } from '@/services/documents';
import { Activity } from 'lucide-react';

const CHART_PRIMARY = '#00ed64';
const CHART_SECONDARY = '#00684a';
const GRID = '#1c2d38';
const AXIS_TICK = '#7c8c9a';

export const TrafficChart = ({ days = 7, onPeriodChange }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await analyticsService.getTrends('documents', days, true);
                if (!cancelled && res?.data) {
                    setData(res.data);
                    setLoading(false);
                    return;
                }
            } catch {
                // Fallback: derive from documents when analytics API fails (e.g. 404)
            }
            if (cancelled) {
                setLoading(false);
                return;
            }
            try {
                const docs = await documentsService.getAll({ limit: 500, forceApi: true, summary: true });
                const list = Array.isArray(docs) ? docs : docs?.items ?? [];
                const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
                const byDate = {};
                list.forEach((d) => {
                    const ts = new Date(d.received_at || d.created_at).getTime();
                    if (ts < cutoff) return;
                    const dStr = new Date(ts).toISOString().slice(0, 10);
                    if (!byDate[dStr]) byDate[dStr] = { inbound: 0, outbound: 0, total: 0 };
                    const dir = (d.direction || d.effective_direction || 'Inbound').toLowerCase();
                    if (dir === 'outbound') byDate[dStr].outbound += 1;
                    else byDate[dStr].inbound += 1;
                    byDate[dStr].total += 1;
                });
                const allDates = Array.from({ length: days }, (_, i) =>
                    new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                );
                const fallbackData = allDates.map((d) => ({
                    _id: d,
                    date: d,
                    inbound: byDate[d]?.inbound ?? 0,
                    outbound: byDate[d]?.outbound ?? 0,
                    count: byDate[d]?.total ?? 0,
                }));
                if (!cancelled) setData(fallbackData);
            } catch (err) {
                if (!cancelled) setError(err?.message || 'Failed to load traffic');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [days]);

    const cardShell = 'border border-[var(--border)] bg-[var(--bg-surface)] shadow-none';
    const headerBorder = 'border-b border-[var(--border)]';
    const titleClass =
        'font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]';

    if (loading) {
        return (
            <Card className={cardShell}>
                <CardHeader className={headerBorder}>
                    <CardTitle className={titleClass}>Traffic During Period</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center gap-2 py-16">
                    <Activity className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
                    <p className="font-mono text-xs text-[var(--text-muted)]">Loading...</p>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className={cardShell}>
                <CardHeader className={headerBorder}>
                    <CardTitle className={titleClass}>Traffic During Period</CardTitle>
                </CardHeader>
                <CardContent className="py-8 text-center">
                    <p className="font-mono text-sm text-[var(--status-warn-text)]">{error}</p>
                </CardContent>
            </Card>
        );
    }

    const chartData = Array.isArray(data) && data.length > 0 ? data : [];
    const hasSplit = chartData.some((d) => d.inbound != null || d.outbound != null);
    const totalMessages = chartData.reduce((sum, d) => sum + (d.count ?? d.total ?? 0), 0);

    const axisTick = { fill: AXIS_TICK, fontSize: 10, fontFamily: 'Source Code Pro, monospace' };

    return (
        <Card className={cardShell}>
            <CardHeader className={`${headerBorder} flex flex-row flex-wrap items-center justify-between gap-4`}>
                <CardTitle className={titleClass}>Traffic During Period</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                    {[7, 14].map((d) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => onPeriodChange?.(d)}
                            className={`rounded-sm border px-2 py-1 font-mono text-xs transition-colors ${
                                days === d
                                    ? 'border-[var(--text-primary)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-focus)] hover:text-[var(--text-secondary)]'
                            }`}
                        >
                            {d}d
                        </button>
                    ))}
                    <span className="ml-2 font-mono text-xs text-[var(--text-muted)]">Total {totalMessages}</span>
                </div>
            </CardHeader>
            <CardContent className="bg-transparent pt-4">
                <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="inboundFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={CHART_PRIMARY} stopOpacity={0.25} />
                                <stop offset="100%" stopColor={CHART_PRIMARY} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="outboundFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={CHART_SECONDARY} stopOpacity={0.35} />
                                <stop offset="100%" stopColor={CHART_SECONDARY} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} opacity={0.5} />
                        <XAxis
                            dataKey={hasSplit ? 'date' : '_id'}
                            stroke={AXIS_TICK}
                            tick={axisTick}
                            tickFormatter={(v) => (v ? String(v).slice(5) : '')}
                        />
                        <YAxis stroke={AXIS_TICK} tick={axisTick} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1c2d38',
                                border: '1px solid #5c6c7a',
                                borderRadius: 8,
                            }}
                            labelStyle={{ color: '#a8b3bc', fontFamily: 'Source Code Pro, monospace', fontSize: 10 }}
                            itemStyle={{ color: '#ffffff', fontFamily: 'Source Code Pro, monospace', fontSize: 11 }}
                            formatter={(value) => [value, '']}
                            labelFormatter={(label) => `Date: ${label}`}
                        />
                        <Legend
                            wrapperStyle={{ fontSize: 10 }}
                            formatter={(value) => (
                                <span className="font-mono text-xs capitalize text-[var(--text-secondary)]">
                                    {value}
                                </span>
                            )}
                        />
                        {hasSplit ? (
                            <>
                                <Area
                                    type="monotone"
                                    dataKey="inbound"
                                    stroke={CHART_PRIMARY}
                                    fill="url(#inboundFill)"
                                    strokeWidth={1.5}
                                    name="Inbound"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="outbound"
                                    stroke={CHART_SECONDARY}
                                    fill="url(#outboundFill)"
                                    strokeWidth={1.5}
                                    name="Outbound"
                                />
                            </>
                        ) : (
                            <Area
                                type="monotone"
                                dataKey="count"
                                stroke={CHART_PRIMARY}
                                fill="url(#inboundFill)"
                                strokeWidth={1.5}
                                name="Documents"
                            />
                        )}
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};
