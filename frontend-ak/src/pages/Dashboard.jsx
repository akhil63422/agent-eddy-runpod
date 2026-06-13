import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { KPICard } from '@/components/KPICard';
import { FlowVisualization } from '@/components/FlowVisualization';
import { ActivityTable } from '@/components/ActivityTable';
import { ActivityGroupedTable } from '@/components/ActivityGroupedTable';
import { ProcessingModal } from '@/components/ProcessingModal';
import { OutboundProcessingModal } from '@/components/OutboundProcessingModal';
import { TrafficChart } from '@/components/analytics/TrafficChart';
import { PartnersActivity } from '@/components/analytics/PartnersActivity';
import {
  CheckCircle2, AlertTriangle, ArrowDownToLine, ArrowUp,
  Download, Upload, Database, X, CloudUpload, FileUp, Loader2,
} from 'lucide-react';
import { websocketService } from '@/services/websocket';
import { documentsService } from '@/services/documents';
import { analyticsService } from '@/services/analytics';
import { dataService } from '@/services/data';
import { toast } from 'sonner';
import api from '@/services/api';
import { getDisplayDirection } from '@/utils/directionMatrix';
import { PartnerNotConfiguredModal } from '@/components/PartnerNotConfiguredModal';
import { Button } from '@/components/ui/button';

function _hoursSinceDocTs(d) {
  const t = new Date(d.received_at || d.created_at).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 36e5;
}

function ProcessingModalSelector({ documentId, fileName, onClose }) {
  const [doc, setDoc] = React.useState(null);

  useEffect(() => {
    documentsService.getById(documentId, true).then(setDoc).catch(() => {});
  }, [documentId]);

  if (!doc) return null;
  return doc.direction === 'Outbound' ? (
    <OutboundProcessingModal documentId={documentId} fileName={fileName} onClose={onClose} />
  ) : (
    <ProcessingModal documentId={documentId} fileName={fileName} onClose={onClose} />
  );
}

function fallbackOpsFromDocs(allDocs) {
  const list = Array.isArray(allDocs) ? allDocs : [];
  const inbound24 = list.filter((d) => d.direction === 'Inbound' && _hoursSinceDocTs(d) <= 24).length;
  const outbound24 = list.filter((d) => d.direction === 'Outbound' && _hoursSinceDocTs(d) <= 24).length;
  const outboundPrev = list.filter(
    (d) => d.direction === 'Outbound' && _hoursSinceDocTs(d) > 24 && _hoursSinceDocTs(d) <= 48,
  ).length;
  let files_sent_trend_pct = 0;
  if (outboundPrev === 0) files_sent_trend_pct = outbound24 > 0 ? 100 : 0;
  else files_sent_trend_pct = Math.round(((outbound24 - outboundPrev) / outboundPrev) * 1000) / 10;
  const successful_translations = list.filter(
    (d) =>
      ['Completed', 'Processed', 'Generated', 'Dispatched', 'Delivered', 'Sent'].includes(d.status) &&
      _hoursSinceDocTs(d) <= 24,
  ).length;
  const active_exceptions = list.filter((d) => ['Failed', 'Needs Review'].includes(d.status)).length;
  return {
    files_received: inbound24,
    files_sent: outbound24,
    files_sent_trend_pct,
    successful_translations,
    active_exceptions,
  };
}

function buildOperationsKpiCards(ops) {
  const o = ops || {};
  const fr = o.files_received ?? 0;
  const fs = o.files_sent ?? 0;
  const trendRaw = Number(o.files_sent_trend_pct ?? 0);
  const trendUp = trendRaw > 0;
  const trendDown = trendRaw < 0;
  const st = o.successful_translations ?? 0;
  const ae = o.active_exceptions ?? 0;
  return [
    {
      kpiKey: 'files_received',
      bucket: 'files_received',
      title: 'Files Received',
      value: String(fr),
      subtitle: 'Files received today',
      trend: 'up',
      trendValue: null,
      icon: ArrowDownToLine,
      variant: 'default',
    },
    {
      kpiKey: 'files_sent',
      bucket: 'files_sent',
      title: 'Files Sent',
      value: String(fs),
      subtitle: 'Outbound · vs previous 24h',
      trend: trendUp ? 'up' : trendDown ? 'down' : 'neutral',
      trendValue: `${trendRaw > 0 ? '+' : ''}${trendRaw}%`,
      icon: ArrowUp,
      variant: 'purple',
    },
    {
      kpiKey: 'successful_translations',
      bucket: 'successful_translations',
      title: 'Successful Translations',
      value: String(st),
      subtitle: 'Completed / processed (24h)',
      trend: 'up',
      trendValue: null,
      variant: 'success',
      icon: CheckCircle2,
    },
    {
      kpiKey: 'active_exceptions',
      bucket: 'active_exceptions',
      title: 'Active Exceptions',
      value: String(ae),
      subtitle: 'Requires attention',
      trend: 'down',
      trendValue: null,
      variant: 'warning',
      icon: AlertTriangle,
    },
  ];
}

