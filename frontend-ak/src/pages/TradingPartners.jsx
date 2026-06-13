import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Plus,
  Brain,
  Search,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  Loader2,
  Eye,
  Edit,
  Trash2,
  Power,
  LayoutList,
  LayoutGrid,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Avatar,
  AvatarFallback,
} from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import { AddTradingPartnerChat } from '@/components/AddTradingPartnerChat';
import { partnersService, wizardFormToPartnerPayload } from '@/services/partners';
import { exceptionsService } from '@/services/exceptions';
import { getSettings } from '@/services/settings';
import { documentsService } from '@/services/documents';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const VIEW_STORAGE_KEY = 'tradingPartnersViewMode';

const SORT_PRESETS = [
  'last_added',
  'alpha_asc',
  'alpha_desc',
  'last_activity',
  'edi_4010_first',
  'edi_5010_first',
];

const STATUS_FILTER_URL = new Set(['all', 'active', 'draft', 'inactive']);
const ROLE_FILTER_URL = new Set(['all', 'customer', 'supplier', 'both']);

function normalizeRoleForFilter(roles, role) {
  const all = (Array.isArray(roles) && roles.length > 0 ? roles : [role])
    .map((r) => String(r || '').trim().toLowerCase())
    .filter(Boolean);
  const hasCustomer = all.some((r) => r.includes('customer') || r.includes('buyer'));
  const hasSupplier = all.some((r) => r.includes('supplier') || r.includes('vendor'));
  if (hasCustomer && hasSupplier) return 'both';
  if (all.some((r) => r.includes('both'))) return 'both';
  if (hasCustomer) return 'customer';
  if (hasSupplier) return 'supplier';
  return '';
}

const ROLE_BADGE_CLASS = {
  customer: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  buyer: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  supplier: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  vendor: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  both: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40',
};

function RoleBadges({ roles, role, className = '' }) {
  const list = Array.isArray(roles) && roles.length > 0
    ? roles
    : role ? [role] : [];
  if (!list.length) return <span className="text-muted-foreground text-xs font-mono">—</span>;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {list.map((r) => {
        const key = String(r || '').trim().toLowerCase();
        const cls = ROLE_BADGE_CLASS[key] || 'bg-slate-500/15 text-[var(--text-primary)] border-slate-500/40';
        return (
          <span
            key={r}
            className={`inline-flex items-center text-[11px] font-mono px-1.5 py-0.5 rounded border ${cls}`}
          >
            {r}
          </span>
        );
      })}
    </div>
  );
}

function extractEdiVersionFromApi(partner) {
  const raw = partner?.edi_config?.version;
  if (raw && String(raw).match(/^(4010|5010|3060)$/)) return String(raw);
  const comb = `${partner?.edi_config?.standard || ''} ${raw || ''}`;
  const m = comb.match(/\b(4010|5010|3060)\b/);
  return m ? m[1] : '';
}

function ediVersionSortKey(version, preset) {
  const v = version || '';
  const order4010 = { 4010: 0, 5010: 1, 3060: 2 };
  const order5010 = { 5010: 0, 4010: 1, 3060: 2 };
  const table = preset === 'edi_5010_first' ? order5010 : order4010;
  return table[v] ?? 9;
}

function presetToSort(preset) {
  switch (preset) {
    case 'alpha_asc':
      return { field: 'name', dir: 'asc' };
    case 'alpha_desc':
      return { field: 'name', dir: 'desc' };
    case 'last_activity':
      return { field: 'lastActivity', dir: 'desc' };
    case 'edi_4010_first':
    case 'edi_5010_first':
      return { field: 'ediVersion', dir: 'asc' };
    case 'last_added':
    default:
      return { field: 'created', dir: 'desc' };
  }
}

