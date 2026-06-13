import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { analyticsService } from '@/services/analytics';
import { Link } from 'react-router-dom';
import { Activity, ChevronRight } from 'lucide-react';

const cardClass = 'border border-[var(--border)] bg-[var(--bg-surface)] shadow-none';
const titleClass =
    'font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]';

export const TopDocTypes = ({ days = 7, limit = 5 }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await analyticsService.getDocumentTypes(days, limit);
                if (!cancelled) setData(res);
            } catch (err) {
                if (!cancelled) {
                    setError(err.response?.data?.detail || err.message || 'Failed to load');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [days, limit]);

    if (loading) {
        return (
            <>
                <Card className={cardClass}>
                    <CardHeader className="border-b border-[var(--border)]">
                        <CardTitle className={titleClass}>Top Inbound</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center py-12">
                        <Activity className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
                    </CardContent>
                </Card>
                <Card className={cardClass}>
                    <CardHeader className="border-b border-[var(--border)]">
                        <CardTitle className={titleClass}>Top Outbound</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center py-12">
                        <Activity className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
                    </CardContent>
                </Card>
            </>
        );
    }

    if (error) {
        return (
            <Card className={`${cardClass} col-span-2`}>
                <CardContent className="py-8 text-center">
                    <p className="font-mono text-sm text-[var(--status-warn-text)]">{error}</p>
                </CardContent>
            </Card>
        );
    }

    const inbound = data?.inbound ?? [];
    const outbound = data?.outbound ?? [];

    const TableSection = ({ title, rows, viewAllLink }) => (
        <Card className={cardClass}>
            <CardHeader className="flex flex-row items-center justify-between border-b border-[var(--border)] py-3">
                <CardTitle className={titleClass}>{title}</CardTitle>
                {viewAllLink && (
                    <Link
                        to={viewAllLink}
                        className="flex items-center gap-0.5 font-mono text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                        View all
                        <ChevronRight className="h-3 w-3" />
                    </Link>
                )}
            </CardHeader>
            <CardContent className="p-0">
                {rows.length === 0 ? (
                    <div className="px-4 py-6 text-center font-mono text-xs text-[var(--text-muted)]">
                        No documents
                    </div>
                ) : (
                    <table className="w-full font-mono text-xs">
                        <thead>
                            <tr className="border-b border-[var(--border-subtle)] bg-[#0f0f0f]">
                                <th className="px-4 py-2 text-left font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                    Doc Type
                                </th>
                                <th className="px-4 py-2 text-right font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                    Qty
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, i) => (
                                <tr
                                    key={i}
                                    className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-subtle)]"
                                >
                                    <td className="px-4 py-2 text-[var(--text-primary)]">{row.doc_type}</td>
                                    <td className="px-4 py-2 text-right text-[var(--text-secondary)]">{row.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </CardContent>
        </Card>
    );

    return (
        <>
            <TableSection title="Top Inbound" rows={inbound} viewAllLink="/inbound" />
            <TableSection title="Top Outbound" rows={outbound} viewAllLink="/outbound" />
        </>
    );
};