export const Dashboard = () => {
  const navigate = useNavigate();
  const fileInputRef    = useRef(null);
  const ediFileInputRef = useRef(null);
  const [isExporting,   setIsExporting]   = useState(false);
  const [isImporting,   setIsImporting]   = useState(false);
  const [isDragOver,    setIsDragOver]    = useState(false);
  const [isUploading,   setIsUploading]   = useState(false);
  const [processingDoc, setProcessingDoc] = useState(null); // { id, fileName }
  const [uploadResult,  setUploadResult]  = useState(null); // last upload result (for ERP validation display)
  const pendingUploadFileRef = useRef(null);
  const lastPartnerRejectDetailRef = useRef(null);

  const [partnerNotConfiguredModal, setPartnerNotConfiguredModal] = useState({
    open: false,
    senderId: '',
    gsSenderId: '',
    fileName: '',
    docType: '',
    detailMessage: '',
  });

  const openUnknownPartnerModal = useCallback((detail, fileObj) => {
    lastPartnerRejectDetailRef.current = detail;
    const extracted = detail.extracted || {};
    pendingUploadFileRef.current = fileObj || null;
    setPartnerNotConfiguredModal({
      open: true,
      senderId: detail.sender_id || extracted.raw_sender || detail.partner_code_detected || extracted.partner_code || '',
      gsSenderId: detail.gs_sender_id || extracted.gs_sender_id || '',
      fileName: detail.file_name || (fileObj && fileObj.name) || '',
      docType: detail.doc_type || '',
      detailMessage: detail.processing_error_message || '',
    });
  }, []);

  const persistPendingFileAndGoToPartners = useCallback(() => {
    const d = lastPartnerRejectDetailRef.current || {};
    const extracted = d.extracted || {};
    const businessName =
      d.extracted_business_name || extracted.extracted_business_name || '';
    const codeSrc =
      d.partner_code_detected ||
      extracted.partner_code ||
      d.sender_id ||
      extracted.raw_sender ||
      '';
    const partnerCode = String(codeSrc || '').replace(/\s/g, '').toUpperCase().slice(0, 100);
    const file = pendingUploadFileRef.current;

    const goPartners = () => {
      navigate('/partners', {
        state: {
          openPartnerWizard: true,
          wizardPrefill: {
            businessName: businessName || codeSrc || '',
            partnerCode: partnerCode || '',
          },
        },
      });
      pendingUploadFileRef.current = null;
      lastPartnerRejectDetailRef.current = null;
    };

    if (file && typeof file.arrayBuffer === 'function') {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          sessionStorage.setItem(
            'edi_pending_upload_retry',
            JSON.stringify({
              dataUrl: reader.result,
              fileName: file.name,
              fileType: file.type || 'application/octet-stream',
              role: localStorage.getItem('role'),
            }),
          );
        } catch (e) {
          console.warn('Could not store file for retry', e);
        }
        goPartners();
      };
      reader.readAsDataURL(file);
    } else {
      goPartners();
    }
  }, [navigate]);

  const cancelUnknownPartnerUpload = useCallback(() => {
    pendingUploadFileRef.current = null;
    lastPartnerRejectDetailRef.current = null;
  }, []);

  const [kpiData, setKpiData] = useState(() => buildOperationsKpiCards({}));
  const [kpiModal, setKpiModal] = useState(null);
  const [kpiModalRows, setKpiModalRows] = useState([]);
  const [kpiModalLoading, setKpiModalLoading] = useState(false);

  const [backendConnected, setBackendConnected] = useState(null); // null=checking, true=ok, false=error

  const [activityData, setActivityData] = useState([]);
  /** null = API failed, use flat ActivityTable; array = hierarchical view */
  const [activityGroups, setActivityGroups] = useState(null);
  const [ourCompanyName, setOurCompanyName] = useState('');
  const [analyticsPeriod, setAnalyticsPeriod] = useState(7);

  // Check backend connection
  useEffect(() => {
    const checkBackend = async () => {
      try {
        await api.get('/partners/?limit=1');
        setBackendConnected(true);
      } catch {
        setBackendConnected(false);
      }
    };
    checkBackend();
  }, []);

  useEffect(() => {
    api.get('/connections/our-company')
      .then(res => setOurCompanyName(res.data?.name || ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadDashboardData();
    websocketService.connect();

    const unsubscribeDocument = websocketService.on('document_update', () => loadDashboardData());
    const unsubscribeException = websocketService.on('exception', () => loadDashboardData());

    const unsubscribeKpi = websocketService.on('kpi_update', (message) => {
      if (message.data) {
        setKpiData((prev) =>
          prev.map((kpi) => {
            const updated = message.data[kpi.kpiKey] ?? message.data[kpi.title];
            return updated ? { ...kpi, ...updated } : kpi;
          }),
        );
      }
    });

    return () => {
      unsubscribeDocument();
      unsubscribeException();
      unsubscribeKpi();
    };
  }, []);

  const refreshOperationsKpis = useCallback(async () => {
    try {
      const ops = await analyticsService.getOperationsKpis();
      setKpiData(buildOperationsKpiCards(ops));
    } catch {
      try {
        const allDocs = await documentsService.getAll({ limit: 500, forceApi: true, summary: true });
        setKpiData(buildOperationsKpiCards(fallbackOpsFromDocs(allDocs)));
      } catch {
        /* keep existing KPIs on silent failure */
      }
    }
  }, []);

  const openKpiDetail = useCallback(async (kpi) => {
    const n = parseInt(String(kpi.value), 10);
    setKpiModal({
      bucket: kpi.bucket,
      title: kpi.title,
      count: Number.isFinite(n) ? n : 0,
    });
    setKpiModalLoading(true);
    setKpiModalRows([]);
    try {
      const data = await analyticsService.getOperationsKpiDetail(kpi.bucket);
      setKpiModalRows(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      console.error(e);
      toast.error('Could not load files for this KPI');
      setKpiModalRows([]);
    } finally {
      setKpiModalLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      refreshOperationsKpis();
    }, 30000);
    return () => clearInterval(id);
  }, [refreshOperationsKpis]);

  const loadDashboardData = async () => {
    try {
      let ops = null;
      let activityDocs = [];
      try {
        [ops, activityDocs] = await Promise.all([
          analyticsService.getOperationsKpis(),
          documentsService.getAll({ limit: 30, forceApi: true, summary: true }),
        ]);
      } catch {
        try {
          const allDocs = await documentsService.getAll({ limit: 500, forceApi: true, summary: true });
          ops = fallbackOpsFromDocs(Array.isArray(allDocs) ? allDocs : []);
          activityDocs = Array.isArray(allDocs) ? allDocs.slice(0, 30) : [];
        } catch {
          ops = {
            files_received: 0,
            files_sent: 0,
            files_sent_trend_pct: 0,
            successful_translations: 0,
            active_exceptions: 0,
          };
          activityDocs = [];
        }
      }

      setKpiData(buildOperationsKpiCards(ops));

      const list = Array.isArray(activityDocs) ? activityDocs : (activityDocs?.items ?? []);

      try {
        const grouped = await documentsService.getGrouped({ limit: 40 });
        setActivityGroups(Array.isArray(grouped) ? grouped : []);
      } catch (grpErr) {
        console.warn('Grouped transactions unavailable, using flat activity list', grpErr);
        setActivityGroups(null);
      }

      const viewerRole = localStorage.getItem('role');
      const transformed = list.map(docItem => {
        const ts = docItem.received_at || docItem.created_at;
        const displayTs = ts ? (typeof ts === 'string' ? new Date(ts).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ts) : '-';
        const displayDir = docItem.effective_direction || getDisplayDirection(viewerRole, docItem.document_type) || docItem.direction || 'Inbound';
        const partnerName = docItem.partner_name || docItem.partner_code || 'Unknown';
        return {
          id: docItem._id || docItem.id,
          timestamp: displayTs,
          partner: partnerName,
          fromParty: docItem.sender_name || (displayDir === 'Inbound' ? partnerName : ourCompanyName),
          toParty: docItem.receiver_name || (displayDir === 'Outbound' ? partnerName : ourCompanyName),
          docType: docItem.document_type || '-',
          direction: displayDir,
          status: ['Completed', 'Generated', 'Dispatched', 'Delivered', 'Sent', 'Processed'].includes(docItem.status)
            ? 'Completed'
            : docItem.status === 'Needs Review'
            ? 'Warning'
            : docItem.status === 'Failed' || docItem.status === 'Duplicate'
            ? 'Error'
            : 'Processing',
          stage: docItem.status || '-',
        };
      });
      setActivityData(transformed);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      const msg = err?.response?.data?.detail ?? err?.message ?? 'Unknown error';
      toast.error(`Failed to load dashboard: ${typeof msg === 'string' ? msg : 'Check backend'}`);
      // Show zeros so page is usable
      setActivityData([]);
      setActivityGroups(null);
    }
  };

  // ── Unified File Upload (auto-detects ERP JSON vs EDI/JSON/XML/CSV) ─────
  const handleFileUpload = useCallback(async (file) => {
    if (!file) return;

    try {
      setIsUploading(true);
      setUploadResult(null);

      const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
      const isJsonFile = ext === '.json' || file.type?.includes('json');

      // For JSON files, check if it's an ERP payload (has idocType)
      if (isJsonFile) {
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);

          if (parsed.idocType || parsed.idoc_type) {
            try {
              const res = await api.post('/ingestion/erp', { payload: parsed });
              const data = res?.data || {};
              setUploadResult(data);
              const idocType = parsed.idocType || parsed.idoc_type || 'ERP';
              if (data.has_errors) {
                toast.warning(data.processing_error_message || data.message || 'Validation issues');
                if (data.document_id) setProcessingDoc(null);
              } else {
                toast.success(`ERP ${idocType} → mapped to ${data.doc_type || 'EDI'} (doc: ${data.document_id?.slice(0, 8)})`);
                if (data.document_id) setProcessingDoc({ id: data.document_id, fileName: file.name });
              }
              loadDashboardData();
              return;
            } catch (erpErr) {
              if (erpErr?.response?.status === 422) {
                const detail = erpErr.response?.data?.detail;
                if (detail?.error === 'PARTNER_VALIDATION_FAILED') {
                  openUnknownPartnerModal(
                    { ...detail, file_name: file.name, doc_type: parsed.idocType || parsed.idoc_type },
                    file,
                  );
                  return;
                }
              }
              if (erpErr?.response) {
                const detail = erpErr.response?.data?.detail;
                const msg =
                  typeof detail === 'object' ? detail?.error || JSON.stringify(detail) : detail || erpErr.message;
                toast.error(String(msg));
                return;
              }
              throw erpErr;
            }
          }
        } catch (parseErr) {
          if (parseErr?.response) {
            const detail = parseErr.response?.data?.detail;
            const msg = typeof detail === 'object' ? detail?.error || JSON.stringify(detail) : detail || parseErr.message;
            toast.error(String(msg));
            return;
          }
        }
      }

      // Standard upload path for EDI, JSON, XML, CSV
      const formData = new FormData();
      formData.append('file', file);
      // Only send role for JSON/XML/CSV — X12/EDIFACT direction is determined
      // from ISA headers and must never be overridden by the user's login role.
      const fileExt = (file.name || '').split('.').pop().toLowerCase();
      const isEdi = fileExt === 'edi' || fileExt === 'x12' || fileExt === 'txt' ||
        (file.type || '').includes('edi');
      if (!isEdi) {
        const role = localStorage.getItem('role');
        if (role) formData.append('role', role);
      }

      const data = await documentsService.uploadFile(formData);
      const documentId = data.document_id || data.id;
      const fileName = data.file_name || file.name;
      const documentType = data.document_type || 'EDI';
      const standard = data.standard || 'X12';

      if (data.has_errors) {
        toast.warning(data.processing_error_message || data.message || 'Upload completed with issues');
        setUploadResult({
          status: data.status || 'Failed',
          has_errors: true,
          document_id: documentId,
          doc_type: documentType,
          validation: [
            {
              valid: false,
              severity: 'Error',
              message: data.processing_error_message || data.message || 'Validation issue',
            },
          ],
        });
        loadDashboardData();
      } else {
        toast.success(`Uploaded ${file.name} — detected ${documentType} (${standard})`);
      }
      if (documentId) {
        setProcessingDoc({ id: documentId, fileName });
      }
    } catch (err) {
      if (err?.response?.status === 422) {
        const detail = err.response?.data?.detail;
        if (detail?.error === 'PARTNER_VALIDATION_FAILED') {
          openUnknownPartnerModal({ ...detail, file_name: detail.file_name || file.name }, file);
          return;
        }
      }
      let msg = err.response?.data?.detail ?? err.message ?? 'Upload failed. Check backend is running.';
      if (Array.isArray(msg)) {
        msg = msg.map((e) => e?.msg || `${e?.loc?.join('.') || ''}: ${e?.msg || ''}`).filter(Boolean).join('; ') || 'Upload failed';
      } else if (typeof msg === 'object' && msg !== null) {
        msg = msg?.msg || JSON.stringify(msg);
      }
      toast.error(String(msg));
    } finally {
      setIsUploading(false);
      if (ediFileInputRef.current) ediFileInputRef.current.value = '';
    }
  }, [loadDashboardData, openUnknownPartnerModal]);

  const handleEdiFileChange = (e) => {
    const file = e?.target?.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleDownloadData = async () => {
    try {
      setIsExporting(true);
      const data = await dataService.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edi-mvp-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Data exported. Share this JSON file + the app link with your manager.');
    } catch (err) {
      console.error('Export error:', err);
      let msg = err.response?.data?.detail ?? err.message ?? 'Failed to export data';
      if (Array.isArray(msg)) msg = msg.map((e) => e?.msg).filter(Boolean).join('; ');
      else if (typeof msg === 'object' && msg !== null) msg = msg?.msg || JSON.stringify(msg);
      toast.error(String(msg));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportData = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    try {
      setIsImporting(true);
      const text = await file.text();
      const payload = JSON.parse(text);
      const required = ['trading_partners', 'documents', 'exceptions', 'audit_logs'];
      for (const key of required) {
        if (!Array.isArray(payload[key])) {
          throw new Error(`Invalid format: missing or invalid "${key}" array`);
        }
      }
      await dataService.importData({
        trading_partners: payload.trading_partners || [],
        documents: payload.documents || [],
        exceptions: payload.exceptions || [],
        audit_logs: payload.audit_logs || [],
      });
      toast.success('Data saved to browser. All pages will now use this data.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadDashboardData();
    } catch (err) {
      console.error('Import error:', err);
      let msg = err.response?.data?.detail ?? err.message ?? 'Failed to import data';
      if (Array.isArray(msg)) msg = msg.map((e) => e?.msg).filter(Boolean).join('; ');
      else if (typeof msg === 'object' && msg !== null) msg = msg?.msg || JSON.stringify(msg);
      toast.error(String(msg));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="p-8 space-y-8 min-h-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Operations Dashboard</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-0.5">Real-time overview of your EDI operations</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Backend connection status */}
          {backendConnected === false && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-[var(--status-error-text)] text-sm">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Backend disconnected — check API URL and CORS settings
            </div>
          )}
          {backendConnected === true && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-subtle)] border border-green-500/30 text-[var(--status-success-text)] text-sm">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Backend connected
            </div>
          )}
          {dataService.hasLocalData() && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[var(--status-warn-text)] text-sm">
              <Database className="w-4 h-4" />
              <span>Using browser data</span>
              <Button
                onClick={() => {
                  dataService.clearLocalData();
                  toast.success('Cleared local data. Using API.');
                  loadDashboardData();
                }}
                variant="ghost"
                size="icon"
                title="Clear and use API"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportData}
          />
          <Button
            onClick={handleDownloadData}
            disabled={isExporting}
            variant="outline"
            className="h-9 rounded-lg"
          >
            {isExporting ? (
              <span className="animate-pulse">Exporting...</span>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download Data
              </>
            )}
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            variant="outline"
            className="h-9 rounded-lg"
          >
            {isImporting ? (
              <span className="animate-pulse">Importing...</span>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Import Data
              </>
            )}
          </Button>
        </div>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiData.map((kpi, index) => (
          <KPICard key={kpi.kpiKey || index} {...kpi} onClick={() => openKpiDetail(kpi)} />
        ))}
      </div>

      {/* Traffic Chart (half) + Most Active Partners (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrafficChart days={analyticsPeriod} onPeriodChange={setAnalyticsPeriod} />
        <PartnersActivity days={analyticsPeriod} />
      </div>
      
      {/* Unified Upload Zone */}
      <div className="space-y-3">
        <input
          ref={ediFileInputRef}
          type="file"
          accept=".edi,.x12,.txt,.edifact,.dat,.edi2,.json,.xml,.csv"
          className="hidden"
          onChange={handleEdiFileChange}
        />

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`relative rounded-sm border-2 border-dashed transition-all duration-200 select-none
            ${isDragOver
              ? 'bg-blue-500/10 border-[var(--border)]/50'
              : 'bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--text-muted)]'
            }
            ${isUploading ? 'pointer-events-none opacity-70' : ''}
          `}
        >
          <div
            onClick={() => !isUploading && ediFileInputRef.current?.click()}
            className="flex flex-col sm:flex-row items-center gap-4 px-6 py-5 cursor-pointer"
          >
            <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center
              ${isDragOver ? 'bg-[var(--bg-subtle)]' : 'bg-[var(--bg-subtle)]'}`}
            >
              {isUploading
                ? <Loader2 className="w-6 h-6 text-[var(--status-info-text)] animate-spin" />
                : isDragOver
                ? <FileUp className="w-6 h-6 text-[var(--status-info-text)]" />
                : <CloudUpload className="w-6 h-6 text-[var(--text-secondary)]" />
              }
            </div>

            <div className="flex-1 text-center sm:text-left">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {isUploading ? 'Processing file…' : isDragOver ? 'Drop your file here' : 'Upload EDI, JSON, XML, CSV, or ERP Payload'}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {isUploading
                  ? 'Auto-detecting format — ERP payloads (with idocType) route to mapping engine'
                  : 'Drag & drop or click to browse · ERP JSON (INVOIC01, ORDERS05) auto-detected · Pipeline starts instantly'}
              </p>
            </div>

            {!isUploading && (
              <div className="flex-shrink-0 flex flex-wrap gap-1.5">
                {['EDI', 'JSON', 'XML', 'ERP'].map(s => (
                  <span key={s} className={`px-2 py-0.5 rounded text-[10px] font-medium ${s === 'ERP' ? 'bg-indigo-500/15 text-[var(--text-secondary)] border border-indigo-500/30' : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'}`}>
                    {s}
                  </span>
                ))}
              </div>
            )}

            {isUploading && (
              <div className="absolute inset-0 rounded-sm overflow-hidden pointer-events-none bg-[var(--bg-subtle)]/20" />
            )}
          </div>
        </div>

        {/* Upload Result (for ERP validation display) */}
        {uploadResult && (
          <div className="p-4 rounded-sm bg-[var(--bg-subtle)]/60 border border-[var(--border)] space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`px-2.5 py-1 rounded text-xs font-medium ${uploadResult.has_errors ? 'bg-transparent text-[var(--status-warn-text)]' : 'bg-green-500/20 text-[var(--status-success-text)]'}`}>
                {uploadResult.status}
              </span>
              <span className="text-sm text-[var(--text-primary)]">Document: <code className="text-[var(--text-secondary)]">{uploadResult.document_id?.slice(0, 12)}…</code></span>
              <span className="text-xs text-[var(--text-muted)]">Type: {uploadResult.doc_type}</span>
              <Button
                onClick={() => setUploadResult(null)}
                variant="ghost"
                size="icon"
                className="ml-auto"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            {uploadResult.validation?.length > 0 && (
              <div className="space-y-1">
                {uploadResult.validation.map((v, i) => (
                  <div key={i} className={`text-xs px-3 py-1.5 rounded font-mono ${v.valid ? 'bg-[var(--bg-subtle)] text-[var(--status-success-text)]' : 'bg-red-500/10 text-[var(--status-error-text)]'}`}>
                    [{v.severity}] {v.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live EDI Activity: 10-Step Flow + Activity Table */}
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Live EDI Activity</h2>
            {activityGroups !== null && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Grouped by transaction (PO, invoice, ASN). Expand rows for related 997, 855, 856…
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-sm border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span className="text-xs font-medium text-[var(--status-success-text)]">Live</span>
          </div>
        </div>
        {activityGroups !== null ? (
          <ActivityGroupedTable groups={activityGroups} onRefresh={loadDashboardData} />
        ) : (
          <ActivityTable data={activityData} />
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FlowVisualization direction="Inbound" />
          <FlowVisualization direction="Outbound" />
        </div>
      </div>

      {/* ── Pipeline Processing Modal ─────────────────────────────────────── */}
      {processingDoc && (
        <ProcessingModalSelector
          documentId={processingDoc.id}
          fileName={processingDoc.fileName}
          onClose={() => {
            setProcessingDoc(null);
            loadDashboardData();
          }}
        />
      )}

      <PartnerNotConfiguredModal
        open={partnerNotConfiguredModal.open}
        onOpenChange={(open) => {
          setPartnerNotConfiguredModal((s) => ({ ...s, open }));
          if (!open) cancelUnknownPartnerUpload();
        }}
        senderId={partnerNotConfiguredModal.senderId}
        gsSenderId={partnerNotConfiguredModal.gsSenderId}
        fileName={partnerNotConfiguredModal.fileName}
        docType={partnerNotConfiguredModal.docType}
        detailMessage={partnerNotConfiguredModal.detailMessage}
        onAddTradingPartner={persistPendingFileAndGoToPartners}
        onCancelUpload={cancelUnknownPartnerUpload}
      />

      {kpiModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          role="presentation"
          onClick={() => {
            setKpiModal(null);
            setKpiModalRows([]);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="kpi-modal-title"
            className="w-full max-w-4xl rounded-sm border border-[var(--border)] bg-background/95 shadow-2xl shadow-black/50 font-mono text-[var(--text-primary)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--border-subtle)]">
              <h2 id="kpi-modal-title" className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
                {kpiModal.title} — {kpiModal.count}
              </h2>
              <Button
                type="button"
                onClick={() => {
                  setKpiModal(null);
                  setKpiModalRows([]);
                }}
                variant="ghost"
                size="icon"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-auto">
              {kpiModalLoading ? (
                <div className="flex items-center justify-center py-16 text-[var(--text-muted)] text-sm">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--text-primary)] mr-2" />
                  Loading…
                </div>
              ) : kpiModalRows.length === 0 ? (
                <p className="text-center text-[var(--text-muted)] py-12 text-sm">No files found</p>
              ) : (
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="sticky top-0 bg-background/95 z-10 border-b border-[var(--border-subtle)]">
                    <tr className="text-[var(--text-primary)]/80 uppercase text-xs tracking-wider">
                      <th className="py-2 pr-4 font-semibold">File Name</th>
                      <th className="py-2 pr-4 font-semibold">Type</th>
                      <th className="py-2 pr-4 font-semibold">Partner</th>
                      <th className="py-2 pr-4 font-semibold">Status</th>
                      <th className="py-2 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiModalRows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => {
                          navigate(`/document/${row.id}`);
                          setKpiModal(null);
                          setKpiModalRows([]);
                        }}
                        className="cursor-pointer border-b border-[var(--border-subtle)]/80 transition-colors hover:bg-[var(--bg-subtle)]"
                      >
                        <td className="py-2.5 pr-4 text-[var(--text-primary)] truncate max-w-[200px]" title={row.file_name}>
                          {row.file_name}
                        </td>
                        <td className="py-2.5 pr-4 text-[var(--text-primary)]">{row.document_type}</td>
                        <td className="py-2.5 pr-4 text-[var(--text-primary)]">{row.partner_code}</td>
                        <td className="py-2.5 pr-4 text-[var(--text-primary)]">{row.status}</td>
                        <td className="py-2.5 text-[var(--text-secondary)] whitespace-nowrap">
                          {row.date
                            ? new Date(row.date).toLocaleString('en-US', {
                                month: '2-digit',
                                day: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
