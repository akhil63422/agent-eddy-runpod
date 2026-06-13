import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { analyticsService } from '@/services/analytics';
import { documentsService } from '@/services/documents';
import api from '@/services/api';
import { Link } from 'react-router-dom';
import { Activity, ChevronRight } from 'lucide-react';

const LIMIT = 5;

export const PartnersActivity = ({ days = 7 }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await analyticsService.getPartnerPerformance(null, days);
        if (!cancelled && res?.partners) {
          setData(res.partners.slice(0, LIMIT));
          setLoading(false);
          return;
        }
      } catch {
        // Fallback: derive from documents + partners when analytics API fails
      }
      if (cancelled) {
        setLoading(false);
        return;
      }
      try {
        const [docsRes, partnersRes] = await Promise.all([
          documentsService.getAll({ limit: 500, forceApi: true, summary: true }),
          api.get('/partners/?limit=100'),
        ]);
        const list = Array.isArray(docsRes) ? docsRes : docsRes?.items ?? [];
        const partners = Array.isArray(partnersRes?.data) ? partnersRes.data : partnersRes?.data?.items ?? [];
        const partnerMap = Object.fromEntries(
          partners.map((p) => [
            String(p.id || p._id),
            { partner_code: p.partner_code || p.business_name, partner_name: p.business_name },
          ])
        );
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        const byPartner = {};
        list.forEach((d) => {
          const ts = new Date(d.received_at || d.created_at).getTime();
          if (ts < cutoff) return;
          const pid = String(d.partner_id || d.partner_code || 'unknown');
          if (!byPartner[pid]) byPartner[pid] = { total_documents: 0, ...partnerMap[pid] };
          byPartner[pid].total_documents += 1;
        });
        const fallback = Object.entries(byPartner)
          .map(([id, p]) => ({
            _id: id,
            partner_code: p.partner_code || id,
            partner_name: p.partner_name || 'Unknown',
            total_documents: p.total_documents,
          }))
          .sort((a, b) => (b.total_documents || 0) - (a.total_documents || 0))
          .slice(0, LIMIT);
        if (!cancelled) setData(fallback);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [days]);

  if (loading) {
    return (
      <Card className="border border-[var(--border)] bg-[var(--bg-surface)] shadow-none">
        <CardHeader className="border-b border-[var(--border)]">
          <CardTitle className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Most Active Partners
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Activity className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border border-[var(--border)] bg-[var(--bg-surface)] shadow-none">
        <CardHeader className="border-b border-[var(--border)]">
          <CardTitle className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Most Active Partners
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <p className="font-mono text-sm text-[var(--status-warn-text)]">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const partners = Array.isArray(data) ? data : [];
  const maxTotal = Math.max(...partners.map((p) => p.total_documents || 0), 1);

  return (
    <Card className="border border-[var(--border)] bg-[var(--bg-surface)] shadow-none">
      <CardHeader className="flex flex-row items-center justify-between border-b border-[var(--border)] py-3">
        <CardTitle className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Most Active Partners
        </CardTitle>
        <Link
          to="/partners"
          className="flex items-center gap-0.5 font-mono text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          View all
          <ChevronRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {partners.length === 0 ? (
          <div className="px-4 py-6 text-center font-mono text-xs text-[var(--text-muted)]">
            No partner activity
          </div>
        ) : (
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[#0f0f0f]">
                <th className="px-4 py-2 text-left font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Partner
                </th>
                <th className="px-4 py-2 text-right font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Total
                </th>
                <th className="w-24 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {partners.map((p, i) => {
                const total = p.total_documents || 0;
                const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                return (
                  <tr
                    key={i}
                    className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-subtle)]"
                  >
                    <td className="px-4 py-2 text-[var(--text-primary)]">
                      {p.partner_code || p.partner_name || 'Unknown'}
                    </td>
                    <td className="px-4 py-2 text-right text-[var(--text-secondary)]">{total}</td>
                    <td className="px-2 py-2">
                      <div className="h-1.5 overflow-hidden bg-[var(--bg-surface)]">
                        <div className="h-full bg-[var(--primary)]" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
};
