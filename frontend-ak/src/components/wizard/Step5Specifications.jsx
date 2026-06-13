import React, { useRef, useState } from 'react';
import {
  Upload, FileText, X, Brain, Loader2, Download, CheckCircle2,
  AlertCircle, FileBadge, FileIcon, Plus,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api from '@/services/api';
import { partnersService } from '@/services/partners';
import { toast } from 'sonner';

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ─── Single file row (saved or pending) ─────────────────────────────────────
const FileRow = ({ file, isSaved, onRemove, onDownload, removing }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-focus)] bg-[var(--bg-base)] px-3 py-2.5">
    <div className="flex items-center gap-2.5 min-w-0">
      <FileText className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{file.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {isSaved ? (
            <Badge variant="outline" className="text-[10px] h-4 border-[var(--status-success)] text-[var(--status-success-text)] px-1.5">
              <CheckCircle2 className="w-2.5 h-2.5 mr-1" />Saved
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] h-4 border-[var(--border-focus)] text-[var(--text-secondary)] px-1.5">
              Pending upload
            </Badge>
          )}
          {file.size ? <span className="text-[11px] text-[var(--text-muted)]">{fmt(file.size)}</span> : null}
          {isSaved && file.uploaded_at ? (
            <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
              {new Date(file.uploaded_at).toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </div>
    </div>
    <div className="flex items-center gap-1 flex-shrink-0">
      {isSaved && onDownload && (
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-[var(--text-secondary)]"
          title="Download" onClick={onDownload}>
          <Download className="w-3.5 h-3.5" />
        </Button>
      )}
      <Button type="button" variant="ghost" size="icon"
        className="h-7 w-7 text-[var(--text-secondary)] hover:text-[var(--status-error-text)]"
        title="Remove" disabled={removing} onClick={onRemove}>
        {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
      </Button>
    </div>
  </div>
);

// ─── Multi-file upload section ────────────────────────────────────────────────
const MultiFileSection = ({
  label, description, accept, acceptLabel,
  icon: Icon, accentColor,
  savedFiles,        // [{ id, name, size, uploaded_at }] from backend
  pendingFiles,      // [{ localId, name, size, file: File }] not yet uploaded
  uploading,         // set of localIds currently uploading
  removingIds,       // set of fileIds currently being removed
  uploadError,
  partnerId,
  onSelect,
  onRemoveSaved,
  onRemovePending,
  onDownload,
}) => {
  const inputRef = useRef(null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="w-4 h-4" style={{ color: accentColor }} />
          {label}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Saved files from backend */}
        {savedFiles.map((f) => (
          <FileRow
            key={f.id}
            file={f}
            isSaved
            removing={removingIds.has(f.id)}
            onRemove={() => onRemoveSaved(f.id)}
            onDownload={partnerId ? () => onDownload(f.id) : null}
          />
        ))}

        {/* Pending (local) files waiting for upload */}
        {pendingFiles.map((f) => (
          <FileRow
            key={f.localId}
            file={f}
            isSaved={false}
            removing={uploading.has(f.localId)}
            onRemove={() => onRemovePending(f.localId)}
          />
        ))}

        {/* Upload zone */}
        <div
          className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] py-4 cursor-pointer hover:border-[var(--border-focus)] transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <Plus className="w-4 h-4 text-[var(--text-muted)]" />
          <span className="text-sm text-[var(--text-secondary)]">
            Add {savedFiles.length + pendingFiles.length > 0 ? 'another' : 'a'} file
          </span>
          <span className="text-xs text-[var(--text-muted)]">· {acceptLabel}</span>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple
            className="sr-only"
            onChange={(e) => {
              Array.from(e.target.files || []).forEach((file) => onSelect(file));
              e.target.value = '';
            }}
          />
        </div>

        {uploadError && (
          <p className="flex items-center gap-1.5 text-xs text-[var(--status-error-text)] rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error)]/10 px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{uploadError}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────
export const Step5Specifications = ({ data, onChange, partnerId }) => {
  const [schemaAnalysis, setSchemaAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  // Set of localIds whose uploads are in-flight
  const [uploadingSpec, setUploadingSpec] = useState(new Set());
  const [uploadingSample, setUploadingSample] = useState(new Set());
  // Set of saved file IDs whose deletes are in-flight
  const [removingSpec, setRemovingSpec] = useState(new Set());
  const [removingSample, setRemovingSample] = useState(new Set());
  const [specError, setSpecError] = useState(null);
  const [sampleError, setSampleError] = useState(null);

  const savedSpecFiles = data.savedSpecFiles || [];
  const savedSampleFiles = data.savedSampleFiles || [];
  const pendingSpecFiles = data.specFiles || [];
  const pendingSampleFiles = data.sampleFiles || [];

  // ── Spec: select ────────────────────────────────────────────────────────
  const handleSelectSpec = async (file) => {
    setSpecError(null);
    const localId = `${Date.now()}-${Math.random()}`;

    if (!partnerId) {
      // Queue locally — will upload once partnerId is available
      onChange({ specFiles: [...pendingSpecFiles, { localId, name: file.name, size: file.size, file }] });
      return;
    }
    setUploadingSpec((s) => new Set([...s, localId]));
    // Show placeholder immediately
    onChange({ specFiles: [...pendingSpecFiles, { localId, name: file.name, size: file.size, file }] });
    try {
      const res = await partnersService.uploadSpecFile(partnerId, file);
      // Move from pending → saved
      onChange({
        savedSpecFiles: [...savedSpecFiles, res.file],
        specFiles: (data.specFiles || []).filter((f) => f.localId !== localId),
      });
      toast.success(`"${file.name}" uploaded`);
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message || 'Upload failed';
      setSpecError(msg);
      toast.error(msg);
      onChange({ specFiles: (data.specFiles || []).filter((f) => f.localId !== localId) });
    } finally {
      setUploadingSpec((s) => { const n = new Set(s); n.delete(localId); return n; });
    }
  };

  // ── Spec: remove saved ──────────────────────────────────────────────────
  const handleRemoveSavedSpec = async (fileId) => {
    setSpecError(null);
    setRemovingSpec((s) => new Set([...s, fileId]));
    try {
      await partnersService.deletePartnerFile(partnerId, 'spec', fileId);
      onChange({ savedSpecFiles: savedSpecFiles.filter((f) => f.id !== fileId) });
      toast.success('Spec file removed');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to remove file');
    } finally {
      setRemovingSpec((s) => { const n = new Set(s); n.delete(fileId); return n; });
    }
  };

  // ── Spec: remove pending ────────────────────────────────────────────────
  const handleRemovePendingSpec = (localId) => {
    onChange({ specFiles: pendingSpecFiles.filter((f) => f.localId !== localId) });
  };

  // ── Sample: select ──────────────────────────────────────────────────────
  const handleSelectSample = async (file) => {
    setSampleError(null);
    const localId = `${Date.now()}-${Math.random()}`;

    if (!partnerId) {
      onChange({ sampleFiles: [...pendingSampleFiles, { localId, name: file.name, size: file.size, file }] });
      return;
    }
    setUploadingSample((s) => new Set([...s, localId]));
    onChange({ sampleFiles: [...pendingSampleFiles, { localId, name: file.name, size: file.size, file }] });
    try {
      const res = await partnersService.uploadSampleFile(partnerId, file);
      onChange({
        savedSampleFiles: [...savedSampleFiles, res.file],
        sampleFiles: (data.sampleFiles || []).filter((f) => f.localId !== localId),
      });
      toast.success(`"${file.name}" uploaded`);
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message || 'Upload failed';
      setSampleError(msg);
      toast.error(msg);
      onChange({ sampleFiles: (data.sampleFiles || []).filter((f) => f.localId !== localId) });
    } finally {
      setUploadingSample((s) => { const n = new Set(s); n.delete(localId); return n; });
    }
  };

  // ── Sample: remove saved ────────────────────────────────────────────────
  const handleRemoveSavedSample = async (fileId) => {
    setSampleError(null);
    setRemovingSample((s) => new Set([...s, fileId]));
    try {
      await partnersService.deletePartnerFile(partnerId, 'sample', fileId);
      onChange({ savedSampleFiles: savedSampleFiles.filter((f) => f.id !== fileId) });
      toast.success('Sample file removed');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to remove file');
    } finally {
      setRemovingSample((s) => { const n = new Set(s); n.delete(fileId); return n; });
    }
  };

  // ── Sample: remove pending ──────────────────────────────────────────────
  const handleRemovePendingSample = (localId) => {
    onChange({ sampleFiles: pendingSampleFiles.filter((f) => f.localId !== localId) });
  };

  // ── Auto-upload pending files when partnerId becomes available ──────────
  React.useEffect(() => {
    if (!partnerId) return;
    pendingSpecFiles.forEach((pf) => {
      if (!pf.file) return;
      handleSelectSpec(pf.file);
    });
    pendingSampleFiles.forEach((pf) => {
      if (!pf.file) return;
      handleSelectSample(pf.file);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  // ── Schema analysis ─────────────────────────────────────────────────────
  const handleAnalyzeSchema = async () => {
    const sourceSchema = { segments: [], document_type: data.ediStandard || 'X12 850' };
    const firstPending = pendingSampleFiles[0];
    if (firstPending?.file) {
      try {
        const text = await firstPending.file.text();
        const matches = text.match(/[A-Z]{2,4}\*/g) || [];
        sourceSchema.segments = [...new Set(matches.map((s) => s.replace('*', '')))];
      } catch {
        sourceSchema.segments = ['ISA', 'GS', 'ST', 'BEG', 'N1', 'IT1', 'SE', 'GE', 'IEA'];
      }
    } else {
      sourceSchema.segments = ['ISA', 'GS', 'ST', 'BEG', 'N1', 'IT1', 'SE', 'GE', 'IEA'];
    }
    setAnalyzing(true);
    try {
      const res = await api.post('/ai/analyze-schema', {
        source_schema: sourceSchema,
        target_schema: { fields: ['purchase_order_number', 'buyer_name', 'line_items', 'product_code', 'quantity'] },
        document_type: data.ediStandard || '850',
      });
      setSchemaAnalysis(res.data.analysis);
      onChange({ schemaAnalysis: res.data.analysis });
    } catch (e) {
      setSchemaAnalysis({ notes: 'Analysis failed: ' + (e.response?.data?.detail || e.message) });
    } finally {
      setAnalyzing(false);
    }
  };

  const totalFiles = savedSpecFiles.length + pendingSpecFiles.length +
                     savedSampleFiles.length + pendingSampleFiles.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Partner Specifications</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Upload specification documents (PDF) that describe how this partner formats EDI, and sample
          EDI files used for AI training and validation. Multiple files are supported for each category.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* ── Spec files ── */}
        <MultiFileSection
          label="Specification Documents"
          description="PDF / DOC guides describing the partner's EDI implementation"
          accept=".pdf,.doc,.docx"
          acceptLabel="PDF, DOC, DOCX · max 20 MB each"
          icon={FileBadge}
          accentColor="var(--mdb-green)"
          savedFiles={savedSpecFiles}
          pendingFiles={pendingSpecFiles}
          uploading={uploadingSpec}
          removingIds={removingSpec}
          uploadError={specError}
          partnerId={partnerId}
          onSelect={handleSelectSpec}
          onRemoveSaved={handleRemoveSavedSpec}
          onRemovePending={handleRemovePendingSpec}
          onDownload={(fileId) =>
            window.open(partnersService.getFileDownloadUrl(partnerId, 'spec', fileId), '_blank')}
        />

        {/* ── Sample EDI files ── */}
        <MultiFileSection
          label="Sample EDI Files"
          description=".edi transaction files used for AI training and format validation"
          accept=".edi,.txt,.x12"
          acceptLabel=".edi, .txt, .x12 · max 10 MB each"
          icon={FileIcon}
          accentColor="var(--status-info-text)"
          savedFiles={savedSampleFiles}
          pendingFiles={pendingSampleFiles}
          uploading={uploadingSample}
          removingIds={removingSample}
          uploadError={sampleError}
          partnerId={partnerId}
          onSelect={handleSelectSample}
          onRemoveSaved={handleRemoveSavedSample}
          onRemovePending={handleRemovePendingSample}
          onDownload={(fileId) =>
            window.open(partnersService.getFileDownloadUrl(partnerId, 'sample', fileId), '_blank')}
        />
      </div>

      {/* ── Exception rules ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Exception Rules & Notes</CardTitle>
          <CardDescription>Document special rules, non-standard formats, or partner-specific quirks</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={data.exceptionRules || ''}
            onChange={(e) => onChange({ exceptionRules: e.target.value })}
            placeholder="Example: Partner uses non-standard date format YYYYMMDD instead of YYYY-MM-DD..."
            rows={5}
            className="font-mono text-sm"
          />
        </CardContent>
      </Card>

      {/* ── Schema analysis ── */}
      {totalFiles > 0 && (
        <Card className="bg-[var(--bg-elevated)] border-[var(--border)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Brain className="w-4 h-4 text-[var(--mdb-green)]" />
              Schema Understanding Agent
            </CardTitle>
            <CardDescription>
              AI analyses uploaded sample files vs target schema. Review before use.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleAnalyzeSchema} disabled={analyzing} variant="outline" size="sm" className="gap-2">
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              {analyzing ? 'Analysing…' : 'Analyse Schema with AI'}
            </Button>
            {schemaAnalysis && (
              <div className="text-sm space-y-1 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-base)]">
                {schemaAnalysis.notes && <p className="text-[var(--text-secondary)]">{schemaAnalysis.notes}</p>}
                {schemaAnalysis.mapping_complexity && (
                  <p className="text-[var(--text-primary)]">
                    <span className="text-[var(--text-secondary)]">Complexity: </span>
                    {schemaAnalysis.mapping_complexity}
                  </p>
                )}
                {schemaAnalysis.canonical_suggestions?.length > 0 && (
                  <p className="text-[var(--text-primary)]">
                    <span className="text-[var(--text-secondary)]">Suggestions: </span>
                    {schemaAnalysis.canonical_suggestions
                      .map((s) => (typeof s === 'string' ? s : s?.name || JSON.stringify(s)))
                      .join(', ')}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
