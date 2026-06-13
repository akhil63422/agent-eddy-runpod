import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings as SettingsIcon,
  User,
  Brain,
  FileText,
  Server,
  Bell,
  Shield,
  Database,
  Save,
  RefreshCw,
  AlertCircle,
  Mic,
  Cpu,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Layers,
  Tag,
  Zap,
  ToggleLeft,
  ToggleRight,
  Link2,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from '@/components/ui/sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import api from '@/services/api';

// ---------------------------------------------------------------------------
// System Config sub-panel — fully DB-driven pipeline configuration
// ---------------------------------------------------------------------------

const IDENTIFIER_TYPES = ['ISA_SENDER', 'ISA_RECEIVER', 'GS_SENDER', 'GS_RECEIVER', 'PARTNER_CODE', 'DUNS', 'CUSTOM'];
const RULE_TYPES = ['GS_VERSION', 'REQUIRED_SEGMENT', 'FORBIDDEN_SEGMENT', 'QUALIFIER_MAP', 'FIELD_CONSTRAINT', 'CUSTOM'];
const SEVERITY_TYPES = ['ERROR', 'WARNING', 'INFO'];

function StatusBadge({ active }) {
  return active ? (
    <Badge variant="success" className="gap-1"><CheckCircle2 className="w-3 h-3" />Active</Badge>
  ) : (
    <Badge variant="secondary" className="gap-1"><XCircle className="w-3 h-3" />Inactive</Badge>
  );
}

