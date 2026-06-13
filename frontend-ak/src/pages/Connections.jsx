import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Trash2, Loader2, ArrowDownToLine, ArrowUpFromLine,
  ArrowLeftRight, Building2, ChevronDown, ChevronRight, RefreshCw, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import api from '@/services/api';
import { connectionsService } from '@/services/connections';
import { partnersService } from '@/services/partners';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';

const ROLES = ['Buyer', 'Supplier', 'Shipper', 'Carrier', 'Provider', 'Payer', 'OEM', 'Warehouse'];
const REL_TYPES = [
  { value: 'buyer_seller', label: 'Buyer ↔ Seller' },
  { value: 'shipper_carrier', label: 'Shipper ↔ Carrier' },
  { value: 'provider_payer', label: 'Provider ↔ Payer' },
  { value: 'oem_supplier', label: 'OEM ↔ Supplier' },
  { value: 'corp_bank', label: 'Corporate ↔ Bank' },
  { value: 'shipper_warehouse', label: 'Shipper ↔ Warehouse' },
];

const DOC_TYPES = [
  { code: '850', name: 'Purchase Order' },
  { code: '855', name: 'PO Acknowledgment' },
  { code: '856', name: 'Ship Notice (ASN)' },
  { code: '810', name: 'Invoice' },
  { code: '820', name: 'Payment Order' },
  { code: '997', name: 'Functional ACK' },
];