function formatRelativeTime(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never';
  const now = Date.now();
  const diffMs = now - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.round(sec / 60);
  if (min < 60) return min === 1 ? '1 minute ago' : `${min} minutes ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return hr === 1 ? '1 hour ago' : `${hr} hours ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return day === 1 ? '1 day ago' : `${day} days ago`;
  const week = Math.round(day / 7);
  if (week < 5) return week === 1 ? '1 week ago' : `${week} weeks ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function listStatusBadgeClass(status) {
  switch (status) {
    case 'Active':
      return 'bg-primary/15 text-[var(--status-success-text)] border-emerald-500/40';
    case 'Draft':
      return 'bg-amber-500/15 text-[var(--status-warn-text)] border-amber-500/40';
    case 'Testing':
      return 'bg-primary/15 text-[var(--text-primary)] border-[var(--border)]';
    case 'Suspended':
      return 'bg-slate-500/20 text-[var(--text-secondary)] border-slate-500/40';
    default:
      return 'bg-slate-500/20 text-[var(--text-secondary)] border-slate-500/40';
  }
}

export const TradingPartners = () => {
  const { confirm } = useConfirmDialog();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [wizardInitialPrefill, setWizardInitialPrefill] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortPreset, setSortPreset] = useState('last_added');
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [partnerVoiceAssistantEnabled, setPartnerVoiceAssistantEnabled] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    try {
      const v = localStorage.getItem(VIEW_STORAGE_KEY);
      if (v === 'list' || v === 'card') return v;
    } catch {
      /* ignore */
    }
    return 'list';
  });
  const skipNextUrlWrite = useRef(false);

  useEffect(() => {
    loadPartners();
  }, []);

  useEffect(() => {
    const q = searchParams.get('search') || '';
    const st = searchParams.get('status') || 'all';
    const ro = searchParams.get('role') || 'all';
    const so = searchParams.get('sort') || 'last_added';
    skipNextUrlWrite.current = true;
    setSearchQuery(q);
    setStatusFilter(STATUS_FILTER_URL.has(st) ? st : 'all');
    setRoleFilter(ROLE_FILTER_URL.has(ro) ? ro : 'all');
    setSortPreset(SORT_PRESETS.includes(so) ? so : 'last_added');
  }, [searchParams]);

  useEffect(() => {
    if (skipNextUrlWrite.current) {
      skipNextUrlWrite.current = false;
      return;
    }
    const next = new URLSearchParams();
    if (searchQuery.trim()) next.set('search', searchQuery.trim());
    if (statusFilter !== 'all') next.set('status', statusFilter);
    if (roleFilter !== 'all') next.set('role', roleFilter);
    if (sortPreset !== 'last_added') next.set('sort', sortPreset);
    setSearchParams(next, { replace: true });
  }, [searchQuery, statusFilter, roleFilter, sortPreset, setSearchParams]);

  const VOICE_KEY = 'agent_eddy_partner_voice_assistant';

  const loadVoiceSettings = useCallback(async () => {
    try {
      const data = await getSettings();
      const apiVoice = Boolean(data.partner_voice_assistant_enabled);
      const stored = localStorage.getItem(VOICE_KEY);
      const storedVoice = stored === 'true';
      setPartnerVoiceAssistantEnabled(apiVoice || storedVoice);
    } catch {
      const stored = localStorage.getItem(VOICE_KEY);
      setPartnerVoiceAssistantEnabled(stored === 'true');
    }
  }, []);

  useEffect(() => {
    loadVoiceSettings();
  }, [loadVoiceSettings]);

  // Refresh voice settings when opening Add Partner (in case user just changed Settings)
  useEffect(() => {
    if (showAddPartner) loadVoiceSettings();
  }, [showAddPartner, loadVoiceSettings]);

  const loadPartners = async () => {
    try {
      setLoading(true);
      setError(null);
      // Load partners and exceptions in parallel (exceptions optional - don't block on failure)
      const [partnersResult, exceptionsResult, trainResult] = await Promise.allSettled([
        partnersService.getAll({ limit: 1000 }),
        exceptionsService.getAll({ limit: 1000, skip: 0 }),
        partnersService.getTrainingOverview(),
      ]);
      if (partnersResult.status === 'rejected') throw partnersResult.reason;
      const response = partnersResult.value;
      const allExceptions = exceptionsResult.status === 'fulfilled' ? exceptionsResult.value : [];
      const trainingOverview =
        trainResult.status === 'fulfilled' && trainResult.value && typeof trainResult.value === 'object'
          ? trainResult.value
          : {};
      const data = Array.isArray(response) ? response : [];
      
      let exceptionCountsMap = {};
      if (Array.isArray(allExceptions)) {
        exceptionCountsMap = allExceptions.reduce((acc, exc) => {
          const partnerCode = exc.partner_code;
          if (partnerCode) {
            acc[partnerCode] = (acc[partnerCode] || 0) + 1;
          }
          return acc;
        }, {});
      }
      
      const transformedPartners = data
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        .map((partner) => {
          const pid = String(partner._id || partner.id || '');
          const train = trainingOverview[pid];
          return {
            id: partner._id || partner.id,
            name: partner.business_name,
            code: partner.partner_code,
            role: partner.role,
            roles: Array.isArray(partner.roles) && partner.roles.length > 0
              ? partner.roles
              : [partner.role].filter(Boolean),
            status: partner.status,
            createdAt: partner.created_at || partner.createdAt || null,
            ediVersion: extractEdiVersionFromApi(partner),
            ediStandard:
              partner.edi_config?.standard && partner.edi_config?.version
                ? `${partner.edi_config.standard} ${partner.edi_config.version}`
                : 'Not configured',
            documents: partner.document_agreements?.map((da) => da.transaction_set) || [],
            updatedAt: partner.updated_at || null,
            lastActivity: partner.updated_at
              ? new Date(partner.updated_at).toLocaleDateString()
              : 'Never',
            exceptionCount: exceptionCountsMap[partner.partner_code] || 0,
            aiTrained: Boolean(train?.trained),
            trainingFileCount: train?.files_count ?? 0,
          };
        });
      setPartners(transformedPartners);
    } catch (err) {
      console.error('Error loading partners:', err);
      const errorMessage = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to load partners';
      setError(errorMessage);
      toast.error(`Failed to load trading partners: ${errorMessage}`);
      // Fallback to empty array
      setPartners([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (partner) => {
    try {
      const newStatus = partner.status === 'Active' ? 'Suspended' : 'Active';
      await partnersService.update(partner.id, { status: newStatus });
      toast.success(`Partner ${newStatus === 'Active' ? 'activated' : 'suspended'} successfully`);
      await loadPartners();
    } catch (err) {
      console.error('Error updating partner status:', err);
      toast.error('Failed to update partner status');
    }
  };

  const handleDeletePartner = async (partner) => {
    const confirmed = await confirm({
      title: 'Delete trading partner',
      description: `Are you sure you want to delete ${partner.name}? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!confirmed) {
      return;
    }
    try {
      await partnersService.delete(partner.id);
      toast.success('Partner deleted successfully');
      await loadPartners();
    } catch (err) {
      console.error('Error deleting partner:', err);
      toast.error('Failed to delete partner');
    }
  };

  const handlePartnerCreated = async (partnerData) => {
    try {
      const draftId = partnerData._savedPartnerId ? String(partnerData._savedPartnerId) : null;
      const payload = wizardFormToPartnerPayload(partnerData);
      const apiData = Object.fromEntries(
        Object.entries(payload).filter(([, v]) => v !== undefined)
      );

      if (!apiData.business_name?.trim() || !apiData.partner_code?.trim()) {
        toast.error('Business name and partner code are required.');
        return { success: false };
      }

    let createdPartnerId = draftId;
    if (draftId) {
      await partnersService.update(draftId, apiData);
      toast.success('Trading partner updated successfully!');
    } else {
      const created = await partnersService.create(apiData);
      createdPartnerId = String(created.id || created._id || '');
      const displayName = (apiData.business_name || apiData.partner_code || 'Partner').trim();
      toast.success(`Partner ${displayName} created successfully`);
    }
    await loadPartners();

    const pendingRaw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('edi_pending_upload_retry') : null;
      if (pendingRaw) {
        try {
          sessionStorage.removeItem('edi_pending_upload_retry');
          const { dataUrl, fileName, fileType, role } = JSON.parse(pendingRaw);
          const blob = await fetch(dataUrl).then((r) => r.blob());
          const file = new File([blob], fileName, {
            type: fileType || blob.type || 'application/octet-stream',
          });
          const formData = new FormData();
          formData.append('file', file);
          if (role) formData.append('role', role);
          await documentsService.uploadFile(formData);
          toast.success('Original file uploaded successfully.');
          navigate('/');
        } catch (retryErr) {
          console.error(retryErr);
          toast.error(
            'Partner saved, but automatic re-upload failed. Upload the file again from the dashboard.',
          );
        }
      }

      return { success: true, partnerId: createdPartnerId };
    } catch (err) {
      console.error('Error saving partner:', err);
      let detail = err.response?.data?.detail ?? err.message;
      if (Array.isArray(detail)) {
        detail = detail.map((e) => e.msg || `${e.loc?.join('.')}: ${e.msg}`).join('; ');
      } else if (typeof detail === 'object' && detail !== null) {
        detail = JSON.stringify(detail);
      }
      toast.error(`Failed to save trading partner: ${String(detail)}`);
      return { success: false, error: String(detail) };
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      Active: { variant: 'success', icon: CheckCircle2 },
      Testing: { variant: 'warning', icon: Clock },
      Draft: { variant: 'secondary', icon: AlertCircle },
      Suspended: { variant: 'error', icon: XCircle },
    };
    return variants[status] || variants.Draft;
  };

  useEffect(() => {
    const st = location.state;
    if (!st?.openPartnerWizard) return;
    setWizardInitialPrefill(st.wizardPrefill || null);
    setShowAddPartner(true);
    navigate(`${location.pathname}${location.search || ''}`, { replace: true, state: {} });
  }, [location.state, location.pathname, location.search, navigate]);

  const persistViewMode = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const filteredPartners = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return partners.filter((partner) => {
      const matchesSearch =
        !q ||
        (partner.name || '').toLowerCase().includes(q) ||
        (partner.code || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (statusFilter === 'active' && partner.status !== 'Active') return false;
      if (statusFilter === 'draft' && partner.status !== 'Draft') return false;
      if (
        statusFilter === 'inactive' &&
        !['Suspended', 'Testing'].includes(partner.status || '')
      ) {
        return false;
      }

      if (roleFilter !== 'all') {
        const pr = normalizeRoleForFilter(partner.roles, partner.role);
        if (pr !== roleFilter) return false;
      }

      return true;
    });
  }, [partners, searchQuery, statusFilter, roleFilter]);

  const { sortField, sortDir } = useMemo(() => presetToSort(sortPreset), [sortPreset]);

  const setSortFromHeader = (field) => {
    if (field === 'name') {
      setSortPreset((prev) => (prev === 'alpha_asc' ? 'alpha_desc' : 'alpha_asc'));
    } else if (field === 'lastActivity') {
      setSortPreset('last_activity');
    }
  };

  const sortedPartners = useMemo(() => {
    const list = [...filteredPartners];
    const { field, dir } = presetToSort(sortPreset);
    const d = dir === 'asc' ? 1 : -1;

    list.sort((a, b) => {
      if (field === 'ediVersion') {
        const ak = ediVersionSortKey(a.ediVersion, sortPreset);
        const bk = ediVersionSortKey(b.ediVersion, sortPreset);
        if (ak !== bk) return ak - bk;
        const an = (a.name || '').toLowerCase();
        const bn = (b.name || '').toLowerCase();
        return an < bn ? -1 : an > bn ? 1 : 0;
      }
      if (field === 'created') {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return at < bt ? -d : at > bt ? d : 0;
      }
      if (field === 'name') {
        const an = (a.name || '').toLowerCase();
        const bn = (b.name || '').toLowerCase();
        if (an === bn) return 0;
        return an < bn ? -d : d;
      }
      if (field === 'lastActivity') {
        const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return at < bt ? -d : at > bt ? d : 0;
      }
      return 0;
    });
    return list;
  }, [filteredPartners, sortPreset]);

  const filtersNonDefault =
    Boolean(searchQuery.trim()) ||
    statusFilter !== 'all' ||
    roleFilter !== 'all' ||
    sortPreset !== 'last_added';

  const clearAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setRoleFilter('all');
    setSortPreset('last_added');
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const statusFilterDotClass = (v) => {
    if (v === 'active') return 'bg-emerald-400';
    if (v === 'draft') return 'bg-amber-400';
    if (v === 'inactive') return 'bg-slate-400';
    return '';
  };

  const roleFilterDotClass = (v) => {
    if (v === 'customer') return 'bg-sky-400';
    if (v === 'supplier') return 'bg-violet-400';
    if (v === 'both') return 'bg-fuchsia-400';
    return '';
  };

  const SortHeader = ({ field, label, className = '' }) => {
    const active = sortField === field;
    const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => setSortFromHeader(field)}
        className={`inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors ${className}`}
      >
        {label}
        <Icon className="w-3.5 h-3.5 opacity-80" />
      </button>
    );
  };

  const PartnerRowActions = ({ partner }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/partners/${partner.id}`);
          }}
        >
          <Eye className="w-4 h-4 mr-2" />
          View Details
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            toast.info('Edit functionality coming soon');
          }}
        >
          <Edit className="w-4 h-4 mr-2" />
          Edit Partner
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            handleToggleStatus(partner);
          }}
        >
          <Power className="w-4 h-4 mr-2" />
          {partner.status === 'Active' ? 'Deactivate' : 'Activate'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            handleDeletePartner(partner);
          }}
          className="text-red-600 focus:text-red-600"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Partner
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--text-primary)]" />
          <p className="text-[var(--text-primary)] font-mono">Loading trading partners...</p>
        </div>
      </div>
    );
  }

  if (error && partners.length === 0) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-[var(--status-error-text)]" />
            <p className="text-red-300 font-mono mb-4">Error loading partners: {error}</p>
            <Button onClick={loadPartners} variant="outline">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Trading Partners</h1>
          <p className="text-muted-foreground mt-1">
            Manage your EDI trading partner relationships and configurations
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            className="flex rounded-lg border border-border overflow-hidden bg-muted/30"
            role="group"
            aria-label="View layout"
          >
            <Button
              type="button"
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className={`rounded-none gap-1.5 font-mono text-xs ${viewMode === 'list' ? 'shadow-none' : ''}`}
              onClick={() => persistViewMode('list')}
              aria-pressed={viewMode === 'list'}
            >
              <LayoutList className="w-4 h-4" />
              List
            </Button>
            <Button
              type="button"
              variant={viewMode === 'card' ? 'default' : 'ghost'}
              size="sm"
              className={`rounded-none gap-1.5 font-mono text-xs border-l border-border ${viewMode === 'card' ? 'shadow-none' : ''}`}
              onClick={() => persistViewMode('card')}
              aria-pressed={viewMode === 'card'}
            >
              <LayoutGrid className="w-4 h-4" />
              Card
            </Button>
          </div>
          <Button onClick={() => setShowAddPartner(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Trading Partner
          </Button>
        </div>
      </div>

      {/* Search, filters, sort (Inbound-style controls) */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_auto_auto_auto_auto_auto] xl:items-end">
            <div className="space-y-2 min-w-0">
              <label className="text-xs font-medium text-muted-foreground">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search partners by name or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full">
                  <span className="flex items-center gap-2 min-w-0">
                    {statusFilter !== 'all' ? (
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${statusFilterDotClass(statusFilter)}`}
                        aria-hidden
                      />
                    ) : null}
                    <SelectValue placeholder="All Statuses" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Active
                    </span>
                  </SelectItem>
                  <SelectItem value="draft">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      Draft
                    </span>
                  </SelectItem>
                  <SelectItem value="inactive">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-slate-400" />
                      Inactive
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full">
                  <span className="flex items-center gap-2 min-w-0">
                    {roleFilter !== 'all' ? (
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${roleFilterDotClass(roleFilter)}`}
                        aria-hidden
                      />
                    ) : null}
                    <SelectValue placeholder="All Roles" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="customer">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-sky-400" />
                      Customer
                    </span>
                  </SelectItem>
                  <SelectItem value="supplier">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-violet-400" />
                      Supplier
                    </span>
                  </SelectItem>
                  <SelectItem value="both">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-fuchsia-400" />
                      Both
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground">Sort by</label>
              <Select value={sortPreset} onValueChange={setSortPreset}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_added">Last Added</SelectItem>
                  <SelectItem value="alpha_asc">Alphabetical A → Z</SelectItem>
                  <SelectItem value="alpha_desc">Alphabetical Z → A</SelectItem>
                  <SelectItem value="last_activity">Last Activity</SelectItem>
                  <SelectItem value="edi_4010_first">EDI Standard (4010 first)</SelectItem>
                  <SelectItem value="edi_5010_first">EDI Standard (5010 first)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-[120px] pb-0 xl:pb-0">
              <label className="text-xs font-medium text-transparent select-none">Clear</label>
              {filtersNonDefault ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground hover:text-foreground"
                  onClick={clearAllFilters}
                >
                  <X className="w-4 h-4 mr-1" />
                  Clear Filters
                </Button>
              ) : (
                <div className="h-9" aria-hidden />
              )}
            </div>
          </div>

          {(statusFilter !== 'all' || roleFilter !== 'all') && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wide">
                Active filters
              </span>
              {statusFilter !== 'all' && (
                <Badge
                  variant="outline"
                  className="gap-1 pr-1 border-emerald-500/40 bg-primary/10 text-emerald-200 font-mono text-[11px]"
                >
                  Status:{' '}
                  {statusFilter === 'active'
                    ? 'Active'
                    : statusFilter === 'draft'
                      ? 'Draft'
                      : 'Inactive'}
                  <button
                    type="button"
                    className="ml-1 rounded p-0.5 hover:bg-transparent"
                    aria-label="Remove status filter"
                    onClick={() => setStatusFilter('all')}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {roleFilter !== 'all' && (
                <Badge
                  variant="outline"
                  className="gap-1 pr-1 border-violet-500/40 bg-violet-500/10 text-violet-200 font-mono text-[11px]"
                >
                  Role: {roleFilter.charAt(0).toUpperCase() + roleFilter.slice(1)}
                  <button
                    type="button"
                    className="ml-1 rounded p-0.5 hover:bg-violet-500/20"
                    aria-label="Remove role filter"
                    onClick={() => setRoleFilter('all')}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Badge variant="secondary" className="font-mono">
              {filteredPartners.length} of {partners.length} Partners
            </Badge>
            <Badge variant="success">
              {filteredPartners.filter((p) => p.status === 'Active').length} Active
              {filtersNonDefault && (
                <span className="ml-1 opacity-90">in view</span>
              )}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* List view */}
      {viewMode === 'list' && filteredPartners.length > 0 && (
        <Card className="border-border shadow-none overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[920px]">
                <thead>
                  <tr className="bg-muted/50 border-b border-border text-left">
                    <th className="px-4 py-3 w-[52px]" aria-label="Logo" />
                    <th className="px-4 py-3">
                      <SortHeader field="name" label="Partner name" />
                    </th>
                    <th className="px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Code
                    </th>
                    <th className="px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Role
                    </th>
                    <th className="px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      EDI standard
                    </th>
                    <th className="px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Documents
                    </th>
                    <th className="px-4 py-3">
                      <SortHeader field="lastActivity" label="Last activity" />
                    </th>
                    <th className="px-4 py-3 w-[56px] text-right font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPartners.map((partner, idx) => {
                    const initials = (partner.name || 'NA').trim().slice(0, 2).toUpperCase() || 'NA';
                    const docs = partner.documents || [];
                    const visibleDocs = docs.slice(0, 4);
                    const more = docs.length - visibleDocs.length;
                    const fullDate = partner.updatedAt
                      ? new Date(partner.updatedAt).toLocaleString('en-US', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : undefined;
                    return (
                      <tr
                        key={partner.id}
                        onClick={() => navigate(`/partners/${partner.id}`)}
                        className={`border-b border-border cursor-pointer transition-colors hover:bg-muted/35 ${
                          idx % 2 === 1 ? 'bg-muted/10' : ''
                        }`}
                      >
                        <td className="px-4 py-3 align-middle">
                          <Avatar className="w-9 h-9">
                            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                        </td>
                        <td className="px-4 py-3 align-middle font-medium text-foreground">
                          <span className="inline-flex items-center gap-2 min-w-0">
                            <span className="hover:underline truncate">{partner.name}</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                  aria-label="AI training status"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Brain
                                    className={`w-4 h-4 ${partner.aiTrained ? 'text-[var(--status-success-text)]' : 'text-[var(--text-muted)]'}`}
                                  />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                {partner.aiTrained
                                  ? `AI trained on ${partner.trainingFileCount} historical file(s)`
                                  : 'No training data uploaded yet'}
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <Badge variant="outline" className="font-mono text-[11px]">
                            {partner.code || '—'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <Badge
                            variant="outline"
                            className={`border text-[11px] font-mono ${listStatusBadgeClass(partner.status)}`}
                          >
                            {partner.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <RoleBadges roles={partner.roles} role={partner.role} />
                        </td>
                        <td className="px-4 py-3 align-middle font-mono text-xs text-muted-foreground">
                          {partner.ediStandard}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {docs.length === 0 ? (
                              <span className="text-muted-foreground text-xs font-mono">None</span>
                            ) : (
                              <>
                                {visibleDocs.map((doc) => (
                                  <Badge key={doc} variant="secondary" className="text-[10px] font-mono px-1.5">
                                    {doc}
                                  </Badge>
                                ))}
                                {more > 0 && (
                                  <Badge variant="outline" className="text-[10px] font-mono px-1.5">
                                    +{more} more
                                  </Badge>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td
                          className="px-4 py-3 align-middle text-xs text-muted-foreground whitespace-nowrap font-mono"
                          title={fullDate}
                        >
                          {formatRelativeTime(partner.updatedAt)}
                        </td>
                        <td className="px-4 py-3 align-middle text-right" onClick={(e) => e.stopPropagation()}>
                          <PartnerRowActions partner={partner} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Card grid */}
      {viewMode === 'card' && filteredPartners.length > 0 && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedPartners.map((partner) => {
          const statusInfo = getStatusBadge(partner.status);
          const StatusIcon = statusInfo.icon;

          return (
            <Card 
              key={partner.id} 
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(`/partners/${partner.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
                        {(partner.name || 'NA').trim().substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <span className="truncate">{partner.name}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex shrink-0" onClick={(e) => e.stopPropagation()}>
                              <Brain
                                className={`w-4 h-4 ${partner.aiTrained ? 'text-[var(--status-success-text)]' : 'text-[var(--text-muted)]'}`}
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            {partner.aiTrained
                              ? `AI trained on ${partner.trainingFileCount} historical file(s)`
                              : 'No training data uploaded yet'}
                          </TooltipContent>
                        </Tooltip>
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        Code: {partner.code}
                      </CardDescription>
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <PartnerRowActions partner={partner} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant={statusInfo.variant} className="gap-1.5">
                    <StatusIcon className="w-3 h-3" />
                    {partner.status}
                  </Badge>
                  <RoleBadges roles={partner.roles} role={partner.role} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">EDI Standard:</span>
                    <span className="font-medium">{partner.ediStandard}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Documents:</span>
                    <div className="flex gap-1">
                      {partner.documents.length > 0 ? (
                        partner.documents.map((doc) => (
                          <Badge key={doc} variant="secondary" className="text-xs">
                            {doc}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">None</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Last Activity:</span>
                    <span className="font-medium">{partner.lastActivity}</span>
                  </div>
                </div>

                {partner.exceptionCount > 0 && (
                  <div className="pt-2 border-t border-border">
                    <Badge variant="error" className="gap-1.5">
                      <AlertCircle className="w-3 h-3" />
                      {partner.exceptionCount} Exception{partner.exceptionCount !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      )}

      {filteredPartners.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {partners.length === 0
                ? 'No trading partners yet.'
                : 'No partners match your search or filters.'}
            </p>
            {partners.length === 0 ? (
              <Button onClick={() => setShowAddPartner(true)} className="mt-4" variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Trading Partner
              </Button>
            ) : filtersNonDefault ? (
              <Button onClick={clearAllFilters} className="mt-4" variant="outline">
                <X className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Add Trading Partner — same chat UI; voice listen/speak only when Partner Voice Assistant is ON */}
      {showAddPartner && (
        <AddTradingPartnerChat
          open={showAddPartner}
          onClose={() => {
            setShowAddPartner(false);
            setWizardInitialPrefill(null);
          }}
          onComplete={handlePartnerCreated}
          voiceInputEnabled={partnerVoiceAssistantEnabled}
          voiceOutputEnabled={partnerVoiceAssistantEnabled}
          initialFormPrefill={wizardInitialPrefill}
        />
      )}
    </div>
    </TooltipProvider>
  );
};