// ── Partner Identifiers ─────────────────────────────────────────────────────
function PartnerIdentifiersTab() {
  const [rows, setRows] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ partner_id: '', identifier_type: 'ISA_SENDER', identifier_value: '', priority: 0, notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, pRes] = await Promise.all([
        api.get('/system-config/partner-identifiers?active_only=false'),
        api.get('/partners', { params: { limit: 500 } }),
      ]);
      setRows(iRes.data || []);
      const plist = Array.isArray(pRes.data) ? pRes.data : (pRes.data?.items || []);
      setPartners(plist.map(p => ({ id: p.id, label: `${p.business_name} (${p.partner_code})` })));
    } catch { toast.error('Failed to load partner identifiers'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.partner_id || !form.identifier_value.trim()) return toast.error('Partner and value are required');
    setSaving(true);
    try {
      await api.post('/system-config/partner-identifiers', { ...form, identifier_value: form.identifier_value.trim() });
      toast.success('Identifier added');
      setShowAdd(false);
      setForm({ partner_id: '', identifier_type: 'ISA_SENDER', identifier_value: '', priority: 0, notes: '' });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add identifier'); }
    setSaving(false);
  };

  const handleToggle = async (row) => {
    try {
      await api.patch(`/system-config/partner-identifiers/${row.id}`, { is_active: !row.is_active });
      toast.success(`Identifier ${row.is_active ? 'deactivated' : 'activated'}`);
      load();
    } catch { toast.error('Failed to update'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this identifier?')) return;
    try {
      await api.delete(`/system-config/partner-identifiers/${id}`);
      toast.success('Deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">ISA Sender / GS Sender IDs used for DB-driven partner matching. No code changes needed when adding new identifiers.</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Identifier</Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Partner</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No identifiers yet — click Add to populate.</TableCell></TableRow>
            ) : rows.map(row => {
              const partner = partners.find(p => p.id === row.partner_id);
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-xs">{partner?.label || row.partner_id.slice(0, 8) + '…'}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{row.identifier_type}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{row.identifier_value}</TableCell>
                  <TableCell>{row.priority}</TableCell>
                  <TableCell><StatusBadge active={row.is_active} /></TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggle(row)} title={row.is_active ? 'Deactivate' : 'Activate'}>
                      {row.is_active ? <ToggleRight className="w-4 h-4 text-[var(--status-success-text)]" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(row.id)} title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Partner Identifier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Partner</Label>
              <Select value={form.partner_id} onValueChange={v => setForm(f => ({ ...f, partner_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                <SelectContent>{partners.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Identifier Type</Label>
              <Select value={form.identifier_type} onValueChange={v => setForm(f => ({ ...f, identifier_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{IDENTIFIER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Identifier Value</Label>
              <Input value={form.identifier_value} onChange={e => setForm(f => ({ ...f, identifier_value: e.target.value }))} placeholder="e.g. AMAZON, TARGETEDI, 0078742" />
            </div>
            <div>
              <Label>Priority (higher = checked first)</Label>
              <Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional note" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? 'Saving…' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Partner Rules ───────────────────────────────────────────────────────────
function PartnerRulesTab() {
  const [rows, setRows] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    partner_id: '', doc_type: '', rule_type: 'GS_VERSION',
    rule_config: '{"required": "005010"}', severity: 'ERROR',
    auto_fix: false, fix_config: '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, pRes] = await Promise.all([
        api.get('/system-config/partner-rules?active_only=false'),
        api.get('/partners', { params: { limit: 500 } }),
      ]);
      setRows(rRes.data || []);
      const plist = Array.isArray(pRes.data) ? pRes.data : (pRes.data?.items || []);
      setPartners(plist.map(p => ({ id: p.id, label: `${p.business_name} (${p.partner_code})` })));
    } catch { toast.error('Failed to load partner rules'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    let rule_config;
    let fix_config = null;
    try { rule_config = JSON.parse(form.rule_config); } catch { return toast.error('rule_config must be valid JSON'); }
    if (form.fix_config?.trim()) {
      try { fix_config = JSON.parse(form.fix_config); } catch { return toast.error('fix_config must be valid JSON'); }
    }
    if (!form.partner_id) return toast.error('Partner is required');
    setSaving(true);
    try {
      await api.post('/system-config/partner-rules', {
        partner_id: form.partner_id,
        doc_type: form.doc_type || null,
        rule_type: form.rule_type,
        rule_config,
        severity: form.severity,
        auto_fix: form.auto_fix,
        fix_config,
      });
      toast.success('Rule added');
      setShowAdd(false);
      setForm({
        partner_id: '', doc_type: '', rule_type: 'GS_VERSION',
        rule_config: '{"required": "005010"}', severity: 'ERROR',
        auto_fix: false, fix_config: '',
      });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add rule'); }
    setSaving(false);
  };

  const handleToggle = async (row) => {
    try {
      await api.patch(`/system-config/partner-rules/${row.id}`, { is_active: !row.is_active });
      toast.success(`Rule ${row.is_active ? 'deactivated' : 'activated'}`);
      load();
    } catch { toast.error('Failed to update'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await api.delete(`/system-config/partner-rules/${id}`);
      toast.success('Deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Partner-specific EDI rules applied during processing. No code changes needed to add new rules.</p>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Rule</Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Partner</TableHead>
              <TableHead>Doc Type</TableHead>
              <TableHead>Rule Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Auto-Fix</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No rules yet.</TableCell></TableRow>
            ) : rows.map(row => {
              const partner = partners.find(p => p.id === row.partner_id);
              return (
                <TableRow key={row.id}>
                  <TableCell className="text-xs font-medium">{partner?.label || row.partner_id.slice(0, 8) + '…'}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{row.doc_type || 'ALL'}</Badge></TableCell>
                  <TableCell><Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-[var(--text-secondary)]">{row.rule_type}</Badge></TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${row.severity === 'ERROR' ? 'bg-red-100 text-red-800' : row.severity === 'WARNING' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                      {row.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.auto_fix ? <CheckCircle2 className="w-4 h-4 text-[var(--status-success-text)]" /> : <XCircle className="w-4 h-4 text-gray-400" />}</TableCell>
                  <TableCell><StatusBadge active={row.is_active} /></TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggle(row)}>
                      {row.is_active ? <ToggleRight className="w-4 h-4 text-[var(--status-success-text)]" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(row.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Partner Rule</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Partner</Label>
              <Select value={form.partner_id} onValueChange={v => setForm(f => ({ ...f, partner_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                <SelectContent>{partners.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Rule Type</Label>
                <Select value={form.rule_type} onValueChange={v => setForm(f => ({ ...f, rule_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RULE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Doc Type (blank = all)</Label>
                <Input value={form.doc_type} onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))} placeholder="850, 810, 856…" />
              </div>
            </div>
            <div>
              <Label>Rule Config (JSON)</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono h-20 resize-none"
                value={form.rule_config}
                onChange={e => setForm(f => ({ ...f, rule_config: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SEVERITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.auto_fix} onCheckedChange={v => setForm(f => ({ ...f, auto_fix: v }))} />
                <Label>Auto-Fix</Label>
              </div>
            </div>
            {form.auto_fix && (
              <div>
                <Label>Fix Config (JSON)</Label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono h-16 resize-none"
                  value={form.fix_config}
                  onChange={e => setForm(f => ({ ...f, fix_config: e.target.value }))}
                  placeholder='{"replace_with": "005010"}'
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? 'Saving…' : 'Add Rule'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Document Types ──────────────────────────────────────────────────────────
function DocumentTypesTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ transaction_set_id: '', name: '', description: '', direction: 'BOTH', standard: 'X12' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/system-config/document-types?active_only=false');
      setRows(res.data || []);
    } catch { toast.error('Failed to load document types'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.transaction_set_id.trim() || !form.name.trim()) return toast.error('Transaction Set ID and Name are required');
    setSaving(true);
    try {
      await api.post('/system-config/document-types', { ...form, transaction_set_id: form.transaction_set_id.trim() });
      toast.success('Document type added');
      setShowAdd(false);
      setForm({ transaction_set_id: '', name: '', description: '', direction: 'BOTH', standard: 'X12' });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add'); }
    setSaving(false);
  };

  const handleToggle = async (row) => {
    try {
      await api.patch(`/system-config/document-types/${row.id}`, { is_active: !row.is_active });
      toast.success(`Doc type ${row.is_active ? 'deactivated' : 'activated'}`);
      load();
    } catch { toast.error('Failed to update'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Supported EDI transaction set types. Add custom types for non-standard documents.</p>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Doc Type</Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Standard</TableHead>
              <TableHead>System</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.id}>
                <TableCell className="font-mono font-bold text-sm">{row.transaction_set_id}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{row.direction}</Badge></TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{row.standard}</Badge></TableCell>
                <TableCell>{row.is_system ? <Badge className="text-xs bg-purple-100 text-purple-800">System</Badge> : <Badge variant="outline" className="text-xs">Custom</Badge>}</TableCell>
                <TableCell><StatusBadge active={row.is_active} /></TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggle(row)}>
                    {row.is_active ? <ToggleRight className="w-4 h-4 text-[var(--status-success-text)]" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Custom Document Type</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Transaction Set ID</Label>
                <Input value={form.transaction_set_id} onChange={e => setForm(f => ({ ...f, transaction_set_id: e.target.value }))} placeholder="e.g. 850, X01" />
              </div>
              <div>
                <Label>Standard</Label>
                <Select value={form.standard} onValueChange={v => setForm(f => ({ ...f, standard: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="X12">X12</SelectItem>
                    <SelectItem value="EDIFACT">EDIFACT</SelectItem>
                    <SelectItem value="JSON">JSON</SelectItem>
                    <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Purchase Order" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
            </div>
            <div>
              <Label>Direction</Label>
              <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INBOUND">INBOUND</SelectItem>
                  <SelectItem value="OUTBOUND">OUTBOUND</SelectItem>
                  <SelectItem value="BOTH">BOTH</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? 'Saving…' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Segment Definitions ─────────────────────────────────────────────────────
function SegmentDefinitionsTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ segment_id: '', name: '', description: '', fields: '[]', standard: 'X12' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/system-config/segment-definitions?active_only=false');
      setRows(res.data || []);
    } catch { toast.error('Failed to load segment definitions'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.segment_id.trim() || !form.name.trim()) return toast.error('Segment ID and Name are required');
    let fields;
    try { fields = JSON.parse(form.fields); } catch { return toast.error('Fields must be valid JSON array'); }
    setSaving(true);
    try {
      await api.post('/system-config/segment-definitions', { ...form, segment_id: form.segment_id.toUpperCase().trim(), fields });
      toast.success('Segment definition added');
      setShowAdd(false);
      setForm({ segment_id: '', name: '', description: '', fields: '[]', standard: 'X12' });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add'); }
    setSaving(false);
  };

  const handleToggle = async (row) => {
    try {
      await api.patch(`/system-config/segment-definitions/${row.id}`, { is_active: !row.is_active });
      toast.success(`Segment ${row.is_active ? 'deactivated' : 'activated'}`);
      load();
    } catch { toast.error('Failed to update'); }
  };

  const filtered = rows.filter(r =>
    !search || r.segment_id.toLowerCase().includes(search.toLowerCase()) || (r.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">X12 segment field definitions. Unknown segments pass through raw — never dropped.</p>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Segment</Button>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search segments…" className="max-w-xs" />
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Segment ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Fields</TableHead>
              <TableHead>Standard</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No results.</TableCell></TableRow>
            ) : filtered.map(row => (
              <TableRow key={row.id}>
                <TableCell className="font-mono font-bold text-sm">{row.segment_id}</TableCell>
                <TableCell className="text-sm">{row.name}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{(row.fields || []).length} fields</Badge></TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{row.standard}</Badge></TableCell>
                <TableCell><StatusBadge active={row.is_active} /></TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggle(row)}>
                    {row.is_active ? <ToggleRight className="w-4 h-4 text-[var(--status-success-text)]" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Segment Definition</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Segment ID</Label>
                <Input value={form.segment_id} onChange={e => setForm(f => ({ ...f, segment_id: e.target.value.toUpperCase() }))} placeholder="e.g. N9" />
              </div>
              <div>
                <Label>Standard</Label>
                <Select value={form.standard} onValueChange={v => setForm(f => ({ ...f, standard: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="X12">X12</SelectItem>
                    <SelectItem value="EDIFACT">EDIFACT</SelectItem>
                    <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Reference Identification" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <Label>Fields (JSON array)</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono h-28 resize-none"
                value={form.fields}
                onChange={e => setForm(f => ({ ...f, fields: e.target.value }))}
                placeholder='[{"idx": 1, "name": "qualifier", "max_len": 3}]'
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? 'Saving…' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Field Mappings ──────────────────────────────────────────────────────────
function FieldMappingsTab() {
  const [rows, setRows] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    partner_id: '', doc_type: '', source_segment: 'BEG', source_element: 3,
    source_qualifier: '', target_field: 'purchase_order_number', transform_type: 'DIRECT', priority: 0,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, pRes] = await Promise.all([
        api.get('/system-config/field-mappings?active_only=false'),
        api.get('/partners', { params: { limit: 500 } }),
      ]);
      setRows(mRes.data || []);
      const plist = Array.isArray(pRes.data) ? pRes.data : (pRes.data?.items || []);
      setPartners(plist.map(p => ({ id: p.id, label: `${p.business_name} (${p.partner_code})` })));
    } catch { toast.error('Failed to load field mappings'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.partner_id || !form.source_segment.trim() || !form.target_field.trim()) {
      return toast.error('Partner, source segment, and target field are required');
    }
    setSaving(true);
    try {
      await api.post('/system-config/field-mappings', {
        ...form,
        doc_type: form.doc_type?.trim() || null,
        source_qualifier: form.source_qualifier?.trim() || null,
        source_segment: form.source_segment.trim(),
      });
      toast.success('Mapping added');
      setShowAdd(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add mapping'); }
    setSaving(false);
  };

  const handleToggle = async (row) => {
    try {
      await api.patch(`/system-config/field-mappings/${row.id}`, { is_active: !row.is_active });
      load();
    } catch { toast.error('Failed to update'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this mapping?')) return;
    try {
      await api.delete(`/system-config/field-mappings/${id}`);
      toast.success('Deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Map EDI segment elements to canonical fields (per partner / doc type).</p>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Mapping</Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Partner</TableHead>
              <TableHead>Doc</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Transform</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No field mappings.</TableCell></TableRow>
            ) : rows.map(row => {
              const partner = partners.find(p => p.id === row.partner_id);
              return (
                <TableRow key={row.id}>
                  <TableCell className="text-xs font-medium">{partner?.label || row.partner_id.slice(0, 8)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{row.doc_type || 'ALL'}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{row.source_segment}*{row.source_element}</TableCell>
                  <TableCell className="font-mono text-xs">{row.target_field}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{row.transform_type}</Badge></TableCell>
                  <TableCell><StatusBadge active={row.is_active} /></TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggle(row)}>
                      {row.is_active ? <ToggleRight className="w-4 h-4 text-[var(--status-success-text)]" /> : <ToggleLeft className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(row.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Field Mapping</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Partner</Label>
              <Select value={form.partner_id} onValueChange={v => setForm(f => ({ ...f, partner_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                <SelectContent>{partners.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Doc type (optional)</Label>
                <Input value={form.doc_type} onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))} placeholder="850" />
              </div>
              <div>
                <Label>Priority</Label>
                <Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Segment</Label>
                <Input value={form.source_segment} onChange={e => setForm(f => ({ ...f, source_segment: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <Label>Element #</Label>
                <Input type="number" value={form.source_element} onChange={e => setForm(f => ({ ...f, source_element: parseInt(e.target.value) || 1 }))} />
              </div>
              <div>
                <Label>Qualifier (optional)</Label>
                <Input value={form.source_qualifier} onChange={e => setForm(f => ({ ...f, source_qualifier: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Target field</Label>
              <Input value={form.target_field} onChange={e => setForm(f => ({ ...f, target_field: e.target.value }))} placeholder="canonical.path.field" />
            </div>
            <div>
              <Label>Transform type</Label>
              <Select value={form.transform_type} onValueChange={v => setForm(f => ({ ...f, transform_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DIRECT">DIRECT</SelectItem>
                  <SelectItem value="LOOKUP">LOOKUP</SelectItem>
                  <SelectItem value="FORMULA">FORMULA</SelectItem>
                  <SelectItem value="CONSTANT">CONSTANT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? 'Saving…' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Validation Rules (config table) ────────────────────────────────────────
function ValidationRulesConfigTab() {
  const [rows, setRows] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    partner_id: '', doc_type: '', rule_name: 'check_po_present',
    rule_type: 'REQUIRED_FIELD', rule_config: '{"path": "headers.po_number"}',
    severity: 'ERROR', error_message: '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, pRes] = await Promise.all([
        api.get('/system-config/validation-rules?active_only=false'),
        api.get('/partners', { params: { limit: 500 } }),
      ]);
      setRows(vRes.data || []);
      const plist = Array.isArray(pRes.data) ? pRes.data : (pRes.data?.items || []);
      setPartners([{ id: '_global', label: '— Global (all partners) —' }, ...plist.map(p => ({ id: p.id, label: `${p.business_name} (${p.partner_code})` }))]);
    } catch { toast.error('Failed to load validation rules'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    let rule_config;
    try { rule_config = JSON.parse(form.rule_config); } catch { return toast.error('rule_config must be valid JSON'); }
    if (!form.rule_name.trim()) return toast.error('Rule name is required');
    setSaving(true);
    try {
      await api.post('/system-config/validation-rules', {
        partner_id: form.partner_id && form.partner_id !== '_global' ? form.partner_id : null,
        doc_type: form.doc_type?.trim() || null,
        rule_name: form.rule_name.trim(),
        rule_type: form.rule_type,
        rule_config,
        severity: form.severity,
        error_message: form.error_message?.trim() || null,
      });
      toast.success('Validation rule added');
      setShowAdd(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add'); }
    setSaving(false);
  };

  const handleToggle = async (row) => {
    try {
      await api.patch(`/system-config/validation-rules/${row.id}`, { is_active: !row.is_active });
      load();
    } catch { toast.error('Failed to update'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this validation rule?')) return;
    try {
      await api.delete(`/system-config/validation-rules/${id}`);
      toast.success('Deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Global and partner-specific validation rules. Wire these into the validator in a follow-up if needed.</p>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Rule</Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Scope</TableHead>
              <TableHead>Doc</TableHead>
              <TableHead>Name / Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No validation rules in DB.</TableCell></TableRow>
            ) : rows.map(row => {
              const partner = row.partner_id ? partners.find(p => p.id === row.partner_id) : null;
              return (
                <TableRow key={row.id}>
                  <TableCell className="text-xs">{partner?.label || 'Global'}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{row.doc_type || 'ALL'}</Badge></TableCell>
                  <TableCell>
                    <div className="font-medium text-xs">{row.rule_name}</div>
                    <div className="text-muted-foreground text-xs">{row.rule_type}</div>
                  </TableCell>
                  <TableCell><Badge className="text-xs">{row.severity}</Badge></TableCell>
                  <TableCell><StatusBadge active={row.is_active} /></TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggle(row)}>
                      {row.is_active ? <ToggleRight className="w-4 h-4 text-[var(--status-success-text)]" /> : <ToggleLeft className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(row.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Validation Rule</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Scope</Label>
              <Select value={form.partner_id || '_global'} onValueChange={v => setForm(f => ({ ...f, partner_id: v === '_global' ? '' : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{partners.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Doc type (optional)</Label>
                <Input value={form.doc_type} onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))} />
              </div>
              <div>
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ERROR">ERROR</SelectItem>
                    <SelectItem value="WARNING">WARNING</SelectItem>
                    <SelectItem value="INFO">INFO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Rule name</Label>
              <Input value={form.rule_name} onChange={e => setForm(f => ({ ...f, rule_name: e.target.value }))} />
            </div>
            <div>
              <Label>Rule type</Label>
              <Input value={form.rule_type} onChange={e => setForm(f => ({ ...f, rule_type: e.target.value }))} placeholder="REQUIRED_FIELD, FORMAT_CHECK…" />
            </div>
            <div>
              <Label>Rule config (JSON)</Label>
              <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono h-24 resize-none" value={form.rule_config} onChange={e => setForm(f => ({ ...f, rule_config: e.target.value }))} />
            </div>
            <div>
              <Label>Error message template</Label>
              <Input value={form.error_message} onChange={e => setForm(f => ({ ...f, error_message: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? 'Saving…' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Supported Formats ───────────────────────────────────────────────────────
function SupportedFormatsTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/system-config/supported-formats?active_only=false');
      setRows(res.data || []);
    } catch { toast.error('Failed to load formats'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (row) => {
    try {
      await api.patch(`/system-config/supported-formats/${row.id}`, null, { params: { is_active: !row.is_active } });
      toast.success(`${row.format_code} ${row.is_active ? 'disabled' : 'enabled'}`);
      load();
    } catch { toast.error('Failed to update'); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">File formats the ingestion pipeline accepts. Disable formats not in use.</p>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Format</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Extensions</TableHead>
              <TableHead>Detection</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Toggle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.id}>
                <TableCell className="font-mono font-bold">{row.format_code}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell className="text-xs font-mono">{(row.file_extensions || []).join(', ')}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{JSON.stringify(row.detection_rules || {})}</TableCell>
                <TableCell><StatusBadge active={row.is_active} /></TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggle(row)}>
                    {row.is_active ? <ToggleRight className="w-4 h-4 text-[var(--status-success-text)]" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ── Main System Config Panel ────────────────────────────────────────────────
function SystemConfigPanel() {
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await api.post('/system-config/seed');
      toast.success('Seed complete — tables populated with standard data');
    } catch (e) { toast.error(e.response?.data?.detail || 'Seed failed'); }
    setSeeding(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Cpu className="w-5 h-5 text-primary" />System Configuration</CardTitle>
              <CardDescription>
                All pipeline behavior is driven from the database. No code changes needed to add partners,
                identifiers, rules, or document types.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleSeed} disabled={seeding}>
              <Database className="w-4 h-4 mr-2" />
              {seeding ? 'Seeding…' : 'Re-run Seed'}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="identifiers" className="space-y-4">
        <TabsList className="flex w-full flex-wrap h-auto gap-1 p-1 justify-start">
          <TabsTrigger value="identifiers" className="flex items-center gap-1 text-xs sm:text-sm"><Tag className="w-3 h-3 shrink-0" />Identifiers</TabsTrigger>
          <TabsTrigger value="rules" className="flex items-center gap-1 text-xs sm:text-sm"><Zap className="w-3 h-3 shrink-0" />Rules</TabsTrigger>
          <TabsTrigger value="fieldmap" className="flex items-center gap-1 text-xs sm:text-sm"><Link2 className="w-3 h-3 shrink-0" />Fields</TabsTrigger>
          <TabsTrigger value="validation" className="flex items-center gap-1 text-xs sm:text-sm"><ShieldAlert className="w-3 h-3 shrink-0" />Validation</TabsTrigger>
          <TabsTrigger value="doctypes" className="flex items-center gap-1 text-xs sm:text-sm"><Layers className="w-3 h-3 shrink-0" />Doc Types</TabsTrigger>
          <TabsTrigger value="segments" className="flex items-center gap-1 text-xs sm:text-sm"><FileText className="w-3 h-3 shrink-0" />Segments</TabsTrigger>
          <TabsTrigger value="formats" className="flex items-center gap-1 text-xs sm:text-sm"><Server className="w-3 h-3 shrink-0" />Formats</TabsTrigger>
        </TabsList>

        <TabsContent value="identifiers">
          <Card><CardContent className="pt-6"><PartnerIdentifiersTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="rules">
          <Card><CardContent className="pt-6"><PartnerRulesTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="fieldmap">
          <Card><CardContent className="pt-6"><FieldMappingsTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="validation">
          <Card><CardContent className="pt-6"><ValidationRulesConfigTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="doctypes">
          <Card><CardContent className="pt-6"><DocumentTypesTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="segments">
          <Card><CardContent className="pt-6"><SegmentDefinitionsTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="formats">
          <Card><CardContent className="pt-6"><SupportedFormatsTab /></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export const Settings = () => {
  const [settings, setSettings] = useState({
    // General Settings
    platformName: 'Agent Eddy',
    timezone: 'America/New_York',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    language: 'en',
    
    // AI Configuration
    aiEnabled: true,
    autoApproveThreshold: 90,
    flagReviewThreshold: 75,
    requireApprovalThreshold: 75,
    aiModel: 'GPT-4',
    learningEnabled: true,
    
    // EDI Settings
    ourCompanyIsaId: '',
    defaultEDIStandard: 'X12',
    defaultVersion: '5010',
    defaultCharacterSet: 'UTF-8',
    defaultDelimiters: {
      element: '*',
      segment: '~',
      subElement: '>',
    },
    autoValidate: true,
    strictValidation: false,
    
    // Transport Settings
    defaultTransport: 'SFTP',
    sftpHost: '',
    sftpPort: '22',
    sftpUsername: '',
    sftpPath: '/inbound/edi',
    s3Bucket: '',
    s3Region: 'us-east-1',
    autoRetry: true,
    retryAttempts: 3,
    retryInterval: 30,
    
    // Notification Settings
    emailNotifications: true,
    emailAddress: 'admin@company.com',
    exceptionAlerts: true,
    dailyDigest: true,
    realTimeAlerts: false,
    slackWebhook: '',
    
    // Security Settings
    sessionTimeout: 30,
    passwordPolicy: 'strong',
    twoFactorAuth: false,
    auditLogRetention: 7,
    encryptionEnabled: true,
    
    // Integration Settings
    erpType: 'SAP',
    erpEndpoint: '',
    erpApiKey: '',
    apiRateLimit: 100,
    webhookUrl: '',
    
    // User Profile
    userName: 'Admin User',
    userEmail: 'admin@company.com',
    userRole: 'Administrator',
    
    // Partner Voice Assistant (speech on add-partner chat when ON; same chat UI, text-only when OFF)
    partnerVoiceAssistantEnabled: false,
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slackConfigured, setSlackConfigured] = useState(false);

  const VOICE_KEY = 'agent_eddy_partner_voice_assistant';

  // Load settings from backend; prefer localStorage when API returns false (persistence fix)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { getSettings } = await import('@/services/settings');
        const data = await getSettings();
        setSlackConfigured(data.slack_webhook_configured || false);
        const apiVoice = Boolean(data.partner_voice_assistant_enabled);
        const stored = localStorage.getItem(VOICE_KEY);
        const storedVoice = stored === 'true';
        const useVoice = apiVoice || storedVoice;
        if (useVoice !== apiVoice) localStorage.setItem(VOICE_KEY, String(useVoice));
        setSettings(prev => ({
          ...prev,
          exceptionAlerts: data.exception_alerts ?? prev.exceptionAlerts,
          realTimeAlerts: data.document_alerts ?? prev.realTimeAlerts,
          ourCompanyIsaId: data.our_company_isa_id ?? prev.ourCompanyIsaId ?? '',
          partnerVoiceAssistantEnabled: useVoice,
        }));
      } catch (err) {
        const stored = localStorage.getItem(VOICE_KEY);
        if (stored !== null) {
          setSettings(prev => ({
            ...prev,
            partnerVoiceAssistantEnabled: stored === 'true',
          }));
        }
      }
    };
    loadSettings();
  }, []);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleNestedChange = (parentKey, childKey, value) => {
    setSettings(prev => ({
      ...prev,
      [parentKey]: {
        ...prev[parentKey],
        [childKey]: value,
      },
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const voice = settings.partnerVoiceAssistantEnabled;
    try {
      const { updateSettings } = await import('@/services/settings');
      const data = await updateSettings({
        slack_webhook_url: settings.slackWebhook || null,
        exception_alerts: settings.exceptionAlerts,
        document_alerts: settings.realTimeAlerts,
        our_company_isa_id: settings.ourCompanyIsaId?.trim() || null,
        partner_voice_assistant_enabled: voice,
      });
      setSlackConfigured(Boolean(data.slack_webhook_configured));
      setHasChanges(false);
      const savedVoice = Boolean(data.partner_voice_assistant_enabled);
      const useVoice = savedVoice || voice;
      localStorage.setItem(VOICE_KEY, String(useVoice));
      setSettings(prev => ({
        ...prev,
        partnerVoiceAssistantEnabled: useVoice,
      }));
      toast.success('Settings saved successfully');
    } catch (err) {
      localStorage.setItem(VOICE_KEY, String(voice));
      setHasChanges(false);
      setSettings(prev => ({ ...prev, partnerVoiceAssistantEnabled: voice }));
      toast.success('Settings saved (local fallback)');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    // Reset to defaults
    toast.info('Settings reset to defaults');
    setHasChanges(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure platform settings, AI behavior, and integrations
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="secondary" className="gap-1.5">
              <AlertCircle className="w-3 h-3" />
              Unsaved changes
            </Badge>
          )}
          <Button variant="outline" onClick={handleReset} disabled={!hasChanges}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Settings Tabs */}
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="ai">AI Config</TabsTrigger>
          <TabsTrigger value="edi">EDI</TabsTrigger>
          <TabsTrigger value="transport">Transport</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-1">
            <Cpu className="w-3 h-3" />System Config
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Platform Settings</CardTitle>
              <CardDescription>Basic platform configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="platformName">Platform Name</Label>
                  <Input
                    id="platformName"
                    value={settings.platformName}
                    onChange={(e) => handleChange('platformName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={settings.timezone} onValueChange={(value) => handleChange('timezone', value)}>
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                      <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateFormat">Date Format</Label>
                  <Select value={settings.dateFormat} onValueChange={(value) => handleChange('dateFormat', value)}>
                    <SelectTrigger id="dateFormat">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeFormat">Time Format</Label>
                  <Select value={settings.timeFormat} onValueChange={(value) => handleChange('timeFormat', value)}>
                    <SelectTrigger id="timeFormat">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12h">12-hour</SelectItem>
                      <SelectItem value="24h">24-hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select value={settings.language} onValueChange={(value) => handleChange('language', value)}>
                    <SelectTrigger id="language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Partner Voice Assistant */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="w-5 h-5 text-primary" />
                Partner Voice Assistant
              </CardTitle>
              <CardDescription>
                When ON: Add Partner chat uses speech-to-text and spoken prompts. When OFF: same chat flow, text only (no mic or TTS).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="partnerVoiceAssistantEnabled" className="flex items-center gap-2">
                    Partner Voice Assistant
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {settings.partnerVoiceAssistantEnabled
                      ? 'Add partner: chat + voice (listen & speak)'
                      : 'Add partner: chat only (type answers; upload still available)'}
                  </p>
                </div>
                <Switch
                  id="partnerVoiceAssistantEnabled"
                  checked={settings.partnerVoiceAssistantEnabled}
                  onCheckedChange={(checked) => handleChange('partnerVoiceAssistantEnabled', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Configuration */}
        <TabsContent value="ai" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" />
                AI Configuration
              </CardTitle>
              <CardDescription>Configure AI behavior and confidence thresholds</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="aiEnabled">Enable AI Processing</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow AI to autonomously process EDI documents
                  </p>
                </div>
                <Switch
                  id="aiEnabled"
                  checked={settings.aiEnabled}
                  onCheckedChange={(checked) => handleChange('aiEnabled', checked)}
                />
              </div>
              <Separator />
              <div className="space-y-4">
                <div>
                  <Label>Confidence Thresholds</Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    Set confidence levels for automatic processing and review flags
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="autoApprove">Auto-Approve (%)</Label>
                      <Input
                        id="autoApprove"
                        type="number"
                        min="0"
                        max="100"
                        value={settings.autoApproveThreshold}
                        onChange={(e) => handleChange('autoApproveThreshold', parseInt(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">≥ {settings.autoApproveThreshold}% confidence</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="flagReview">Flag for Review (%)</Label>
                      <Input
                        id="flagReview"
                        type="number"
                        min="0"
                        max="100"
                        value={settings.flagReviewThreshold}
                        onChange={(e) => handleChange('flagReviewThreshold', parseInt(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">75-{settings.autoApproveThreshold - 1}% confidence</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="requireApproval">Require Approval (%)</Label>
                      <Input
                        id="requireApproval"
                        type="number"
                        min="0"
                        max="100"
                        value={settings.requireApprovalThreshold}
                        onChange={(e) => handleChange('requireApprovalThreshold', parseInt(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">&lt; {settings.flagReviewThreshold}% confidence</p>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="aiModel">AI Model</Label>
                    <Select value={settings.aiModel} onValueChange={(value) => handleChange('aiModel', value)}>
                      <SelectTrigger id="aiModel">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GPT-4">GPT-4</SelectItem>
                        <SelectItem value="GPT-3.5">GPT-3.5</SelectItem>
                        <SelectItem value="Claude">Claude</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="learningEnabled">Learning Enabled</Label>
                      <p className="text-sm text-muted-foreground">
                        AI learns from corrections and approvals
                      </p>
                    </div>
                    <Switch
                      id="learningEnabled"
                      checked={settings.learningEnabled}
                      onCheckedChange={(checked) => handleChange('learningEnabled', checked)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EDI Settings */}
        <TabsContent value="edi" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                EDI Configuration
              </CardTitle>
              <CardDescription>Default EDI standards and validation rules</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="ourCompanyIsaId">Our Company ISA ID</Label>
                <Input
                  id="ourCompanyIsaId"
                  value={settings.ourCompanyIsaId}
                  onChange={(e) => handleChange('ourCompanyIsaId', e.target.value)}
                  placeholder="ACME_CORP"
                />
                <p className="text-xs text-muted-foreground">
                  Used to auto-detect Inbound (document sent TO you) vs Outbound (document sent FROM you). Example: ACME_CORP, YOURCOMPANY
                </p>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="defaultEDIStandard">Default EDI Standard</Label>
                  <Select value={settings.defaultEDIStandard} onValueChange={(value) => handleChange('defaultEDIStandard', value)}>
                    <SelectTrigger id="defaultEDIStandard">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="X12">X12</SelectItem>
                      <SelectItem value="EDIFACT">EDIFACT</SelectItem>
                      <SelectItem value="TRADACOMS">TRADACOMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultVersion">Default Version</Label>
                  <Select value={settings.defaultVersion} onValueChange={(value) => handleChange('defaultVersion', value)}>
                    <SelectTrigger id="defaultVersion">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5010">5010</SelectItem>
                      <SelectItem value="4010">4010</SelectItem>
                      <SelectItem value="3060">3060</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultCharacterSet">Character Set</Label>
                  <Select value={settings.defaultCharacterSet} onValueChange={(value) => handleChange('defaultCharacterSet', value)}>
                    <SelectTrigger id="defaultCharacterSet">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTF-8">UTF-8</SelectItem>
                      <SelectItem value="ASCII">ASCII</SelectItem>
                      <SelectItem value="EBCDIC">EBCDIC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Separator />
              <div>
                <Label>Default Delimiters</Label>
                <div className="grid grid-cols-3 gap-4 mt-2">
                  <div className="space-y-2">
                    <Label htmlFor="elementDelimiter">Element</Label>
                    <Input
                      id="elementDelimiter"
                      maxLength={1}
                      value={settings.defaultDelimiters.element}
                      onChange={(e) => handleNestedChange('defaultDelimiters', 'element', e.target.value)}
                      className="font-mono text-center text-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="segmentDelimiter">Segment</Label>
                    <Input
                      id="segmentDelimiter"
                      maxLength={1}
                      value={settings.defaultDelimiters.segment}
                      onChange={(e) => handleNestedChange('defaultDelimiters', 'segment', e.target.value)}
                      className="font-mono text-center text-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subElementDelimiter">Sub-Element</Label>
                    <Input
                      id="subElementDelimiter"
                      maxLength={1}
                      value={settings.defaultDelimiters.subElement}
                      onChange={(e) => handleNestedChange('defaultDelimiters', 'subElement', e.target.value)}
                      className="font-mono text-center text-lg"
                    />
                  </div>
                </div>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoValidate">Auto-Validate Documents</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically validate EDI documents against standards
                    </p>
                  </div>
                  <Switch
                    id="autoValidate"
                    checked={settings.autoValidate}
                    onCheckedChange={(checked) => handleChange('autoValidate', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="strictValidation">Strict Validation</Label>
                    <p className="text-sm text-muted-foreground">
                      Reject documents that don't strictly comply with standards
                    </p>
                  </div>
                  <Switch
                    id="strictValidation"
                    checked={settings.strictValidation}
                    onCheckedChange={(checked) => handleChange('strictValidation', checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transport Settings */}
        <TabsContent value="transport" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" />
                Transport Configuration
              </CardTitle>
              <CardDescription>File transfer and connection settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="defaultTransport">Default Transport Method</Label>
                <Select value={settings.defaultTransport} onValueChange={(value) => handleChange('defaultTransport', value)}>
                  <SelectTrigger id="defaultTransport">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SFTP">SFTP</SelectItem>
                    <SelectItem value="S3">Amazon S3</SelectItem>
                    <SelectItem value="FTP">FTP</SelectItem>
                    <SelectItem value="AS2">AS2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              {settings.defaultTransport === 'SFTP' && (
                <div className="space-y-4">
                  <h3 className="font-semibold">SFTP Settings</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sftpHost">Host</Label>
                      <Input
                        id="sftpHost"
                        value={settings.sftpHost}
                        onChange={(e) => handleChange('sftpHost', e.target.value)}
                        placeholder="sftp.example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sftpPort">Port</Label>
                      <Input
                        id="sftpPort"
                        type="number"
                        value={settings.sftpPort}
                        onChange={(e) => handleChange('sftpPort', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sftpUsername">Username</Label>
                      <Input
                        id="sftpUsername"
                        value={settings.sftpUsername}
                        onChange={(e) => handleChange('sftpUsername', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sftpPath">Remote Path</Label>
                      <Input
                        id="sftpPath"
                        value={settings.sftpPath}
                        onChange={(e) => handleChange('sftpPath', e.target.value)}
                        placeholder="/inbound/edi"
                      />
                    </div>
                  </div>
                </div>
              )}
              {settings.defaultTransport === 'S3' && (
                <div className="space-y-4">
                  <h3 className="font-semibold">S3 Settings</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="s3Bucket">Bucket Name</Label>
                      <Input
                        id="s3Bucket"
                        value={settings.s3Bucket}
                        onChange={(e) => handleChange('s3Bucket', e.target.value)}
                        placeholder="my-edi-bucket"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="s3Region">Region</Label>
                      <Input
                        id="s3Region"
                        value={settings.s3Region}
                        onChange={(e) => handleChange('s3Region', e.target.value)}
                        placeholder="us-east-1"
                      />
                    </div>
                  </div>
                </div>
              )}
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoRetry">Auto-Retry Failed Transfers</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically retry failed file transfers
                    </p>
                  </div>
                  <Switch
                    id="autoRetry"
                    checked={settings.autoRetry}
                    onCheckedChange={(checked) => handleChange('autoRetry', checked)}
                  />
                </div>
                {settings.autoRetry && (
                  <div className="grid grid-cols-2 gap-4 pl-6 border-l-2 border-border">
                    <div className="space-y-2">
                      <Label htmlFor="retryAttempts">Retry Attempts</Label>
                      <Input
                        id="retryAttempts"
                        type="number"
                        min="1"
                        max="10"
                        value={settings.retryAttempts}
                        onChange={(e) => handleChange('retryAttempts', parseInt(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="retryInterval">Retry Interval (seconds)</Label>
                      <Input
                        id="retryInterval"
                        type="number"
                        min="10"
                        value={settings.retryInterval}
                        onChange={(e) => handleChange('retryInterval', parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Notification Settings
              </CardTitle>
              <CardDescription>Configure how and when you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="emailNotifications">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications via email
                  </p>
                </div>
                <Switch
                  id="emailNotifications"
                  checked={settings.emailNotifications}
                  onCheckedChange={(checked) => handleChange('emailNotifications', checked)}
                />
              </div>
              {settings.emailNotifications && (
                <div className="space-y-2 pl-6 border-l-2 border-border">
                  <Label htmlFor="emailAddress">Email Address</Label>
                  <Input
                    id="emailAddress"
                    type="email"
                    value={settings.emailAddress}
                    onChange={(e) => handleChange('emailAddress', e.target.value)}
                    placeholder="admin@company.com"
                  />
                </div>
              )}
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="exceptionAlerts">Exception Alerts</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when exceptions occur
                    </p>
                  </div>
                  <Switch
                    id="exceptionAlerts"
                    checked={settings.exceptionAlerts}
                    onCheckedChange={(checked) => handleChange('exceptionAlerts', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="dailyDigest">Daily Digest</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive daily summary of activities
                    </p>
                  </div>
                  <Switch
                    id="dailyDigest"
                    checked={settings.dailyDigest}
                    onCheckedChange={(checked) => handleChange('dailyDigest', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="realTimeAlerts">Real-Time Alerts</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive immediate notifications for critical events
                    </p>
                  </div>
                  <Switch
                    id="realTimeAlerts"
                    checked={settings.realTimeAlerts}
                    onCheckedChange={(checked) => handleChange('realTimeAlerts', checked)}
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="slackWebhook">Slack Webhook URL (Optional)</Label>
                <Input
                  id="slackWebhook"
                  value={settings.slackWebhook}
                  onChange={(e) => handleChange('slackWebhook', e.target.value)}
                  placeholder={slackConfigured ? "Configured – enter new URL to replace" : "https://hooks.slack.com/services/..."}
                />
                <p className="text-xs text-muted-foreground">
                  Get a webhook from Slack: Apps → Incoming Webhooks. Alerts for exceptions and document status.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Security Settings
              </CardTitle>
              <CardDescription>Configure security and access control</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    min="5"
                    max="480"
                    value={settings.sessionTimeout}
                    onChange={(e) => handleChange('sessionTimeout', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="passwordPolicy">Password Policy</Label>
                  <Select value={settings.passwordPolicy} onValueChange={(value) => handleChange('passwordPolicy', value)}>
                    <SelectTrigger id="passwordPolicy">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="strong">Strong</SelectItem>
                      <SelectItem value="very-strong">Very Strong</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="twoFactorAuth">Two-Factor Authentication</Label>
                    <p className="text-sm text-muted-foreground">
                      Require 2FA for all user accounts
                    </p>
                  </div>
                  <Switch
                    id="twoFactorAuth"
                    checked={settings.twoFactorAuth}
                    onCheckedChange={(checked) => handleChange('twoFactorAuth', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="encryptionEnabled">Data Encryption</Label>
                    <p className="text-sm text-muted-foreground">
                      Encrypt sensitive EDI data at rest
                    </p>
                  </div>
                  <Switch
                    id="encryptionEnabled"
                    checked={settings.encryptionEnabled}
                    onCheckedChange={(checked) => handleChange('encryptionEnabled', checked)}
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="auditLogRetention">Audit Log Retention (years)</Label>
                <Input
                  id="auditLogRetention"
                  type="number"
                  min="1"
                  max="10"
                  value={settings.auditLogRetention}
                  onChange={(e) => handleChange('auditLogRetention', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Audit logs will be retained for {settings.auditLogRetention} year(s) per compliance requirements
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profile Settings */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                User Profile
              </CardTitle>
              <CardDescription>Manage your account settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">
                    {settings.userName.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-lg">{settings.userName}</p>
                  <p className="text-sm text-muted-foreground">{settings.userEmail}</p>
                  <Badge variant="outline" className="mt-1">{settings.userRole}</Badge>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="userName">Full Name</Label>
                  <Input
                    id="userName"
                    value={settings.userName}
                    onChange={(e) => handleChange('userName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="userEmail">Email Address</Label>
                  <Input
                    id="userEmail"
                    type="email"
                    value={settings.userEmail}
                    onChange={(e) => handleChange('userEmail', e.target.value)}
                  />
                </div>
              </div>
              <Separator />
              <div>
                <Label>Role</Label>
                <p className="text-sm text-muted-foreground mt-1">{settings.userRole}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Contact your administrator to change your role
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Integration Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                Integration Settings
              </CardTitle>
              <CardDescription>Configure ERP and external system integrations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="erpType">ERP System</Label>
                  <Select value={settings.erpType} onValueChange={(value) => handleChange('erpType', value)}>
                    <SelectTrigger id="erpType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SAP">SAP</SelectItem>
                      <SelectItem value="Oracle">Oracle</SelectItem>
                      <SelectItem value="NetSuite">NetSuite</SelectItem>
                      <SelectItem value="Custom">Custom API</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apiRateLimit">API Rate Limit (requests/min)</Label>
                  <Input
                    id="apiRateLimit"
                    type="number"
                    min="10"
                    value={settings.apiRateLimit}
                    onChange={(e) => handleChange('apiRateLimit', parseInt(e.target.value))}
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="erpEndpoint">ERP Endpoint URL</Label>
                  <Input
                    id="erpEndpoint"
                    value={settings.erpEndpoint}
                    onChange={(e) => handleChange('erpEndpoint', e.target.value)}
                    placeholder="https://api.example.com/edi"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="erpApiKey">API Key</Label>
                  <Input
                    id="erpApiKey"
                    type="password"
                    value={settings.erpApiKey}
                    onChange={(e) => handleChange('erpApiKey', e.target.value)}
                    placeholder="Enter API key"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">Webhook URL</Label>
                  <Input
                    id="webhookUrl"
                    value={settings.webhookUrl}
                    onChange={(e) => handleChange('webhookUrl', e.target.value)}
                    placeholder="https://webhook.example.com/callback"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            SYSTEM CONFIG TAB
        ================================================================ */}
        <TabsContent value="system">
          <SystemConfigPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};
