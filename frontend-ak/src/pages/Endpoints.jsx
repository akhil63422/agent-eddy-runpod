import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Search, RefreshCw, Wifi, WifiOff, AlertCircle, CheckCircle2,
  Edit2, Trash2, X, Eye, EyeOff, Loader2, ChevronDown, TestTube2,
  Server, Globe, Lock, Key, FileText, Clock, Zap, ArrowDownToLine,
  ArrowUpFromLine, ArrowLeftRight, Copy, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { endpointsService } from '@/services/endpoints';
import { partnersService } from '@/services/partners';

// ─── Constants ───────────────────────────────────────────────────────────────

const PROTOCOLS = ['AS2', 'SFTP', 'FTP', 'FTPS', 'HTTPS', 'AS4', 'VAN'];

const PROTOCOL_META = {
  AS2:   { color: '#00ed64', bg: '#00ed6418', label: 'AS2',   icon: Zap },
  SFTP:  { color: '#3b82f6', bg: '#3b82f618', label: 'SFTP',  icon: Server },
  FTP:   { color: '#f59e0b', bg: '#f59e0b18', label: 'FTP',   icon: Server },
  FTPS:  { color: '#f97316', bg: '#f9731618', label: 'FTPS',  icon: Lock },
  HTTPS: { color: '#8b5cf6', bg: '#8b5cf618', label: 'HTTPS', icon: Globe },
  AS4:   { color: '#06b6d4', bg: '#06b6d418', label: 'AS4',   icon: Zap },
  VAN:   { color: '#ec4899', bg: '#ec489918', label: 'VAN',   icon: Globe },
};

const DIRECTION_META = {
  Inbound:  { icon: ArrowDownToLine, label: 'Inbound' },
  Outbound: { icon: ArrowUpFromLine, label: 'Outbound' },
  Both:     { icon: ArrowLeftRight,  label: 'Both' },
};

// ─── Protocol-specific config fields ─────────────────────────────────────────