export const Connections = () => {
  const { confirm } = useConfirmDialog();
  const [connections, setConnections] = useState([]);
  const [partners, setPartners] = useState([]);       // trading partners only (for Partner B)
  const [myCompany, setMyCompany] = useState(null);   // our company record (for Partner A)
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [creating, setCreating] = useState(false);

  // Create form state — partner_a_id is auto-populated from our company
  const [form, setForm] = useState({
    partner_a_id: '', partner_a_role: 'Supplier',
    partner_b_id: '', partner_b_role: 'Buyer',
    relationship_type: 'buyer_seller',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [connRes, partnerRes, ourCoRes] = await Promise.all([
        connectionsService.list(),
        partnersService.getAll(),
        api.get('/connections/our-company').catch(() => ({ data: null })),
      ]);
      setConnections(connRes.connections || []);

      // Partner B — trading partners list
      const allPartners = (partnerRes.partners || partnerRes || []).map(p => ({
        id: p.id || p._id,
        name: p.business_name || p.name,
        code: p.partner_code || p.org_code || '',
      }));
      setPartners(allPartners);

      // Partner A — our company (read-only)
      const company = ourCoRes.data;
      if (company) {
        setMyCompany(company);
        if (company.id) {
          setForm(f => ({ ...f, partner_a_id: company.id }));
        }
      }
    } catch {
      toast.error('Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async () => {
    if (!form.partner_a_id) {
      toast.error('Our company is not configured yet — set it in platform settings');
      return;
    }
    if (!form.partner_b_id) {
      toast.error('Select a trading partner (Partner B)');
      return;
    }
    if (form.partner_a_id === form.partner_b_id) {
      toast.error('Cannot connect a partner to itself');
      return;
    }
    setCreating(true);
    try {
      await connectionsService.create(form);
      toast.success('Connection created');
      setShowCreate(false);
      setForm({ partner_a_id: myCompany?.id || '', partner_a_role: 'Supplier', partner_b_id: '', partner_b_role: 'Buyer', relationship_type: 'buyer_seller' });
      loadData();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to create connection');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: 'Delete connection',
      description: 'Direction resolution will fall back to partner role. This action cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      await connectionsService.delete(id);
      toast.success('Connection deleted');
      loadData();
    } catch {
      toast.error('Failed to delete connection');
    }
  };

  const filtered = connections.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.partner_a_name || '').toLowerCase().includes(q) ||
      (c.partner_b_name || '').toLowerCase().includes(q) ||
      (c.partner_a_role || '').toLowerCase().includes(q) ||
      (c.partner_b_role || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">B2B Connections</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Define your role in each trading relationship. Direction is resolved automatically from these connections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} className="border-[var(--border)] text-[var(--text-primary)]">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-primary hover:bg-blue-500">
            <Plus className="w-4 h-4 mr-1" /> New Connection
          </Button>
        </div>
      </div>

      {/* How it works banner */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <div className="flex items-start gap-3">
          <ArrowLeftRight className="w-5 h-5 text-[var(--text-secondary)] mt-0.5 shrink-0" />
          <div className="text-sm text-[var(--text-primary)] leading-relaxed">
            <strong className="text-[var(--text-primary)]">How direction resolution works:</strong> When a file arrives, Agent Eddy finds
            the Connection for that partner, reads your role (Buyer or Supplier), and uses the Direction Matrix to determine
            Inbound vs Outbound. The same 850 PO is <span className="text-[var(--status-info-text)] font-semibold">INBOUND</span> when
            you&apos;re the Supplier and <span className="text-[var(--status-warn-text)] font-semibold">OUTBOUND</span> when you&apos;re the Buyer.
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <Input
          placeholder="Search connections..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10 bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-primary)]"
        />
      </div>

      {/* Create dialog */}
      {showCreate && (
        <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-[var(--text-primary)] flex items-center gap-2">
                <Plus className="w-5 h-5 text-[var(--status-info-text)]" /> New Connection
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Partner A — read-only our company */}
              <div className="space-y-2 p-4 rounded-lg bg-[var(--bg-subtle)] border border-blue-800/60">
                <label className="text-xs font-semibold text-[var(--status-info-text)] uppercase tracking-wider">
                  Partner A (You / Your Company)
                </label>
                <div className="w-full bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] text-sm rounded-md p-2 flex items-center gap-2 min-h-[38px]">
                  <Building2 className="w-4 h-4 text-[var(--status-info-text)] shrink-0" />
                  {myCompany ? (
                    <span className="font-semibold">
                      {myCompany.name}
                      {myCompany.isa_id ? (
                        <span className="ml-2 text-xs text-[var(--text-secondary)] font-normal font-mono">
                          ISA: {myCompany.isa_id}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-[var(--text-muted)] italic text-xs">
                      Loading our company…
                    </span>
                  )}
                  <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950/60 text-[var(--status-info-text)] border border-blue-800/50 shrink-0">
                    AUTO
                  </span>
                </div>
                {!myCompany?.id && (
                  <p className="text-[11px] text-[var(--status-warn-text)]">
                    No company record found. Configure your company in platform settings first.
                  </p>
                )}
                <label className="text-xs text-[var(--text-secondary)]">My Role in this relationship</label>
                <select
                  value={form.partner_a_role}
                  onChange={e => setForm(f => ({ ...f, partner_a_role: e.target.value }))}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] text-sm rounded-md p-2"
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Partner B */}
              <div className="space-y-2 p-4 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
                <label className="text-xs font-semibold text-[var(--status-warn-text)] uppercase tracking-wider">
                  Partner B (Trading Partner)
                </label>
                <select
                  value={form.partner_b_id}
                  onChange={e => setForm(f => ({ ...f, partner_b_id: e.target.value }))}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] text-sm rounded-md p-2"
                >
                  <option value="">Select trading partner...</option>
                  {partners.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </select>
                <label className="text-xs text-[var(--text-secondary)]">Their Role in this relationship</label>
                <select
                  value={form.partner_b_role}
                  onChange={e => setForm(f => ({ ...f, partner_b_role: e.target.value }))}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] text-sm rounded-md p-2"
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {/* Relationship type */}
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">Relationship Type</label>
              <select
                value={form.relationship_type}
                onChange={e => setForm(f => ({ ...f, relationship_type: e.target.value }))}
                className="w-full max-w-xs bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] text-sm rounded-md p-2"
              >
                {REL_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {/* Direction preview */}
            <DirectionPreview roleA={form.partner_a_role} roleB={form.partner_b_role}
              nameA={myCompany?.name || 'Our Company'}
              nameB={partners.find(p => p.id === form.partner_b_id)?.name || 'Partner B'}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)} className="border-[var(--border)] text-[var(--text-primary)]">
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={creating} className="bg-primary hover:bg-blue-500">
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                Create Connection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connections list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-[var(--status-info-text)] animate-spin" />
          <span className="ml-2 text-[var(--text-secondary)]">Loading connections...</span>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
          <CardContent className="py-16 text-center">
            <ArrowLeftRight className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No connections yet</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-md mx-auto">
              Create a connection to define your role with each trading partner.
              This enables automatic Inbound/Outbound direction resolution.
            </p>
            <Button size="sm" onClick={() => setShowCreate(true)} className="bg-primary hover:bg-blue-500">
              <Plus className="w-4 h-4 mr-1" /> Create First Connection
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(conn => (
            <ConnectionCard
              key={conn.id}
              conn={conn}
              expanded={expandedId === conn.id}
              onToggle={() => setExpandedId(expandedId === conn.id ? null : conn.id)}
              onDelete={() => handleDelete(conn.id)}
            />
          ))}
        </div>
      )}

      {/* Stats */}
      {!loading && connections.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total Connections" value={connections.length} icon={ArrowLeftRight} color="blue" />
          <StatCard label="As Supplier" value={connections.filter(c => (c.partner_a_role || '').toLowerCase() === 'supplier' || (c.partner_b_role || '').toLowerCase() === 'supplier').length} icon={ArrowUpFromLine} color="orange" />
          <StatCard label="As Buyer" value={connections.filter(c => (c.partner_a_role || '').toLowerCase() === 'buyer' || (c.partner_b_role || '').toLowerCase() === 'buyer').length} icon={ArrowDownToLine} color="green" />
        </div>
      )}
    </div>
  );
};

