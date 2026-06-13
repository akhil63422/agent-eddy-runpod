import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, FileCheck, Zap, CheckCircle2, AlertTriangle, ArrowRight, ChevronDown, ChevronRight, RotateCcw, X, Download, Search } from 'lucide-react';
import api from '@/services/api';
import { partnersService } from '@/services/partners';

const SYSTEMS = [
  { value: '', label: 'Auto-detect', desc: 'Detect from file extension and content' },
  { value: 'biztalk', label: 'Microsoft BizTalk', desc: '.btm XML maps with functoid links' },
  { value: 'cleo', label: 'Cleo CIC', desc: 'JSON pipeline transforms' },
  { value: 'sterling', label: 'IBM Sterling', desc: '.mxl XML translation maps' },
  { value: 'sps_csv', label: 'SPS Commerce', desc: 'CSV field mapping sheets' },
];

const STEPS = [
  { num: 1, label: 'Upload Map File', icon: Upload },
  { num: 2, label: 'Select Partner', icon: Search },
  { num: 3, label: 'Review Translations', icon: FileCheck },
  { num: 4, label: 'Activate Rules', icon: Zap },
];

export default function Migration() {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [sourceSystem, setSourceSystem] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [docType, setDocType] = useState('');
  const [partners, setPartners] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activateResult, setActivateResult] = useState(null);
  const [editedMappings, setEditedMappings] = useState([]);
  const [filterConfidence, setFilterConfidence] = useState('all'); // all, high, low
  const [history, setHistory] = useState([]);
  const fileRef = useRef(null);

  // Load partners list (use same URL as Partner Portal: /partners/?skip&limit — bare /partners often 404s on FastAPI)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await partnersService.getAll({ limit: 500 });
        if (!cancelled) setPartners(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) {
          setPartners([]);
          const msg = e?.response?.data?.detail || e?.message || 'Could not load partners';
          setError(typeof msg === 'string' ? msg : 'Could not load partners');
        }
      }
      try {
        const r = await api.get('migration/history');
        if (!cancelled) setHistory(Array.isArray(r?.data) ? r.data : []);
      } catch {
        /* history is optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) { setFile(f); setError(''); }
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (sourceSystem) fd.append('source_system', sourceSystem);
      if (partnerId) fd.append('partner_id', partnerId);
      if (docType) fd.append('doc_type', docType);

      const res = await api.post('/migration/import', fd);
      const data = res?.data;
      if (data?.errors?.length) {
        setError(data.errors.join('; '));
      }
      setResult(data);
      setEditedMappings((data?.mappings || []).map(m => ({ ...m, approved: m.confidence >= 0.9 })));
      setStep(3);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    if (!result || !partnerId) return;
    setLoading(true);
    try {
      const approved = editedMappings.filter(m => m.approved && !m.target_field.startsWith('unmapped'));
      const res = await api.post('/migration/activate', {
        import_id: result.import_id,
        partner_id: partnerId,
        doc_type: docType || null,
        mappings: approved,
      });
      setActivateResult(res?.data);
      setStep(4);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Activation failed');
    } finally {
      setLoading(false);
    }
  };

  const toggleApproval = (idx) => {
    setEditedMappings(prev => prev.map((m, i) => i === idx ? { ...m, approved: !m.approved } : m));
  };

  const updateTarget = (idx, newTarget) => {
    setEditedMappings(prev => prev.map((m, i) => i === idx ? { ...m, target_field: newTarget, confidence: 1.0, approved: true } : m));
  };

  const reset = () => {
    setStep(1); setFile(null); setResult(null); setActivateResult(null);
    setEditedMappings([]); setError(''); setDocType('');
  };

  const filteredMappings = editedMappings.filter(m => {
    if (filterConfidence === 'high') return m.confidence >= 0.9;
    if (filterConfidence === 'low') return m.confidence < 0.9;
    return true;
  });

  const approvedCount = editedMappings.filter(m => m.approved && !m.target_field.startsWith('unmapped')).length;
  const reviewCount = editedMappings.filter(m => m.confidence < 0.9).length;

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[var(--text-primary)] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-1">Migration Wizard</h1>
          <p className="text-[var(--text-secondary)]">Import field mappings from BizTalk, Cleo, Sterling, or SPS Commerce</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = step >= s.num;
            const current = step === s.num;
            return (
              <React.Fragment key={s.num}>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${current ? 'bg-[var(--bg-subtle)] border border-[var(--border-focus)] text-[var(--text-primary)]' : active ? 'bg-[var(--bg-subtle)] text-[var(--status-success-text)]' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'}`}>
                  {active && step > s.num ? <CheckCircle2 size={16} className="text-[var(--status-success-text)]" /> : <Icon size={16} />}
                  <span className="text-sm font-medium">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <ArrowRight size={14} className="text-[var(--text-muted)]" />}
              </React.Fragment>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-[var(--status-error-text)] text-sm">
            <AlertTriangle size={16} /> {error}
            <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
          </div>
        )}

        {/* ── STEP 1 & 2: Upload + Partner Selection ──────────────── */}
        {step <= 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Upload Panel */}
            <div className="lg:col-span-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-sm p-6">
              <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Step 1 — Upload Legacy Map File</h2>

              <div
                className={`border-2 border-dashed rounded-sm p-10 text-center transition-colors cursor-pointer ${file ? 'border-[var(--status-success)] bg-[var(--bg-subtle)]' : 'border-[var(--border)] hover:border-[var(--border-focus)] hover:bg-[var(--bg-subtle)]'}`}
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".btm,.mxl,.json,.csv,.tsv,.xml" className="hidden" onChange={e => { setFile(e.target.files?.[0]); setError(''); }} />
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileCheck size={40} className="text-[var(--status-success-text)]" />
                    <p className="font-medium text-[var(--status-success-text)]">{file.name}</p>
                    <p className="text-sm text-[var(--text-muted)]">{(file.size / 1024).toFixed(1)} KB</p>
                    <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-xs text-[var(--text-secondary)] hover:text-[var(--status-error-text)] mt-1">Remove</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload size={40} className="text-[var(--text-muted)]" />
                    <p className="text-[var(--text-secondary)]">Drag & drop your map file here</p>
                    <p className="text-xs text-[var(--text-muted)]">.btm (BizTalk) · .mxl (Sterling) · .json (Cleo) · .csv (SPS)</p>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label className="text-sm text-[var(--text-secondary)] block mb-1">Source System</label>
                <select value={sourceSystem} onChange={e => setSourceSystem(e.target.value)}
                  className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
                  {SYSTEMS.map(s => <option key={s.value} value={s.value}>{s.label} — {s.desc}</option>)}
                </select>
              </div>

              <div className="mt-4">
                <label className="text-sm text-[var(--text-secondary)] block mb-1">Document Type (optional)</label>
                <select value={docType} onChange={e => setDocType(e.target.value)}
                  className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
                  <option value="">All document types</option>
                  {['850','810','855','856','820','997'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Partner Selection Panel */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-sm p-6">
              <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Step 2 — Select Partner</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-4">Choose which trading partner this map applies to.</p>

              <select value={partnerId} onChange={e => setPartnerId(e.target.value)}
                className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] mb-4">
                <option value="">Select a partner...</option>
                {partners.map((p) => {
                  const pid = p.id || p._id;
                  if (!pid) return null;
                  return (
                  <option key={pid} value={String(pid)}>
                    {p.business_name || p.partner_code} {p.role ? `(${p.role})` : ''}
                  </option>
                  );
                })}
              </select>

              <button
                onClick={handleUpload}
                disabled={!file || !partnerId || loading}
                className={`w-full py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${!file || !partnerId || loading ? 'bg-[var(--bg-surface)] text-[var(--text-muted)] cursor-not-allowed' : 'bg-primary hover:bg-primary text-[var(--text-primary)]'}`}
              >
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Parsing...</>
                ) : (
                  <><Zap size={16} /> Parse & Translate</>
                )}
              </button>

              {/* History */}
              {history.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase mb-2">Recent Imports</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {history.slice(0, 5).map(h => (
                      <div key={h.id} className="p-2 bg-[var(--bg-subtle)] rounded text-xs">
                        <div className="text-[var(--text-primary)] font-medium">{h.filename}</div>
                        <div className="text-[var(--text-muted)]">{h.source_system} · {h.total_mappings} mappings · {h.created_at?.split('T')[0]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Review Translations ─────────────────────────── */}
        {step === 3 && result && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Step 3 — Review AI Translations</h2>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  {result.source_system} · {result.filename} · {result.total_mappings} mappings
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="px-3 py-1 bg-[var(--bg-subtle)] text-[var(--status-success-text)] rounded-full">{result.auto_translated} auto-translated</span>
                {result.needs_review > 0 && <span className="px-3 py-1 bg-amber-500/10 text-[var(--status-warn-text)] rounded-full">{result.needs_review} need review</span>}
              </div>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2 mb-4">
              {['all', 'high', 'low'].map(f => (
                <button key={f} onClick={() => setFilterConfidence(f)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filterConfidence === f ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border)]' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'}`}>
                  {f === 'all' ? `All (${editedMappings.length})` : f === 'high' ? `Auto ✅ (${editedMappings.filter(m=>m.confidence>=0.9).length})` : `Review ⚠️ (${reviewCount})`}
                </button>
              ))}
            </div>

            {/* Mapping Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-secondary)] text-xs uppercase">
                    <th className="text-left py-2 px-2 w-8">✓</th>
                    <th className="text-left py-2 px-2">Source (Legacy)</th>
                    <th className="text-left py-2 px-2">→</th>
                    <th className="text-left py-2 px-2">Target (Agent Eddy Canonical)</th>
                    <th className="text-center py-2 px-2">Transform</th>
                    <th className="text-center py-2 px-2">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMappings.map((m, i) => {
                    const realIdx = editedMappings.indexOf(m);
                    const isLow = m.confidence < 0.9;
                    const isUnmapped = m.target_field.startsWith('unmapped');
                    return (
                      <tr key={i} className={`border-b border-[var(--border-subtle)]/50 ${isUnmapped ? 'bg-red-500/5' : isLow ? 'bg-amber-500/5' : ''}`}>
                        <td className="py-2 px-2">
                          <input type="checkbox" checked={m.approved} onChange={() => toggleApproval(realIdx)}
                            className="accent-[var(--text-primary)]" />
                        </td>
                        <td className="py-2 px-2">
                          <code className="text-[var(--text-primary)] text-xs">{m.source_segment}{m.source_element ? `[${m.source_element}]` : ''}</code>
                          {m.raw_source_path && <div className="text-[10px] text-[var(--text-muted)] truncate max-w-xs">{m.raw_source_path}</div>}
                        </td>
                        <td className="py-2 px-2 text-[var(--text-muted)]">→</td>
                        <td className="py-2 px-2">
                          <input type="text" value={m.target_field}
                            onChange={e => updateTarget(realIdx, e.target.value)}
                            className={`bg-transparent border-b w-full text-xs py-1 ${isUnmapped ? 'border-red-500/50 text-[var(--status-error-text)]' : 'border-[var(--border)] text-[var(--status-success-text)]'} focus:border-[#444444] focus:outline-none`}
                          />
                          {m.raw_target_path && !isUnmapped && <div className="text-[10px] text-[var(--text-muted)] truncate max-w-xs">{m.raw_target_path}</div>}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className="text-xs text-[var(--text-muted)]">{m.transform}</span>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`text-xs font-medium ${m.confidence >= 0.9 ? 'text-[var(--status-success-text)]' : m.confidence >= 0.5 ? 'text-[var(--status-warn-text)]' : 'text-[var(--status-error-text)]'}`}>
                            {Math.round(m.confidence * 100)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--border-subtle)]">
              <button onClick={reset} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <RotateCcw size={14} /> Start Over
              </button>
              <div className="flex items-center gap-4">
                <span className="text-sm text-[var(--text-secondary)]">{approvedCount} of {editedMappings.length} approved</span>
                <button onClick={handleActivate} disabled={approvedCount === 0 || loading}
                  className={`px-6 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${approvedCount === 0 || loading ? 'bg-[var(--bg-surface)] text-[var(--text-muted)]' : 'bg-primary hover:bg-[var(--primary-hover)] text-primary-foreground'}`}>
                  {loading ? 'Activating...' : <><CheckCircle2 size={16} /> Activate {approvedCount} Rules</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: Activation Complete ─────────────────────────── */}
        {step === 4 && activateResult && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-sm p-8 text-center">
            <CheckCircle2 size={56} className="text-[var(--status-success-text)] mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Migration Complete</h2>
            <p className="text-[var(--text-secondary)] mb-6">
              {activateResult.rules_created} new symbolic rules created
              {activateResult.rules_updated > 0 && `, ${activateResult.rules_updated} existing rules updated`}
            </p>

            <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mb-8">
              <div className="bg-[var(--bg-subtle)] rounded-lg p-4">
                <div className="text-2xl font-bold text-[var(--status-success-text)]">{activateResult.total_activated}</div>
                <div className="text-xs text-[var(--text-muted)]">Total Activated</div>
              </div>
              <div className="bg-[var(--bg-subtle)] rounded-lg p-4">
                <div className="text-2xl font-bold text-[var(--text-primary)]">{activateResult.rules_created}</div>
                <div className="text-xs text-[var(--text-muted)]">New Rules</div>
              </div>
              <div className="bg-[var(--bg-subtle)] rounded-lg p-4">
                <div className="text-2xl font-bold text-[var(--status-warn-text)]">{activateResult.rules_updated}</div>
                <div className="text-xs text-[var(--text-muted)]">Updated</div>
              </div>
            </div>

            <p className="text-sm text-[var(--text-secondary)] mb-6">
              These field mappings are now permanent symbolic rules in Agent Eddy's pipeline.
              The LLM will never be called for these field+partner combinations again.
            </p>

            <div className="flex items-center justify-center gap-4">
              <button onClick={reset} className="px-6 py-2.5 bg-primary hover:bg-primary text-[var(--text-primary)] rounded-lg font-medium text-sm">
                Import Another Map
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