const CONFIG_FIELDS = {
  AS2: [
    { key: 'partner_as2_id',  label: 'Partner AS2 ID',    type: 'text',     placeholder: 'PARTNER-AS2-ID', section: 'Identity' },
    { key: 'local_as2_id',    label: 'Local AS2 ID',       type: 'text',     placeholder: 'OUR-AS2-ID',     section: 'Identity' },
    { key: 'partner_url',     label: 'Partner AS2 URL',    type: 'text',     placeholder: 'https://as2.partner.com/receive', section: 'Connection' },
    { key: 'local_url',       label: 'Our AS2 Receive URL', type: 'text',    placeholder: 'https://our.host/as2/receive',    section: 'Connection' },
    { key: 'mdn_type',        label: 'MDN Type',           type: 'select',   options: ['Synchronous', 'Asynchronous', 'None'], section: 'MDN' },
    { key: 'mdn_url',         label: 'Async MDN URL',      type: 'text',     placeholder: 'https://our.host/as2/mdn',        section: 'MDN' },
    { key: 'encryption',      label: 'Encryption',         type: 'select',   options: ['AES-256', '3DES', 'None'], section: 'Security' },
    { key: 'signing',         label: 'Signing Algorithm',  type: 'select',   options: ['SHA-256', 'SHA-1', 'MD5', 'None'],   section: 'Security' },
    { key: 'partner_cert',    label: 'Partner Certificate (PEM)', type: 'textarea', placeholder: '-----BEGIN CERTIFICATE-----\n...', section: 'Certificates' },
    { key: 'local_cert',      label: 'Local Certificate (PEM)',   type: 'textarea', placeholder: '-----BEGIN CERTIFICATE-----\n...', section: 'Certificates' },
  ],
  SFTP: [
    { key: 'host',        label: 'Host / IP',       type: 'text',     placeholder: 'sftp.partner.com',  section: 'Connection' },
    { key: 'port',        label: 'Port',            type: 'number',   placeholder: '22',                section: 'Connection' },
    { key: 'username',    label: 'Username',        type: 'text',     placeholder: 'edi_user',          section: 'Credentials' },
    { key: 'password',    label: 'Password',        type: 'password', placeholder: '',                  section: 'Credentials' },
    { key: 'private_key', label: 'Private Key (PEM)', type: 'textarea', placeholder: '-----BEGIN RSA PRIVATE KEY-----\n...', section: 'Credentials' },
    { key: 'inbound_path',  label: 'Inbound Directory',  type: 'text', placeholder: '/edi/inbound',  section: 'Paths' },
    { key: 'outbound_path', label: 'Outbound Directory', type: 'text', placeholder: '/edi/outbound', section: 'Paths' },
    { key: 'fingerprint', label: 'Host Fingerprint', type: 'text',   placeholder: 'SHA256:...',        section: 'Security' },
    { key: 'poll_schedule', label: 'Poll Schedule (cron)', type: 'text', placeholder: '*/15 * * * *', section: 'Schedule' },
  ],
  FTP: [
    { key: 'host',          label: 'Host / IP',    type: 'text',   placeholder: 'ftp.partner.com', section: 'Connection' },
    { key: 'port',          label: 'Port',         type: 'number', placeholder: '21',             section: 'Connection' },
    { key: 'passive_mode',  label: 'Passive Mode', type: 'select', options: ['true', 'false'],    section: 'Connection' },
    { key: 'username',      label: 'Username',     type: 'text',   placeholder: 'edi_user',       section: 'Credentials' },
    { key: 'password',      label: 'Password',     type: 'password', placeholder: '',             section: 'Credentials' },
    { key: 'inbound_path',  label: 'Inbound Directory',  type: 'text', placeholder: '/edi/inbound',  section: 'Paths' },
    { key: 'outbound_path', label: 'Outbound Directory', type: 'text', placeholder: '/edi/outbound', section: 'Paths' },
  ],
  FTPS: [
    { key: 'host',         label: 'Host / IP',   type: 'text',     placeholder: 'ftps.partner.com', section: 'Connection' },
    { key: 'port',         label: 'Port',        type: 'number',   placeholder: '990',              section: 'Connection' },
    { key: 'username',     label: 'Username',    type: 'text',     placeholder: 'edi_user',         section: 'Credentials' },
    { key: 'password',     label: 'Password',    type: 'password', placeholder: '',                 section: 'Credentials' },
    { key: 'ca_cert',      label: 'CA Certificate (PEM)', type: 'textarea', placeholder: '-----BEGIN CERTIFICATE-----\n...', section: 'Security' },
    { key: 'inbound_path', label: 'Inbound Directory',  type: 'text', placeholder: '/edi/inbound',  section: 'Paths' },
    { key: 'outbound_path',label: 'Outbound Directory', type: 'text', placeholder: '/edi/outbound', section: 'Paths' },
  ],
  HTTPS: [
    { key: 'url',          label: 'Endpoint URL',   type: 'text',   placeholder: 'https://api.partner.com/edi', section: 'Connection' },
    { key: 'method',       label: 'HTTP Method',    type: 'select', options: ['POST', 'PUT', 'GET'],            section: 'Connection' },
    { key: 'auth_type',    label: 'Authentication', type: 'select', options: ['None', 'API Key', 'Bearer Token', 'Basic', 'OAuth 2.0'], section: 'Auth' },
    { key: 'auth_key',     label: 'API Key / Token', type: 'password', placeholder: '',                        section: 'Auth' },
    { key: 'auth_username',label: 'Username (Basic)', type: 'text',  placeholder: '',                          section: 'Auth' },
    { key: 'auth_password',label: 'Password (Basic)', type: 'password', placeholder: '',                       section: 'Auth' },
    { key: 'headers',      label: 'Custom Headers (JSON)', type: 'textarea', placeholder: '{"Content-Type":"application/json"}', section: 'Headers' },
    { key: 'timeout',      label: 'Timeout (seconds)', type: 'number', placeholder: '30',                      section: 'Connection' },
  ],
  AS4: [
    { key: 'url',           label: 'AS4 Endpoint URL', type: 'text', placeholder: 'https://as4.partner.com/msh', section: 'Connection' },
    { key: 'party_id',      label: 'Partner Party ID', type: 'text', placeholder: 'urn:oasis:names:tc:ebcore:partyid:...',  section: 'Identity' },
    { key: 'local_party_id',label: 'Local Party ID',   type: 'text', placeholder: 'urn:oasis:names:tc:ebcore:partyid:...',  section: 'Identity' },
    { key: 'signing',       label: 'Signing Algorithm', type: 'select', options: ['SHA-256', 'SHA-1', 'None'], section: 'Security' },
    { key: 'encryption',    label: 'Encryption',        type: 'select', options: ['AES-256', '3DES', 'None'], section: 'Security' },
    { key: 'partner_cert',  label: 'Partner Certificate (PEM)', type: 'textarea', placeholder: '-----BEGIN CERTIFICATE-----\n...', section: 'Certificates' },
  ],
  VAN: [
    { key: 'provider',    label: 'VAN Provider',  type: 'select', options: ['SPS Commerce', '1 EDI Source', 'TrueCommerce', 'Inovis', 'GXS/OpenText', 'Sterling Commerce', 'DigiLink', 'Other'], section: 'Provider' },
    { key: 'mailbox_id',  label: 'Mailbox ID',    type: 'text',   placeholder: 'MAILBOX-12345',      section: 'Provider' },
    { key: 'api_url',     label: 'VAN API URL',   type: 'text',   placeholder: 'https://api.spscommerce.com/v1', section: 'Connection' },
    { key: 'api_key',     label: 'API Key',       type: 'password', placeholder: '',                 section: 'Credentials' },
    { key: 'username',    label: 'Username',      type: 'text',   placeholder: '',                   section: 'Credentials' },
    { key: 'password',    label: 'Password',      type: 'password', placeholder: '',                 section: 'Credentials' },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

// ─── StatusDot ────────────────────────────────────────────────────────────────

const StatusDot = ({ status, size = 'md' }) => {
  const colors = {
    Active:   { dot: '#22c55e', glow: '0 0 6px #22c55e88' },
    Inactive: { dot: '#6b7280', glow: 'none' },
    Error:    { dot: '#ef4444', glow: '0 0 6px #ef444488' },
  };
  const c = colors[status] || colors.Inactive;
  const dim = size === 'sm' ? 8 : 10;
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: dim, height: dim, background: c.dot, boxShadow: c.glow }}
      title={status}
    />
  );
};

