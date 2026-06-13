import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { partnersService, wizardFormToPartnerPayload, flattenTransportConfig } from '@/services/partners';
import { documentsService } from '@/services/documents';
import { analyticsService } from '@/services/analytics';
import { AddTradingPartnerWizard } from '@/components/AddTradingPartnerWizard';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Edit, 
  Settings, 
  FileText, 
  Server, 
  CheckCircle2, 
  AlertTriangle,
  AlertCircle,
  Clock,
  XCircle,
  Database,
  Globe,
  Brain,
  Sparkles,
  Upload,
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Eye,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const DOC_NAMES = { '850': 'Purchase Order', '810': 'Invoice', '856': 'Advance Ship Notice', '997': 'Functional Acknowledgment' };
/** Rolling window for partner header KPIs (matches analytics partner-performance). */
const PARTNER_KPI_WINDOW_DAYS = 365;

function formatPartnerProcMs(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return '—';
  const n = Number(ms);
  if (n <= 0) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

const MAX_TRAINING_EDI_FILES = 500;
const MAX_TRAINING_ZIP_BYTES = 50 * 1024 * 1024;

const DEFAULT_FORMAT_CONFIG = {
  inbound_formats: ['EDI_X12', 'EDIFACT', 'JSON', 'XML', 'CSV'],
  outbound_format: 'EDI_X12',
  edi_standard: '005010',
  output_json_schema: 'generic',
  output_xml_schema: 'custom',
};

const INBOUND_FORMAT_OPTIONS = [
  { value: 'EDI_X12', label: 'EDI X12' },
  { value: 'EDIFACT', label: 'EDIFACT' },
  { value: 'JSON', label: 'JSON' },
  { value: 'XML', label: 'XML' },
  { value: 'CSV', label: 'CSV' },
];

function mergeFormatConfig(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FORMAT_CONFIG };
  return {
    ...DEFAULT_FORMAT_CONFIG,
    ...raw,
    inbound_formats:
      Array.isArray(raw.inbound_formats) && raw.inbound_formats.length > 0
        ? raw.inbound_formats.map(String)
        : [...DEFAULT_FORMAT_CONFIG.inbound_formats],
  };
}

const mapApiPartnerToUI = (api) => {
  if (!api) return null;
  const bc = api.business_contact;
  const tc = api.technical_contact;
  const edi = api.edi_config;
  const erp = api.erp_context;
  const docs = api.document_agreements || [];
  const transport = api.transport_config;
  const flatT = flattenTransportConfig(transport);
  return {
    id: api._id || api.id,
    name: api.business_name || '',
    code: api.partner_code || '',
    role: api.role || 'Both',
    roles: Array.isArray(api.roles) && api.roles.length > 0
      ? api.roles
      : [api.role || 'Both'],
    status: api.status || 'Draft',
    industry: api.industry || null,
    country: api.country || null,
    timezone: api.timezone || null,
    businessContact: bc ? { name: bc.name || '', email: bc.email || '', phone: bc.phone || '' } : { name: '', email: '', phone: '' },
    technicalContact: tc ? { name: tc.name || '', email: tc.email || '', phone: tc.phone || '' } : { name: '', email: '', phone: '' },
    ediProfile: edi ? {
      standard: edi.standard || 'X12',
      version: edi.version || '5010',
      functionalGroups: edi.functional_group ? [edi.functional_group] : [],
      characterSet: edi.character_set || 'UTF-8',
      delimiters: edi.delimiters || { element: '*', segment: '~', subElement: '>' },
      isaSenderId: edi.isa_sender_id || '',
      isaReceiverId: edi.isa_receiver_id || '',
      gsIds: edi.gs_ids && (edi.gs_ids.sender || edi.gs_ids.receiver)
        ? { sender: edi.gs_ids.sender || '', receiver: edi.gs_ids.receiver || '' }
        : { sender: edi.gs_sender_id || edi.gs_sender || '', receiver: edi.gs_receiver_id || edi.gs_receiver || '' },
    } : { standard: 'X12', version: '5010', functionalGroups: [], characterSet: 'UTF-8', delimiters: { element: '*', segment: '~', subElement: '>' }, isaSenderId: '', isaReceiverId: '', gsIds: { sender: '', receiver: '' } },
    erpContext: erp ? {
      partnerERP: {
        system: erp.backend_system || '',
        version: erp.version || '',
        hasCustomizations: !!(erp.customizations && erp.customizations.length > 0),
        notes: erp.notes || '',
      },
      targetSystem: { system: erp.backend_system || '', integrationMethod: 'API', dataOwner: '' },
    } : { partnerERP: { system: '', version: '', hasCustomizations: false, notes: '' }, targetSystem: { system: '', integrationMethod: '', dataOwner: '' } },
    documents: docs.map((d, i) => ({
      id: `doc${i}`,
      transactionSet: d.transaction_set || '',
      name: (d.transaction_set && DOC_NAMES[d.transaction_set]) || `Transaction ${d.transaction_set || '—'}`,
      direction: d.direction || 'Inbound',
      frequency: d.frequency || '—',
      acknowledgmentRequired: d.acknowledgment_required !== false,
      sla: d.sla || { deliveryTime: '—', retryRules: '' },
      status: 'Active',
    })),
    transport: transport ? {
      type: flatT.type || 'SFTP',
      config: {
        host: flatT.host || '—',
        port: flatT.port || '22',
        username: flatT.username || '—',
        path: flatT.path || '/',
        encryption: flatT.encryption,
      },
      schedule: flatT.schedule || 'event-driven',
      autoRetry: true,
    } : { type: '—', config: { host: '—', port: '—', username: '—', path: '—', encryption: false }, schedule: '—', autoRetry: false },
    stats: { totalTransactions: 0, successRate: 0, avgProcessingTime: '—', lastTransaction: '—', exceptions: 0 },
    recentActivity: [],
    exceptions: [],
  };
};