// ── Sub-components ──────────────────────────────────────────────────────────

function ConnectionCard({ conn, expanded, onToggle, onDelete }) {
  const relLabel = REL_TYPES.find(r => r.value === conn.relationship_type)?.label || conn.relationship_type;

  return (
    <Card className="bg-[var(--bg-surface)] border-[var(--border)] overflow-hidden">
      <div className="p-4">
        <button
          type="button"
          className="flex w-full items-center gap-4 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          {/* Toggle */}
          <div className="text-[var(--text-muted)]">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>

          {/* Partner A */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[var(--status-info-text)] shrink-0" />
              <span className="font-semibold text-[var(--text-primary)] truncate">{conn.partner_a_name}</span>
              <Badge variant="outline" className="text-xs border-blue-800 text-[var(--text-secondary)] shrink-0">
                {conn.partner_a_role}
              </Badge>
            </div>
          </div>

          {/* Arrow */}
          <ArrowLeftRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />

          {/* Partner B */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[var(--status-warn-text)] shrink-0" />
              <span className="font-semibold text-[var(--text-primary)] truncate">{conn.partner_b_name}</span>
              <Badge variant="outline" className="text-xs border-orange-800 text-orange-300 shrink-0">
                {conn.partner_b_role}
              </Badge>
            </div>
          </div>

          {/* Rel type */}
          <Badge className="bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs shrink-0">{relLabel}</Badge>

          {/* Delete */}
          <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); onDelete(); }}
            className="text-[var(--text-muted)] hover:text-[var(--status-error-text)] shrink-0">
            <Trash2 className="w-4 h-4" />
          </Button>
        </button>

        {/* Expanded: direction matrix */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
            <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
              Direction Matrix Preview
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left py-2 px-3 text-xs text-[var(--text-muted)] font-semibold">Document</th>
                    <th className="text-center py-2 px-3 text-xs text-[var(--status-info-text)] font-semibold">{conn.partner_a_name}</th>
                    <th className="text-center py-2 px-3 text-xs text-[var(--status-warn-text)] font-semibold">{conn.partner_b_name}</th>
                    <th className="text-left py-2 px-3 text-xs text-[var(--text-muted)] font-semibold">Flow Description</th>
                  </tr>
                </thead>
                <tbody>
                  {DOC_TYPES.map(dt => {
                    const preview = conn.direction_preview?.[dt.code] || {};
                    const aDir = preview.partner_a || 'unknown';
                    const bDir = preview.partner_b || 'unknown';
                    const desc = getFlowDescription(dt.code, conn.partner_a_role, conn.partner_a_name, conn.partner_b_name);
                    return (
                      <tr key={dt.code} className="border-b border-[var(--border-subtle)]/70">
                        <td className="py-2 px-3">
                          <span className="font-mono text-[var(--text-primary)]">{dt.code}</span>
                          <span className="text-[var(--text-muted)] ml-1.5 text-xs">{dt.name}</span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <DirBadge dir={aDir} />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <DirBadge dir={bDir} />
                        </td>
                        <td className="py-2 px-3 text-xs text-[var(--text-secondary)]">{desc}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function DirectionPreview({ roleA, nameA }) {
  const MATRIX = {
    buyer: { '850': 'outbound', '855': 'inbound', '856': 'inbound', '810': 'inbound', '820': 'outbound', '997': 'inbound' },
    supplier: { '850': 'inbound', '855': 'outbound', '856': 'outbound', '810': 'outbound', '820': 'inbound', '997': 'inbound' },
  };
  const aRole = (roleA || '').toLowerCase();
  const aMatrix = MATRIX[aRole] || MATRIX.buyer || {};

  return (
    <div className="rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] p-3">
      <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Direction Preview for {nameA} ({roleA})</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {DOC_TYPES.map(dt => {
          const dir = aMatrix[dt.code] || 'unknown';
          return (
            <div key={dt.code} className="flex items-center gap-2 text-xs">
              <span className="font-mono text-[var(--text-primary)] w-8">{dt.code}</span>
              <DirBadge dir={dir} />
              <span className="text-[var(--text-muted)] truncate">{dt.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DirBadge({ dir }) {
  const isIn = dir === 'inbound';
  const isOut = dir === 'outbound';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
      isIn ? 'bg-blue-950 text-[var(--text-secondary)] border border-blue-800/50' :
      isOut ? 'bg-orange-950 text-orange-300 border border-orange-800/50' :
      'bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border)]'
    }`}>
      {isIn && <ArrowDownToLine className="w-3 h-3" />}
      {isOut && <ArrowUpFromLine className="w-3 h-3" />}
      {dir?.toUpperCase() || '—'}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  const colors = { blue: 'text-[var(--status-info-text)]', orange: 'text-[var(--status-warn-text)]', green: 'text-[var(--status-success-text)]' };
  return (
    <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`w-5 h-5 ${colors[color] || 'text-[var(--text-secondary)]'}`} />
        <div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">{value}</div>
          <div className="text-xs text-[var(--text-secondary)]">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function getFlowDescription(docCode, roleA, nameA, nameB) {
  const r = (roleA || '').toLowerCase();
  const descs = {
    supplier: {
      '850': `${nameB} sends PO → ${nameA} receives`,
      '855': `${nameA} sends acknowledgment → ${nameB}`,
      '856': `${nameA} ships goods → ${nameB}`,
      '810': `${nameA} sends invoice → ${nameB}`,
      '820': `${nameB} sends payment → ${nameA}`,
      '997': `Receipt confirmation (both directions)`,
    },
    buyer: {
      '850': `${nameA} sends PO → ${nameB}`,
      '855': `${nameB} confirms order → ${nameA}`,
      '856': `${nameB} ships goods → ${nameA}`,
      '810': `${nameB} sends invoice → ${nameA}`,
      '820': `${nameA} sends payment → ${nameB}`,
      '997': `Receipt confirmation (both directions)`,
    },
  };
  return descs[r]?.[docCode] || '';
}