// ─── ProtocolBadge ────────────────────────────────────────────────────────────

const ProtocolBadge = ({ protocol }) => {
  const meta = PROTOCOL_META[protocol] || { color: '#6b7280', bg: '#6b728018', label: protocol };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold"
      style={{ color: meta.color, background: meta.bg }}
    >
      {meta.label}
    </span>
  );
};

// ─── EndpointCard ─────────────────────────────────────────────────────────────

const EndpointCard = ({ endpoint, partnerName, onEdit, onDelete, onTest, testing }) => {
  const dirMeta = DIRECTION_META[endpoint.direction] || DIRECTION_META.Both;
  const DirIcon = dirMeta.icon;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 flex flex-col gap-4 hover:border-[var(--border-focus)] transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <StatusDot status={endpoint.status} />
          <div className="min-w-0">
            <p className="font-semibold text-[var(--text-primary)] truncate">{endpoint.name}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{partnerName || endpoint.partner_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <ProtocolBadge protocol={endpoint.protocol} />
          <Badge variant="outline" className="text-xs gap-1 text-[var(--text-secondary)]">
            <DirIcon className="w-3 h-3" />
            {dirMeta.label}
          </Badge>
        </div>
      </div>

      {/* Config summary */}
      <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
        {_summaryFields(endpoint.protocol, endpoint.config || {}).map(([k, v]) => (
          <div key={k} className="truncate">
            <span className="text-[var(--text-muted)]">{k}: </span>
            <span className="text-[var(--text-primary)]">{v}</span>
          </div>
        ))}
      </div>

      {/* Last test result */}
      {endpoint.last_tested && (
        <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
          endpoint.last_test_result === 'success'
            ? 'bg-[var(--status-success)]/10 text-[var(--status-success-text)]'
            : 'bg-[var(--status-error)]/10 text-[var(--status-error-text)]'
        }`}>
          {endpoint.last_test_result === 'success'
            ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          }
          <span className="truncate">{endpoint.last_test_message || endpoint.last_test_result}</span>
          <span className="ml-auto flex-shrink-0 text-[var(--text-muted)]">{fmtDate(endpoint.last_tested)}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5 text-xs"
          disabled={testing}
          onClick={() => onTest(endpoint.id)}
        >
          {testing
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <TestTube2 className="w-3.5 h-3.5" />}
          Test Connection
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(endpoint)}>
          <Edit2 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-[var(--text-secondary)] hover:text-[var(--status-error-text)]"
          onClick={() => onDelete(endpoint)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

function _summaryFields(protocol, config) {
  const rows = [];
  if (protocol === 'AS2') {
    if (config.partner_as2_id) rows.push(['Partner ID', config.partner_as2_id]);
    if (config.partner_url) rows.push(['URL', config.partner_url]);
  } else if (protocol === 'SFTP' || protocol === 'FTP' || protocol === 'FTPS') {
    if (config.host) rows.push(['Host', `${config.host}:${config.port || (protocol === 'SFTP' ? 22 : 21)}`]);
    if (config.username) rows.push(['User', config.username]);
    if (config.inbound_path) rows.push(['Inbound', config.inbound_path]);
    if (config.outbound_path) rows.push(['Outbound', config.outbound_path]);
  } else if (protocol === 'HTTPS') {
    if (config.url) rows.push(['URL', config.url]);
    if (config.auth_type && config.auth_type !== 'None') rows.push(['Auth', config.auth_type]);
  } else if (protocol === 'AS4') {
    if (config.url) rows.push(['URL', config.url]);
    if (config.party_id) rows.push(['Party ID', config.party_id]);
  } else if (protocol === 'VAN') {
    if (config.provider) rows.push(['Provider', config.provider]);
    if (config.mailbox_id) rows.push(['Mailbox', config.mailbox_id]);
  }
  return rows.slice(0, 4);
}

// ─── ConfigSection ────────────────────────────────────────────────────────────

const ConfigSection = ({ section, fields, config, onChange }) => {
  const [visible, setVisible] = useState({});

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] border-b border-[var(--border)] pb-1">
        {section}
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {fields.map((f) => {
          const val = config[f.key] ?? '';
          const isPassword = f.type === 'password';
          const showClear = isPassword && visible[f.key];
          return (
            <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <Label className="text-xs text-[var(--text-secondary)] mb-1 block">{f.label}</Label>
              {f.type === 'select' ? (
                <Select value={val || ''} onValueChange={(v) => onChange(f.key, v)}>
                  <SelectTrigger className="h-9 text-sm bg-[var(--bg-elevated)]">
                    <SelectValue placeholder={`Select ${f.label}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === 'textarea' ? (
                <Textarea
                  value={val}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  rows={4}
                  className="font-mono text-xs bg-[var(--bg-elevated)]"
                />
              ) : (
                <div className="relative">
                  <Input
                    type={isPassword && !visible[f.key] ? 'password' : 'text'}
                    value={val}
                    onChange={(e) => onChange(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="h-9 text-sm bg-[var(--bg-elevated)] pr-8"
                  />
                  {isPassword && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                      onClick={() => setVisible((v) => ({ ...v, [f.key]: !v[f.key] }))}
                    >
                      {visible[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── EndpointModal ────────────────────────────────────────────────────────────

const BLANK = { partner_id: '', name: '', protocol: 'AS2', direction: 'Both', status: 'Inactive', config: {} };

const EndpointModal = ({ open, onClose, endpoint, partners, onSave }) => {
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const isEdit = !!endpoint?.id;

  useEffect(() => {
    if (open) {
      setForm(endpoint ? { ...BLANK, ...endpoint, config: { ...(endpoint.config || {}) } } : { ...BLANK });
    }
  }, [open, endpoint]);

  const setConfig = (key, value) =>
    setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));

  const handleSave = async () => {
    if (!form.partner_id) { toast.error('Please select a partner'); return; }
    if (!form.name.trim()) { toast.error('Endpoint name is required'); return; }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const fields = CONFIG_FIELDS[form.protocol] || [];
  const sections = [...new Set(fields.map((f) => f.section))];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent hideClose className="max-w-2xl h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{isEdit ? 'Edit Endpoint' : 'Add Endpoint'}</DialogTitle>
              <DialogDescription className="mt-0.5">
                {isEdit ? 'Update connection settings and credentials.' : 'Configure a new integration endpoint for a trading partner.'}
              </DialogDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Basic info */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="text-xs text-[var(--text-secondary)] mb-1 block">Endpoint Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Walmart AS2 Inbound"
                className="bg-[var(--bg-elevated)]"
              />
            </div>
            <div>
              <Label className="text-xs text-[var(--text-secondary)] mb-1 block">Partner *</Label>
              <Select value={form.partner_id} onValueChange={(v) => setForm((f) => ({ ...f, partner_id: v }))}>
                <SelectTrigger className="bg-[var(--bg-elevated)]">
                  <SelectValue placeholder="Select partner" />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.partner_id || String(p.id)}>
                      {p.business_name || p.partner_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-[var(--text-secondary)] mb-1 block">Protocol *</Label>
              <Select value={form.protocol} onValueChange={(v) => setForm((f) => ({ ...f, protocol: v, config: {} }))}>
                <SelectTrigger className="bg-[var(--bg-elevated)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROTOCOLS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-[var(--text-secondary)] mb-1 block">Direction</Label>
              <Select value={form.direction} onValueChange={(v) => setForm((f) => ({ ...f, direction: v }))}>
                <SelectTrigger className="bg-[var(--bg-elevated)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Inbound">Inbound</SelectItem>
                  <SelectItem value="Outbound">Outbound</SelectItem>
                  <SelectItem value="Both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-[var(--text-secondary)] mb-1 block">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="bg-[var(--bg-elevated)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                  <SelectItem value="Error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Protocol-specific config */}
          {sections.map((section) => (
            <ConfigSection
              key={section}
              section={section}
              fields={fields.filter((f) => f.section === section)}
              config={form.config}
              onChange={setConfig}
            />
          ))}
        </div>

        <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-3 flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Endpoint'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const Endpoints = () => {
  const [endpoints, setEndpoints] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProtocol, setFilterProtocol] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState(null);
  const [deletingEndpoint, setDeletingEndpoint] = useState(null);
  const [testingIds, setTestingIds] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eps, ps] = await Promise.all([
        endpointsService.list(),
        partnersService.getAll({ limit: 500 }),
      ]);
      setEndpoints(eps);
      setPartners(ps);
    } catch (e) {
      toast.error('Failed to load endpoints');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const partnerMap = Object.fromEntries(
    partners.map((p) => [p.partner_id || String(p.id), p.business_name || p.partner_name])
  );

  const filtered = endpoints.filter((e) => {
    const name = (e.name + ' ' + (partnerMap[e.partner_id] || e.partner_id)).toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (filterProtocol !== 'all' && e.protocol !== filterProtocol) return false;
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    return true;
  });

  const stats = {
    total: endpoints.length,
    active: endpoints.filter((e) => e.status === 'Active').length,
    error: endpoints.filter((e) => e.status === 'Error').length,
    inactive: endpoints.filter((e) => e.status === 'Inactive').length,
  };

  const handleSave = async (form) => {
    if (form.id) {
      const updated = await endpointsService.update(form.id, form);
      setEndpoints((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      toast.success('Endpoint updated');
    } else {
      const created = await endpointsService.create(form);
      setEndpoints((prev) => [created, ...prev]);
      toast.success('Endpoint created');
    }
  };

  const handleDelete = async () => {
    if (!deletingEndpoint) return;
    try {
      await endpointsService.delete(deletingEndpoint.id);
      setEndpoints((prev) => prev.filter((e) => e.id !== deletingEndpoint.id));
      toast.success('Endpoint deleted');
    } catch (e) {
      toast.error('Delete failed');
    } finally {
      setDeletingEndpoint(null);
    }
  };

  const handleTest = async (id) => {
    setTestingIds((s) => new Set([...s, id]));
    try {
      const res = await endpointsService.test(id);
      setEndpoints((prev) => prev.map((e) => (e.id === id ? res.endpoint : e)));
      if (res.ok) {
        toast.success(`Connection successful: ${res.message}`);
      } else {
        toast.error(`Connection failed: ${res.message}`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Test failed');
    } finally {
      setTestingIds((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Endpoints</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Technical integration connectors per trading partner — AS2, SFTP, FTP, HTTPS, VAN
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => { setEditingEndpoint(null); setModalOpen(true); }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Endpoint
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Endpoints', value: stats.total, color: 'var(--text-primary)' },
          { label: 'Active', value: stats.active, color: '#22c55e' },
          { label: 'Error', value: stats.error, color: '#ef4444' },
          { label: 'Inactive', value: stats.inactive, color: 'var(--text-muted)' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 flex items-center gap-3">
            <span className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</span>
            <span className="text-xs text-[var(--text-secondary)]">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search endpoints…"
            className="pl-9 bg-[var(--bg-surface)]"
          />
        </div>
        <Select value={filterProtocol} onValueChange={setFilterProtocol}>
          <SelectTrigger className="w-36 bg-[var(--bg-surface)]">
            <SelectValue placeholder="Protocol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Protocols</SelectItem>
            {PROTOCOLS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32 bg-[var(--bg-surface)]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
            <SelectItem value="Error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-[var(--text-muted)]">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">Loading endpoints…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-[var(--text-muted)]">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
            <Zap className="w-8 h-8" />
          </div>
          <div className="text-center">
            <p className="font-medium text-[var(--text-secondary)]">
              {search || filterProtocol !== 'all' || filterStatus !== 'all'
                ? 'No endpoints match your filters'
                : 'No endpoints configured yet'}
            </p>
            <p className="text-sm mt-1">
              {search || filterProtocol !== 'all' || filterStatus !== 'all'
                ? 'Try adjusting the filters above'
                : 'Add an endpoint to connect a trading partner'}
            </p>
          </div>
          {!search && filterProtocol === 'all' && filterStatus === 'all' && (
            <Button onClick={() => { setEditingEndpoint(null); setModalOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Add First Endpoint
            </Button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ep) => (
            <EndpointCard
              key={ep.id}
              endpoint={ep}
              partnerName={partnerMap[ep.partner_id]}
              testing={testingIds.has(ep.id)}
              onEdit={(e) => { setEditingEndpoint(e); setModalOpen(true); }}
              onDelete={setDeletingEndpoint}
              onTest={handleTest}
            />
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      <EndpointModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        endpoint={editingEndpoint}
        partners={partners}
        onSave={handleSave}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deletingEndpoint} onOpenChange={(o) => { if (!o) setDeletingEndpoint(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deletingEndpoint?.name}</strong> and all its configuration. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