export const PartnerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [partnerData, setPartnerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editWizardOpen, setEditWizardOpen] = useState(false);
  const [ediIdsDraft, setEdiIdsDraft] = useState({
    isaSenderId: '',
    isaReceiverId: '',
    gsSender: '',
    gsReceiver: '',
  });
  const [savingEdiIds, setSavingEdiIds] = useState(false);
  const [formatDraft, setFormatDraft] = useState(() => ({ ...DEFAULT_FORMAT_CONFIG }));
  const [savingFormat, setSavingFormat] = useState(false);
  const [rolesDraft, setRolesDraft] = useState(null);   // null = not yet loaded
  const [savingRoles, setSavingRoles] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState(null);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [ediPickList, setEdiPickList] = useState([]);
  const [uploadingEdi, setUploadingEdi] = useState(false);
  const [uploadingMap, setUploadingMap] = useState(false);
  const [uploadingErp, setUploadingErp] = useState(false);
  const [lastMapImportCount, setLastMapImportCount] = useState(null);
  const [lastErpSummary, setLastErpSummary] = useState(null);
  const ediInputRef = useRef(null);
  const mapInputRef = useRef(null);
  const erpInputRef = useRef(null);
  const trainingTopRef = useRef(null);
  const ediTrainingSectionRef = useRef(null);
  const [fieldMappingsPayload, setFieldMappingsPayload] = useState(null);
  const [fieldMappingsLoading, setFieldMappingsLoading] = useState(false);
  const [partnerActivityDocs, setPartnerActivityDocs] = useState([]);
  const [partnerActivityLoading, setPartnerActivityLoading] = useState(false);
  const [partnerKpiStats, setPartnerKpiStats] = useState(null);

  useEffect(() => {
    if (!id) {
      setPartnerKpiStats(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await analyticsService.getPartnerPerformance(id, PARTNER_KPI_WINDOW_DAYS, null);
        if (cancelled) return;
        const perf = data?.partners?.[0];
        setPartnerKpiStats({
          totalTransactions: perf ? (perf.total_documents ?? perf.total_files ?? 0) : 0,
          successRate: perf ? Math.round(Number(perf.success_rate) || 0) : 0,
          avgProcessingTime: perf ? formatPartnerProcMs(perf.avg_processing_time_ms) : '—',
          exceptions: perf ? (perf.exceptions ?? 0) : 0,
        });
      } catch {
        if (!cancelled) setPartnerKpiStats(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (activeTab !== 'activity' || !id) return;
    let cancelled = false;
    (async () => {
      setPartnerActivityLoading(true);
      try {
        const rows = await documentsService.getAll({
          partner_id: id,
          limit: 500,
          skip: 0,
          summary: true,
          forceApi: true,
        });
        if (!cancelled) setPartnerActivityDocs(Array.isArray(rows) ? rows : []);
      } catch (err) {
        if (!cancelled) {
          setPartnerActivityDocs([]);
          toast.error(err.response?.data?.detail || err.message || 'Failed to load partner activity');
        }
      } finally {
        if (!cancelled) setPartnerActivityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, id]);

  useEffect(() => {
    if (activeTab !== 'field-mappings' || !id) return;
    let cancelled = false;
    (async () => {
      setFieldMappingsLoading(true);
      try {
        const data = await partnersService.getFieldMappings(id);
        if (!cancelled) setFieldMappingsPayload(data);
      } catch (err) {
        if (!cancelled) {
          setFieldMappingsPayload(null);
          toast.error(err.response?.data?.detail || err.message || 'Failed to load field mappings');
        }
      } finally {
        if (!cancelled) setFieldMappingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, id]);

  const loadTrainingStatus = useCallback(async () => {
    if (!id) return;
    setTrainingLoading(true);
    try {
      const s = await partnersService.getTrainingStatus(id);
      setTrainingStatus(s);
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || 'Failed to load training status');
    } finally {
      setTrainingLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === 'training' && id) {
      loadTrainingStatus();
    }
  }, [activeTab, id, loadTrainingStatus]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('Invalid partner ID');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const api = await partnersService.getById(id);
        if (!cancelled) {
          const mapped = mapApiPartnerToUI(api);
          setPartnerData(mapped);
          setEdiIdsDraft({
            isaSenderId: mapped.ediProfile?.isaSenderId || '',
            isaReceiverId: mapped.ediProfile?.isaReceiverId || '',
            gsSender: mapped.ediProfile?.gsIds?.sender || '',
            gsReceiver: mapped.ediProfile?.gsIds?.receiver || '',
          });
          setFormatDraft(mergeFormatConfig(api.edi_config?.format_config));
          setRolesDraft(
            Array.isArray(api.roles) && api.roles.length > 0
              ? api.roles
              : [api.role || 'Both'],
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || err.message || 'Failed to load partner');
          setPartnerData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const getStatusBadge = (status) => {
    const statusConfig = {
      'Active': { variant: 'secondary', icon: CheckCircle2, bg: 'bg-[var(--bg-subtle)]', text: 'text-green-700 dark:text-[var(--status-success-text)]' },
      'Testing': { variant: 'secondary', icon: Clock, bg: 'bg-yellow-500/10', text: 'text-yellow-700 dark:text-yellow-400' },
      'Draft': { variant: 'secondary', icon: AlertCircle, bg: 'bg-muted', text: 'text-muted-foreground' },
      'Suspended': { variant: 'secondary', icon: XCircle, bg: 'bg-red-500/10', text: 'text-red-700 dark:text-[var(--status-error-text)]' },
    };
    const config = statusConfig[status] || statusConfig['Draft'];
    const StatusIcon = config.icon;
    return (
      <Badge variant={config.variant} className={`${config.bg} ${config.text} border-0 gap-1.5`}>
        <StatusIcon className="w-3 h-3" />
        {status}
      </Badge>
    );
  };

  const handleViewDocument = (documentId) => {
    if (!documentId) return;
    navigate(`/document/${documentId}`);
  };

  const activityStatusBadgeClass = (status) => {
    const s = String(status || '');
    if (s === 'Completed' || s === 'Delivered' || s === 'Dispatched') {
      return 'bg-[var(--bg-subtle)] text-green-700 dark:text-[var(--status-success-text)] border-0';
    }
    if (s === 'Failed') {
      return 'bg-red-500/10 text-red-700 dark:text-[var(--status-error-text)] border-0';
    }
    if (s === 'Needs Review' || s === 'Received' || s === 'Validated') {
      return 'bg-amber-500/10 text-amber-700 dark:text-[var(--status-warn-text)] border-0';
    }
    if (s.includes('Processing') || s === 'Parsed' || s === 'Routing' || s === 'Delivering') {
      return 'bg-blue-500/10 text-blue-700 dark:text-[var(--status-info-text)] border-0';
    }
    return 'bg-slate-500/10 text-slate-700 dark:text-[var(--text-secondary)] border-0';
  };

  const formatActivityDocType = (dt) =>
    String(dt || '')
      .replace(/^X12\s*/i, '')
      .replace(/^DEFAULT\s*/i, '')
      .trim() || '—';

  const formatActivityTime = (doc) => {
    const t = doc.received_at || doc.created_at || doc.updated_at;
    if (!t) return '—';
    try {
      return new Date(t).toLocaleString();
    } catch {
      return '—';
    }
  };

  const closeEditWizard = useCallback(() => setEditWizardOpen(false), []);

  const handleSaveEdiControlIds = useCallback(async () => {
    if (!id) return;
    setSavingEdiIds(true);
    try {
      const api = await partnersService.getById(id);
      const prev = api.edi_config && typeof api.edi_config === 'object' ? { ...api.edi_config } : {};
      const payload = {
        edi_config: {
          ...prev,
          isa_sender_id: ediIdsDraft.isaSenderId.trim() || null,
          isa_receiver_id: ediIdsDraft.isaReceiverId.trim() || null,
          gs_ids: {
            sender: ediIdsDraft.gsSender.trim() || '',
            receiver: ediIdsDraft.gsReceiver.trim() || '',
          },
        },
      };
      await partnersService.update(id, payload);
      toast.success('EDI control IDs saved');
      const fresh = await partnersService.getById(id);
      const mapped = mapApiPartnerToUI(fresh);
      setPartnerData(mapped);
      setEdiIdsDraft({
        isaSenderId: mapped.ediProfile?.isaSenderId || '',
        isaReceiverId: mapped.ediProfile?.isaReceiverId || '',
        gsSender: mapped.ediProfile?.gsIds?.sender || '',
        gsReceiver: mapped.ediProfile?.gsIds?.receiver || '',
      });
    } catch (err) {
      let detail = err.response?.data?.detail ?? err.message ?? 'Save failed';
      if (typeof detail === 'object' && detail !== null) detail = JSON.stringify(detail);
      toast.error(String(detail));
    } finally {
      setSavingEdiIds(false);
    }
  }, [id, ediIdsDraft]);

  const handleSaveFormatConfig = useCallback(async () => {
    if (!id) return;
    setSavingFormat(true);
    try {
      const api = await partnersService.getById(id);
      const prev = api.edi_config && typeof api.edi_config === 'object' ? { ...api.edi_config } : {};
      const payload = {
        edi_config: {
          ...prev,
          format_config: {
            inbound_formats: formatDraft.inbound_formats,
            outbound_format: formatDraft.outbound_format,
            edi_standard: formatDraft.edi_standard,
            output_json_schema: formatDraft.output_json_schema,
            output_xml_schema: formatDraft.output_xml_schema,
          },
        },
      };
      await partnersService.update(id, payload);
      toast.success('Format settings saved');
      const fresh = await partnersService.getById(id);
      setFormatDraft(mergeFormatConfig(fresh.edi_config?.format_config));
      setPartnerData(mapApiPartnerToUI(fresh));
    } catch (err) {
      let detail = err.response?.data?.detail ?? err.message ?? 'Save failed';
      if (typeof detail === 'object' && detail !== null) detail = JSON.stringify(detail);
      toast.error(String(detail));
    } finally {
      setSavingFormat(false);
    }
  }, [id, formatDraft]);

  const handleSaveRoles = useCallback(async () => {
    if (!id) return;
    const clean = (rolesDraft || []).filter((r) => r && r.trim());
    if (!clean.length) { toast.error('Select at least one role'); return; }
    setSavingRoles(true);
    try {
      await partnersService.update(id, { roles: clean, role: clean[0] });
      toast.success('Roles saved');
      const fresh = await partnersService.getById(id);
      setPartnerData(mapApiPartnerToUI(fresh));
      setRolesDraft(
        Array.isArray(fresh.roles) && fresh.roles.length > 0 ? fresh.roles : [fresh.role || 'Both'],
      );
    } catch (err) {
      let detail = err.response?.data?.detail ?? err.message ?? 'Save failed';
      if (typeof detail === 'object' && detail !== null) detail = JSON.stringify(detail);
      toast.error(String(detail));
    } finally {
      setSavingRoles(false);
    }
  }, [id, rolesDraft]);

  const handleEditWizardComplete = useCallback(async (data) => {
    if (!id) return { success: false };
    try {
      const payload = wizardFormToPartnerPayload(data);
      const apiData = Object.fromEntries(
        Object.entries(payload).filter(([, v]) => v !== undefined)
      );
      await partnersService.update(id, apiData);
      toast.success('Trading partner updated');
      const api = await partnersService.getById(id);
      setPartnerData(mapApiPartnerToUI(api));
      setFormatDraft(mergeFormatConfig(api.edi_config?.format_config));
      setRolesDraft(
        Array.isArray(api.roles) && api.roles.length > 0
          ? api.roles
          : [api.role || 'Both'],
      );
      return { success: true };
    } catch (err) {
      let detail = err.response?.data?.detail ?? err.message ?? 'Update failed';
      if (Array.isArray(detail)) {
        detail = detail.map((e) => e?.msg || String(e)).join('; ');
      } else if (typeof detail === 'object' && detail !== null) {
        detail = JSON.stringify(detail);
      }
      toast.error(String(detail));
      return { success: false };
    }
  }, [id]);

  const appendEdiFiles = useCallback((fileList) => {
    setEdiPickList((prev) => {
      const next = [...prev];
      for (const f of fileList) {
        const n = (f.name || '').toLowerCase();
        if (!n.endsWith('.edi') && !n.endsWith('.x12') && !n.endsWith('.txt') && !n.endsWith('.zip')) {
          continue;
        }
        if (n.endsWith('.zip') && f.size > MAX_TRAINING_ZIP_BYTES) {
          toast.error(`${f.name} exceeds 50MB zip limit`);
          continue;
        }
        next.push(f);
      }
      if (next.length > MAX_TRAINING_EDI_FILES) {
        toast.error(`Maximum ${MAX_TRAINING_EDI_FILES} files per batch`);
        return next.slice(0, MAX_TRAINING_EDI_FILES);
      }
      return next;
    });
  }, []);

  const submitEdiTraining = async () => {
    if (!id || !ediPickList.length) return;
    setUploadingEdi(true);
    try {
      const batch = ediPickList.slice(0, MAX_TRAINING_EDI_FILES);
      await partnersService.uploadTrainingEdi(id, batch);
      toast.success('Historical EDI training data uploaded');
      setEdiPickList([]);
      await loadTrainingStatus();
    } catch (err) {
      const d = err.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : err.message || 'Upload failed');
    } finally {
      setUploadingEdi(false);
    }
  };

  const downloadMappingTemplate = () => {
    const csv = 'Source Field,Target Field,Doc Type,Notes\nExample_PO,BEG03,850,Purchase order number\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agent_eddy_mapping_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onMappingFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !id) return;
    setUploadingMap(true);
    try {
      const res = await partnersService.uploadTrainingMappings(id, f);
      const n = res.mapping_rules_created ?? res.rows_imported ?? 0;
      setLastMapImportCount(n);
      toast.success(`${n} mapping rules imported`);
      await loadTrainingStatus();
    } catch (err) {
      const d = err.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : err.message || 'Import failed');
    } finally {
      setUploadingMap(false);
    }
  };

  const onErpFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !id) return;
    setUploadingErp(true);
    try {
      const res = await partnersService.uploadTrainingErp(id, f);
      setLastErpSummary(res.summary_labels || null);
      toast.success('ERP export stored for training');
      await loadTrainingStatus();
    } catch (err) {
      const d = err.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : err.message || 'Import failed');
    } finally {
      setUploadingErp(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--text-primary)]" />
          <p className="text-[var(--text-primary)] font-mono">Loading partner...</p>
        </div>
      </div>
    );
  }

  if (error || !partnerData) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-[var(--status-error-text)]" />
            <p className="text-red-300 font-mono mb-4">{error || 'Partner not found'}</p>
            <Button onClick={() => navigate('/partners')} variant="outline">
              Back to Partners
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const headerStats = partnerKpiStats ? { ...partnerData.stats, ...partnerKpiStats } : partnerData.stats;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/partners')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-semibold">
                {partnerData.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold text-foreground">{partnerData.name}</h1>
              <p className="text-muted-foreground mt-1">
                Code: {partnerData.code}{partnerData.industry ? ` • ${partnerData.industry}` : ''}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {getStatusBadge(partnerData.status)}
          <Button
            type="button"
            variant="secondary"
            className="gap-2 font-medium border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
            onClick={() => setEditWizardOpen(true)}
          >
            <Edit className="w-4 h-4" />
            Edit Partner
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="gap-2 font-medium border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
            onClick={() => setActiveTab('edi')}
          >
            <Settings className="w-4 h-4" />
            Settings
          </Button>
        </div>
      </div>

      {/* Quick Stats — from GET /analytics/partner-performance?partner_id=… */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          Last {PARTNER_KPI_WINDOW_DAYS} days · Success = Completed or Processed documents
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Transactions</p>
                  <p className="text-2xl font-bold mt-1">{headerStats.totalTransactions.toLocaleString()}</p>
                </div>
                <Activity className="w-8 h-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold mt-1">{headerStats.successRate}%</p>
                </div>
                <CheckCircle2 className="w-8 h-8 text-success opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Processing</p>
                  <p className="text-2xl font-bold mt-1">{headerStats.avgProcessingTime}</p>
                </div>
                <Clock className="w-8 h-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Exceptions</p>
                  <p className="text-2xl font-bold mt-1">{headerStats.exceptions.toLocaleString()}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-warning opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="edi">EDI Profile</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="transport">Transport</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="training">Training Data</TabsTrigger>
          <TabsTrigger value="field-mappings">Field Mappings</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Business Information */}
            <Card>
              <CardHeader>
                <CardTitle>Business Information</CardTitle>
                <CardDescription>Partner business details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Legal Name</p>
                    <p className="font-medium">{partnerData.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Partner Code</p>
                    <p className="font-medium font-mono">{partnerData.code}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Role</p>
                    <div className="flex flex-wrap gap-1">
                      {(partnerData.roles || [partnerData.role]).map((r) => (
                        <Badge key={r} variant="outline" className="text-[11px]">{r}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Industry</p>
                    <p className="font-medium">{partnerData.industry}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Country</p>
                    <p className="font-medium">{partnerData.country}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Timezone</p>
                    <p className="font-medium">{partnerData.timezone}</p>
                  </div>
                </div>
                <Separator />

                {/* Inline role editor */}
                {rolesDraft !== null && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Edit Roles</p>
                    <p className="text-xs text-muted-foreground">
                      A partner can hold multiple roles simultaneously (e.g. Walmart as both Customer and Supplier).
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {['Customer', 'Supplier', 'Buyer', 'Vendor', 'Shipper', 'Carrier'].map((r) => (
                        <label key={r} className="flex items-center gap-2 cursor-pointer select-none">
                          <Checkbox
                            checked={(rolesDraft || []).includes(r)}
                            onCheckedChange={(checked) => {
                              setRolesDraft((prev) =>
                                checked
                                  ? [...(prev || []), r]
                                  : (prev || []).filter((x) => x !== r),
                              );
                            }}
                          />
                          <span className="text-sm">{r}</span>
                        </label>
                      ))}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingRoles || (rolesDraft || []).length === 0}
                      onClick={handleSaveRoles}
                    >
                      {savingRoles ? 'Saving…' : 'Save Roles'}
                    </Button>
                  </div>
                )}

                <Separator />
                <div>
                  <p className="text-sm font-medium mb-2">Business Contact</p>
                  <div className="space-y-1 text-sm">
                    <p>{partnerData.businessContact?.name || '—'}</p>
                    <p className="text-muted-foreground">{partnerData.businessContact?.email || '—'}</p>
                    <p className="text-muted-foreground">{partnerData.businessContact?.phone || '—'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Technical Contact</p>
                  <div className="space-y-1 text-sm">
                    <p>{partnerData.technicalContact?.name || '—'}</p>
                    <p className="text-muted-foreground">{partnerData.technicalContact?.email || '—'}</p>
                    <p className="text-muted-foreground">{partnerData.technicalContact?.phone || '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ERP & System Context */}
            <Card>
              <CardHeader>
                <CardTitle>ERP & System Context</CardTitle>
                <CardDescription>System integration details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Partner Backend System</p>
                  <div className="space-y-1">
                    <Badge variant="outline">{partnerData.erpContext?.partnerERP?.system || '—'}</Badge>
                    <p className="text-sm text-muted-foreground">
                      {partnerData.erpContext?.partnerERP?.version || '—'}
                    </p>
                    {partnerData.erpContext.partnerERP.hasCustomizations && (
                      <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-0 text-xs">Has Customizations</Badge>
                    )}
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-2">Target System</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{partnerData.erpContext?.targetSystem?.system || '—'}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Integration: {partnerData.erpContext?.targetSystem?.integrationMethod || '—'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Data Owner: {partnerData.erpContext?.targetSystem?.dataOwner || '—'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Document Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Document Agreements</CardTitle>
                <CardDescription>
                  {partnerData.documents?.length ? `${partnerData.documents.length} document type(s) configured` : 'No documents configured'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(partnerData.documents || []).map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="font-mono">{doc.transactionSet}</Badge>
                        <div>
                          <p className="text-sm font-medium">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.direction} • {doc.frequency}
                          </p>
                        </div>
                      </div>
                      <Badge 
                        variant="secondary" 
                        className={doc.status === 'Active' ? 'bg-[var(--bg-subtle)] text-green-700 dark:text-[var(--status-success-text)] border-0' : ''}
                      >
                        {doc.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Transport Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Transport Configuration</CardTitle>
                <CardDescription>File transfer settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">{partnerData.transport.type}</p>
                    <p className="text-sm text-muted-foreground">
                      {partnerData.transport.config.host}:{partnerData.transport.config.port}
                    </p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Schedule:</span>
                    <span className="font-medium">{partnerData.transport.schedule}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Auto Retry:</span>
                  <Badge 
                    variant="secondary"
                    className={partnerData.transport.autoRetry ? 'bg-[var(--bg-subtle)] text-green-700 dark:text-[var(--status-success-text)] border-0' : ''}
                  >
                    {partnerData.transport.autoRetry ? 'Enabled' : 'Disabled'}
                  </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* EDI Profile Tab */}
        <TabsContent value="edi" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>EDI Standard Configuration</CardTitle>
              <CardDescription>How this partner communicates using EDI</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">EDI Standard</p>
                  <p className="font-medium">{partnerData.ediProfile.standard}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Version</p>
                  <p className="font-medium">{partnerData.ediProfile.version}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Character Set</p>
                  <p className="font-medium">{partnerData.ediProfile.characterSet}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Functional Groups</p>
                  <div className="flex gap-1">
                    {partnerData.ediProfile.functionalGroups.map((group) => (
                      <Badge key={group} variant="outline">{group}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-3">Delimiters</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Element</p>
                    <p className="font-mono text-lg">{partnerData.ediProfile.delimiters.element}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Segment</p>
                    <p className="font-mono text-lg">{partnerData.ediProfile.delimiters.segment}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sub-Element</p>
                    <p className="font-mono text-lg">{partnerData.ediProfile.delimiters.subElement}</p>
                  </div>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-3">Control IDs</p>
                {!ediIdsDraft.isaSenderId.trim() && !ediIdsDraft.gsSender.trim() ? (
                  <Alert variant="default" className="mb-4 border-amber-500/50 bg-amber-500/5">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertTitle>No EDI sender IDs configured</AlertTitle>
                    <AlertDescription>
                      Matching will use Partner Code only until you set at least an ISA Sender ID or GS Sender ID (or upload a file so the system can auto-fill them).
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edi-isa-sender">ISA Sender ID</Label>
                    <Input
                      id="edi-isa-sender"
                      className="font-mono"
                      value={ediIdsDraft.isaSenderId}
                      onChange={(e) => setEdiIdsDraft((d) => ({ ...d, isaSenderId: e.target.value }))}
                      placeholder="e.g. AMAZ0N"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edi-isa-receiver">ISA Receiver ID</Label>
                    <Input
                      id="edi-isa-receiver"
                      className="font-mono"
                      value={ediIdsDraft.isaReceiverId}
                      onChange={(e) => setEdiIdsDraft((d) => ({ ...d, isaReceiverId: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edi-gs-sender">GS Sender ID</Label>
                    <Input
                      id="edi-gs-sender"
                      className="font-mono"
                      value={ediIdsDraft.gsSender}
                      onChange={(e) => setEdiIdsDraft((d) => ({ ...d, gsSender: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edi-gs-receiver">GS Receiver ID</Label>
                    <Input
                      id="edi-gs-receiver"
                      className="font-mono"
                      value={ediIdsDraft.gsReceiver}
                      onChange={(e) => setEdiIdsDraft((d) => ({ ...d, gsReceiver: e.target.value }))}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  className="mt-4"
                  disabled={savingEdiIds}
                  onClick={handleSaveEdiControlIds}
                >
                  {savingEdiIds ? 'Saving…' : 'Save EDI control IDs'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inbound and outbound formats</CardTitle>
              <CardDescription>
                Stage 1 accepts only the checked inbound types; stage 2 emits the selected outbound format (also used for manual generate on documents).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-sm font-medium mb-3">Accepted inbound formats</p>
                <div className="flex flex-col gap-3">
                  {INBOUND_FORMAT_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={(formatDraft.inbound_formats || []).includes(opt.value)}
                        onCheckedChange={(checked) => {
                          setFormatDraft((d) => {
                            const set = new Set(d.inbound_formats || []);
                            if (checked) set.add(opt.value);
                            else set.delete(opt.value);
                            const next = [...set];
                            return {
                              ...d,
                              inbound_formats: next.length ? next : [...DEFAULT_FORMAT_CONFIG.inbound_formats],
                            };
                          });
                        }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Outbound format</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    value={formatDraft.outbound_format}
                    onChange={(e) => setFormatDraft((d) => ({ ...d, outbound_format: e.target.value }))}
                  >
                    <option value="EDI_X12">EDI X12</option>
                    <option value="EDIFACT">EDIFACT</option>
                    <option value="JSON">JSON</option>
                    <option value="XML">XML</option>
                    <option value="CSV">CSV</option>
                  </select>
                </div>
                {(formatDraft.outbound_format === 'EDI_X12' || formatDraft.outbound_format === 'EDIFACT') && (
                  <div className="space-y-2">
                    <Label>EDI release (ISA)</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={formatDraft.edi_standard}
                      onChange={(e) => setFormatDraft((d) => ({ ...d, edi_standard: e.target.value }))}
                    >
                      <option value="004010">004010</option>
                      <option value="005010">005010</option>
                    </select>
                  </div>
                )}
              </div>
              {formatDraft.outbound_format === 'JSON' && (
                <div className="space-y-2">
                  <Label>JSON export schema</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formatDraft.output_json_schema}
                    onChange={(e) => setFormatDraft((d) => ({ ...d, output_json_schema: e.target.value }))}
                  >
                    <option value="generic">generic</option>
                    <option value="canonical">canonical (full)</option>
                    <option value="ORDERS05">ORDERS05</option>
                    <option value="INVOIC01">INVOIC01</option>
                    <option value="amazon_order">amazon_order</option>
                    <option value="oracle_po">oracle_po</option>
                  </select>
                </div>
              )}
              {formatDraft.outbound_format === 'XML' && (
                <div className="space-y-2">
                  <Label>XML schema flavor</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formatDraft.output_xml_schema}
                    onChange={(e) => setFormatDraft((d) => ({ ...d, output_xml_schema: e.target.value }))}
                  >
                    <option value="custom">custom</option>
                    <option value="cXML">cXML</option>
                    <option value="UBL">UBL</option>
                  </select>
                </div>
              )}
              <Button type="button" disabled={savingFormat} onClick={handleSaveFormatConfig}>
                {savingFormat ? 'Saving…' : 'Save format settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Agreements</CardTitle>
              <CardDescription>Configured document types and their settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(partnerData.documents || []).length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No document agreements configured</p>
                ) : (
                partnerData.documents.map((doc) => (
                  <Card key={doc.id} className="border-border">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="font-mono text-base px-3 py-1">
                            {doc.transactionSet}
                          </Badge>
                          <div>
                            <p className="font-semibold">{doc.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Transaction Set {doc.transactionSet}
                            </p>
                          </div>
                        </div>
                        <Badge 
                          variant="secondary"
                          className={doc.status === 'Active' ? 'bg-[var(--bg-subtle)] text-green-700 dark:text-[var(--status-success-text)] border-0' : ''}
                        >
                          {doc.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Direction</p>
                          <Badge variant={doc.direction === 'Inbound' ? 'default' : 'secondary'} className="gap-1">
                            {doc.direction === 'Inbound' ? (
                              <ArrowDownToLine className="w-3 h-3" />
                            ) : (
                              <ArrowUpFromLine className="w-3 h-3" />
                            )}
                            {doc.direction}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Frequency</p>
                          <p className="text-sm font-medium">{doc.frequency}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">ACK Required</p>
                          <Badge 
                            variant="secondary"
                            className={doc.acknowledgmentRequired ? 'bg-[var(--bg-subtle)] text-green-700 dark:text-[var(--status-success-text)] border-0' : ''}
                          >
                            {doc.acknowledgmentRequired ? 'Yes' : 'No'}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">SLA</p>
                          <p className="text-sm font-medium">{doc.sla?.deliveryTime || '—'}</p>
                        </div>
                      </div>
                      {doc.sla?.retryRules && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-xs text-muted-foreground">Retry Rules: {doc.sla.retryRules}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transport Tab */}
        <TabsContent value="transport" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transport Configuration</CardTitle>
              <CardDescription>File transfer connection details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Server className="w-6 h-6 text-primary" />
                <div>
                  <p className="font-semibold">{partnerData.transport.type}</p>
                  <p className="text-sm text-muted-foreground">Secure File Transfer Protocol</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Host / Server</p>
                  <p className="font-mono">{partnerData.transport.config.host}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Port</p>
                  <p className="font-mono">{partnerData.transport.config.port}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Username</p>
                  <p className="font-mono">{partnerData.transport.config.username}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Remote Path</p>
                  <p className="font-mono">{partnerData.transport.config.path}</p>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Encryption</span>
                  <Badge 
                    variant="secondary"
                    className={partnerData.transport.config.encryption ? 'bg-[var(--bg-subtle)] text-green-700 dark:text-[var(--status-success-text)] border-0' : ''}
                  >
                    {partnerData.transport.config.encryption ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Schedule</span>
                  <span className="text-sm font-medium">{partnerData.transport.schedule}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Auto Retry</span>
                  <Badge 
                    variant="secondary"
                    className={partnerData.transport.autoRetry ? 'bg-[var(--bg-subtle)] text-green-700 dark:text-[var(--status-success-text)] border-0' : ''}
                  >
                    {partnerData.transport.autoRetry ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest transactions with this partner</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">File ID</TableHead>
                    <TableHead className="font-semibold">Doc Type</TableHead>
                    <TableHead className="font-semibold">Direction</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Timestamp</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partnerActivityLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        <span className="inline-flex items-center gap-2 justify-center">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading transactions…
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : partnerActivityDocs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        No transactions for this partner yet. Upload or route documents with this partner assigned.
                      </TableCell>
                    </TableRow>
                  ) : (
                    partnerActivityDocs.map((doc) => {
                      const docId = doc.id || doc._id;
                      const displayRef = doc.file_name?.trim() || docId;
                      const dir = doc.effective_direction || doc.direction || 'Inbound';
                      const inbound = String(dir).toLowerCase() === 'inbound';
                      return (
                        <TableRow
                          key={docId}
                          className="hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => handleViewDocument(docId)}
                        >
                          <TableCell
                            className="font-mono text-sm font-medium text-primary hover:underline max-w-[220px]"
                            title={String(docId)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDocument(docId);
                            }}
                          >
                            <span className="block truncate">{displayRef}</span>
                            {doc.file_name?.trim() ? (
                              <span className="block text-[10px] text-muted-foreground font-normal truncate">
                                {docId}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {formatActivityDocType(doc.document_type)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={inbound ? 'default' : 'secondary'} className="gap-1">
                              {inbound ? (
                                <ArrowDownToLine className="w-3 h-3" />
                              ) : (
                                <ArrowUpFromLine className="w-3 h-3" />
                              )}
                              {inbound ? 'Inbound' : 'Outbound'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={activityStatusBadgeClass(doc.status)}>
                              {doc.status || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatActivityTime(doc)}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDocument(docId)}
                              className="hover:bg-primary hover:text-primary-foreground"
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Training Data */}
        <TabsContent value="training" className="space-y-6">
          {(() => {
            const ts = trainingStatus;
            const ediRows = (ts?.items || []).filter((i) => i.data_type === 'edi_files');
            const mapRows = (ts?.items || []).filter((i) => i.data_type === 'mapping_sheet');
            const latestMap = mapRows[0];
            const erpRows = (ts?.items || []).filter((i) => i.data_type === 'erp_export');
            const latestErp = erpRows[0];
            const serverTraining = ts?.status === 'training';
            const serverTrained = ts?.status === 'trained';
            const inFlight = uploadingEdi || uploadingMap || uploadingErp;
            const hasAnyData = (ts?.items?.length || 0) > 0;
            const progressPct = ts?.files_total
              ? Math.min(100, Math.round(((ts.files_analyzed || 0) / ts.files_total) * 100))
              : 0;
            const confPct = ts?.confidence_delta_pct ?? 0;
            const mapPreview = latestMap?.preview_rows || [];
            const erpLines = lastErpSummary || latestErp?.erp_summary || [];

            return (
              <>
                <div ref={trainingTopRef} className="space-y-2">
                  <Card className="border-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Brain className="w-5 h-5 text-primary" />
                        AI training status
                      </CardTitle>
                      <CardDescription>
                        Historical uploads improve mapping suggestions and confidence for this partner.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {trainingLoading && !ts ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" /> Loading status…
                        </div>
                      ) : null}

                      {!hasAnyData && !inFlight && (
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge variant="secondary" className="bg-slate-500/15 text-[var(--text-muted)] dark:text-[var(--text-primary)] border-slate-500/30">
                            Not Trained
                          </Badge>
                          <p className="text-sm text-muted-foreground">
                            Upload historical data to improve AI accuracy for this partner
                          </p>
                        </div>
                      )}

                      {(inFlight || serverTraining) && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="bg-transparent text-amber-800 dark:text-amber-200 border-amber-500/40 animate-pulse gap-1">
                              <Sparkles className="w-3 h-3" />
                              Training in Progress
                            </Badge>
                          </div>
                          <Progress value={inFlight ? 40 : progressPct || 15} className="h-2" />
                          <p className="text-xs text-muted-foreground font-mono">
                            {inFlight
                              ? 'Uploading and analyzing…'
                              : `Analyzing ${ts?.files_processing ?? 0} of ${ts?.files_total ?? 0} files`}
                          </p>
                        </div>
                      )}

                      {serverTrained && !inFlight && hasAnyData && (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <Badge className="bg-primary/15 text-emerald-700 dark:text-[var(--status-success-text)] border-emerald-500/40 gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              AI Trained
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              Last trained:{' '}
                              {ts.last_trained_at
                                ? new Date(ts.last_trained_at).toLocaleString()
                                : '—'}
                            </span>
                          </div>
                          <p className="text-sm font-mono text-muted-foreground">
                            {ts.files_analyzed ?? 0} artifact(s) · {ts.edi_files_learned ?? 0} EDI file(s) ·{' '}
                            {ts.mapping_rules_count ?? 0} mapping rules · {(ts.doc_types_found || []).length} doc types
                          </p>
                          <p className="text-sm text-emerald-700/90 dark:text-[var(--status-success-text)]">
                            Confidence improvement: +{confPct}% vs baseline (estimated from training volume)
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => ediTrainingSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
                          >
                            <Upload className="w-4 h-4" />
                            Re-train (upload more data)
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Historical EDI */}
                <Card ref={ediTrainingSectionRef}>
                  <CardHeader>
                    <CardTitle>Historical EDI Transactions</CardTitle>
                    <CardDescription>
                      Upload past EDI files from this partner. Agent Eddy will analyze them to learn your partner-specific
                      field mappings, document patterns, and business rules.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <input
                      ref={ediInputRef}
                      type="file"
                      multiple
                      accept=".edi,.x12,.txt,.zip"
                      className="hidden"
                      onChange={(e) => {
                        const fl = [...(e.target.files || [])];
                        e.target.value = '';
                        appendEdiFiles(fl);
                      }}
                    />
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') ediInputRef.current?.click();
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        appendEdiFiles([...(e.dataTransfer.files || [])]);
                      }}
                      onClick={() => ediInputRef.current?.click()}
                      className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                    >
                      <Upload className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm font-medium">Drag and drop or click to upload</p>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">
                        .edi, .x12, .txt, .zip (bulk) · max {MAX_TRAINING_EDI_FILES} files · zip ≤ 50MB
                      </p>
                      {ediPickList.length > 0 && (
                        <Badge className="mt-3 font-mono">{ediPickList.length} file(s) selected</Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" disabled={!ediPickList.length || uploadingEdi} onClick={submitEdiTraining}>
                        {uploadingEdi ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Upload & analyze
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEdiPickList([])} disabled={!ediPickList.length}>
                        Clear selection
                      </Button>
                    </div>

                    {ediRows.length > 0 && (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>File</TableHead>
                              <TableHead>Doc type</TableHead>
                              <TableHead>Segments</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ediRows.slice(0, 500).map((row) => (
                              <TableRow key={row.id}>
                                <TableCell className="font-mono text-xs max-w-[200px] truncate" title={row.file_name}>
                                  {row.file_name}
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {(row.doc_types_found || []).length ? (
                                      row.doc_types_found.map((d) => (
                                        <Badge key={d} variant="outline" className="text-[10px] font-mono">
                                          {d}
                                        </Badge>
                                      ))
                                    ) : (
                                      <span className="text-muted-foreground text-xs">—</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-xs">{row.segment_count ?? '—'}</TableCell>
                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                  {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                                </TableCell>
                                <TableCell>
                                  {row.status === 'processing' && (
                                    <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-200 border-0 animate-pulse text-[10px]">
                                      Analyzing
                                    </Badge>
                                  )}
                                  {row.status === 'learned' && (
                                    <Badge className="bg-primary/15 text-emerald-700 dark:text-[var(--status-success-text)] border-0 text-[10px]">
                                      Learned
                                    </Badge>
                                  )}
                                  {row.status === 'failed' && (
                                    <Badge variant="destructive" className="text-[10px]">Failed</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <div className="flex flex-wrap gap-4 text-sm border-t border-border pt-4 font-mono text-muted-foreground">
                          <span>EDI files analyzed: {ts?.edi_files_learned ?? 0}</span>
                          <span>Doc types: {(ts?.doc_types_found || []).join(', ') || '—'}</span>
                          <span>Rules extracted: {ts?.mapping_rules_count ?? 0}</span>
                          <span>
                            Last trained:{' '}
                            {ts?.last_trained_at ? new Date(ts.last_trained_at).toLocaleDateString() : '—'}
                          </span>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Mapping spreadsheet */}
                <Card>
                  <CardHeader>
                    <CardTitle>Field Mapping Matrix</CardTitle>
                    <CardDescription>
                      Upload your existing field mapping spreadsheet (Excel or CSV). This teaches Agent Eddy your exact field
                      name translations for this partner.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <input
                      ref={mapInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={onMappingFile}
                    />
                    <p className="text-xs text-muted-foreground font-mono">
                      Expected columns: Source Field | Target Field | Doc Type | Notes
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" onClick={() => mapInputRef.current?.click()} disabled={uploadingMap}>
                        {uploadingMap ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                        Upload spreadsheet
                      </Button>
                      <Button type="button" variant="outline" onClick={downloadMappingTemplate}>
                        Download template (CSV)
                      </Button>
                    </div>
                    {(lastMapImportCount != null || (latestMap && latestMap.mapping_rules_count > 0)) && (
                      <p className="text-sm font-medium">
                        {(lastMapImportCount ?? latestMap?.mapping_rules_count ?? 0).toLocaleString()} mapping rules imported
                      </p>
                    )}
                    {mapPreview.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Source</TableHead>
                            <TableHead>Target</TableHead>
                            <TableHead>Doc type</TableHead>
                            <TableHead>Notes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mapPreview.slice(0, 10).map((r, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-xs">{r.source_field}</TableCell>
                              <TableCell className="font-mono text-xs">{r.target_field}</TableCell>
                              <TableCell className="text-xs">{r.doc_type}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{r.notes}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                {/* ERP export */}
                <Card>
                  <CardHeader>
                    <CardTitle>ERP Transaction History</CardTitle>
                    <CardDescription>
                      Upload a JSON or XML export from your ERP system (SAP, Oracle, NetSuite etc). Agent Eddy will
                      cross-reference this with EDI data to build better inbound-to-ERP mapping models.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <input ref={erpInputRef} type="file" accept=".json,.xml" className="hidden" onChange={onErpFile} />
                    <Button type="button" variant="secondary" onClick={() => erpInputRef.current?.click()} disabled={uploadingErp}>
                      {uploadingErp ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                      Upload ERP export
                    </Button>
                    {latestErp && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {latestErp.status === 'processing' ? (
                            <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-200 border-0 animate-pulse text-[10px]">
                              Processing
                            </Badge>
                          ) : (
                            <Badge className="bg-primary/15 text-emerald-700 dark:text-[var(--status-success-text)] border-0 text-[10px]">
                              Ready
                            </Badge>
                          )}
                        </div>
                        {(erpLines.length ? erpLines : [`${latestErp.records_count ?? 0} records indexed`]).map((line, i) => (
                          <p key={i} className="text-sm font-mono text-muted-foreground">
                            {line}
                          </p>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="field-mappings" className="space-y-4">
          {(() => {
            const fmtSource = (s) => {
              if (!s) return '—';
              const x = String(s).toLowerCase();
              if (x === 'biztalk') return 'BizTalk';
              if (x === 'cleo') return 'Cleo';
              if (x === 'sterling') return 'Sterling';
              if (x === 'sps') return 'SPS';
              return s.charAt(0).toUpperCase() + s.slice(1);
            };
            const rows = fieldMappingsPayload?.mappings || [];
            const total = fieldMappingsPayload?.total_mappings ?? rows.length;
            const activeRules = rows.filter((r) => r.is_active !== false).length;
            const origins = [...new Set(rows.map((r) => r.source_system).filter(Boolean))];
            const sourceLabel =
              origins.length === 0 ? '—' : origins.map(fmtSource).join(', ');
            const lastImportedIso = rows.length
              ? rows.reduce((best, r) => {
                  const t = r.created_at;
                  if (!t) return best;
                  return !best || String(t) > String(best) ? t : best;
                }, null)
              : null;
            return (
              <>
                <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-2">
                  <div className="text-sm font-mono text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
                    {fieldMappingsLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading mappings…
                      </span>
                    ) : (
                      <>
                        <span>
                          <span className="text-foreground font-semibold tabular-nums">{activeRules}</span> symbolic rule
                          {activeRules !== 1 ? 's' : ''} active
                          {total !== activeRules ? (
                            <span className="text-muted-foreground font-normal">
                              {' '}
                              · {total} total
                            </span>
                          ) : null}
                        </span>
                        <span className="opacity-40 hidden sm:inline">·</span>
                        <span>
                          Source: <span className="text-foreground">{sourceLabel}</span>
                        </span>
                        <span className="opacity-40 hidden sm:inline">·</span>
                        <span>
                          Last imported:{' '}
                          <span className="text-foreground">
                            {lastImportedIso ? new Date(lastImportedIso).toLocaleString() : '—'}
                          </span>
                        </span>
                      </>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 font-mono border-teal-500/40 text-teal-600 dark:text-teal-300 hover:bg-teal-500/10 dark:hover:bg-teal-950/40"
                    onClick={() => navigate('/mapper')}
                  >
                    Configure Mapping
                  </Button>
                </div>

                {total === 0 && !fieldMappingsLoading ? (
                  <Card className="border-dashed">
                    <CardContent className="py-12 text-center space-y-4">
                      <Database className="w-10 h-10 mx-auto text-muted-foreground opacity-60" />
                      <p className="text-muted-foreground max-w-md mx-auto">
                        No field mappings yet. Run the Migration Wizard to import from BizTalk, Cleo, or Sterling.
                      </p>
                      <Button type="button" onClick={() => navigate('/migration')}>
                        Open Migration Wizard
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="font-mono text-xs uppercase tracking-wide text-teal-600/90 dark:text-[var(--text-secondary)]">
                              Source (legacy)
                            </TableHead>
                            <TableHead className="w-10 text-center font-mono text-xs text-muted-foreground">→</TableHead>
                            <TableHead className="font-mono text-xs uppercase tracking-wide text-teal-600/90 dark:text-[var(--text-secondary)]">
                              Target (canonical)
                            </TableHead>
                            <TableHead className="font-mono text-xs">Transform</TableHead>
                            <TableHead className="font-mono text-xs text-right">Confidence</TableHead>
                            <TableHead className="font-mono text-xs text-right">Hits</TableHead>
                            <TableHead className="font-mono text-xs">Last used</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-xs align-top">{r.source_field}</TableCell>
                              <TableCell className="text-center text-muted-foreground align-top">→</TableCell>
                              <TableCell className="font-mono text-xs align-top break-all">{r.target_field}</TableCell>
                              <TableCell className="text-xs align-top">{r.transform_type}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums align-top">
                                {typeof r.confidence === 'number' ? r.confidence.toFixed(2) : '—'}
                              </TableCell>
                              <TableCell className="text-xs text-right tabular-nums align-top">{r.hit_count ?? 0}</TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap align-top">
                                {r.last_used ? new Date(r.last_used).toLocaleString() : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </>
            );
          })()}
        </TabsContent>
      </Tabs>

      <AddTradingPartnerWizard
        open={editWizardOpen}
        editPartnerId={editWizardOpen ? id : null}
        onClose={closeEditWizard}
        onComplete={handleEditWizardComplete}
      />
    </div>
  );
};
