'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ProcessResult, OutboundResult, PartnerProfile } from './types'
import PipelineSteps from './components/PipelineSteps'
import ConfidenceBadge from './components/ConfidenceBadge'
import JsonPanel from './components/JsonPanel'
import EdiPanel from './components/EdiPanel'
import MappingExplanations from './components/MappingExplanations'
import HitlCorrection from './components/HitlCorrection'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8002'

const OUTBOUND_SKILLS_BY_TYPE: Record<string, string[]> = {
  PURCHASE_ORDER: ['type_detector', 'po_validator', 'x12_builder', 'envelope_wrapper'],
  SHIPMENT_NOTICE: ['type_detector', 'asn_validator', 'x12_builder', 'envelope_wrapper'],
  INVOICE: ['type_detector', 'invoice_validator', 'x12_builder', 'envelope_wrapper'],
  default: ['type_detector', 'po_validator', 'x12_builder', 'envelope_wrapper'],
}

const INBOUND_SAMPLES: Record<string, string> = {
  'X12 850': `ISA*00*          *00*          *ZZ*BUYER001       *ZZ*SUPPLIER01     *230101*1200*^*00501*000000001*0*P*>~GS*PO*BUYER001*SUPPLIER01*20230101*1200*1*X*005010~ST*850*0001~BEG*00*NE*PO-12345**20230101~N1*BY*ACME CORP~N1*SE*WIDGET CO~PO1*1*10*EA*25.00**VP*WIDGET-100~TDS*25000~SE*8*0001~GE*1*1~IEA*1*000000001~`,
  'JSON PO': JSON.stringify({
    transaction_type: 'PURCHASE_ORDER',
    po_number: 'PO-9981',
    buyer: 'Globex Corp',
    supplier: 'Initech Ltd',
    items: [{ description: 'Server Rack', quantity: 2, unit_price: 4500, product_id: 'SRV-001' }],
    total_amount: 9000,
    currency: 'USD',
  }, null, 2),
  'CSV PO': `po_number,buyer,supplier,product_id,quantity,unit_price\nPO-7732,MegaMart,FastShip Inc,ITEM-44,50,12.50`,
  Email: `Hi team,\n\nPlease process the following purchase order:\n- PO Number: PO-2024-881\n- Buyer: Acme Corporation\n- Supplier: Parts Direct LLC\n- Item: Industrial Valve Model IV-7, Qty: 20, Unit Price: $340\n- Total: $6,800\n- Required delivery: 2024-02-15\n\nThanks`,
}

const OUTBOUND_SAMPLES: Record<string, string> = {
  '850 PO': JSON.stringify({
    po_number: 'PO-5001',
    buyer: 'ACME CORP',
    buyer_id: 'BUYER001',
    supplier: 'WIDGET CO',
    supplier_id: 'SUPPLIER01',
    document_date: '20230101',
    items: [
      { product_id: 'WIDGET-100', description: 'Blue Widget', quantity: 10, unit: 'EA', unit_price: 25.00 },
      { product_id: 'WIDGET-200', description: 'Red Widget', quantity: 5, unit: 'EA', unit_price: 40.00 },
    ],
    total_amount: 450.00,
    currency: 'USD',
  }, null, 2),
  '856 ASN': JSON.stringify({
    shipment_id: 'SHP-9001',
    ship_date: '2024-03-15',
    buyer: 'ACME CORP',
    buyer_id: 'BUYER001',
    supplier: 'WIDGET CO',
    supplier_id: 'SUPPLIER01',
    carrier: 'FEDEX',
    tracking_number: '7749123456',
    items: [
      { product_id: 'WIDGET-100', description: 'Blue Widget', quantity: 10, unit: 'EA' },
      { product_id: 'WIDGET-200', description: 'Red Widget', quantity: 5, unit: 'EA' },
    ],
  }, null, 2),
  '810 Invoice': JSON.stringify({
    invoice_number: 'INV-2024-001',
    invoice_date: '2024-03-20',
    po_number: 'PO-5001',
    buyer: 'ACME CORP',
    buyer_id: 'BUYER001',
    supplier: 'WIDGET CO',
    supplier_id: 'SUPPLIER01',
    payment_terms: 'NET30',
    items: [
      { product_id: 'WIDGET-100', description: 'Blue Widget', quantity: 10, unit: 'EA', unit_price: 25.00 },
      { product_id: 'WIDGET-200', description: 'Red Widget', quantity: 5, unit: 'EA', unit_price: 40.00 },
    ],
    total_amount: 450.00,
    currency: 'USD',
  }, null, 2),
}

const DOC_TYPES = ['850', '855', '856', '810', '860', '997']

export default function Home() {
  const [activeTab, setActiveTab] = useState<'inbound' | 'outbound' | 'partners'>('inbound')

  // Inbound state
  const [inInput, setInInput] = useState('')
  const [inLoading, setInLoading] = useState(false)
  const [inError, setInError] = useState('')
  const [inResult, setInResult] = useState<ProcessResult | null>(null)
  const [corrected, setCorrected] = useState(false)
  const [inFileName, setInFileName] = useState('')
  const [inDragOver, setInDragOver] = useState(false)
  const inFileRef = useRef<HTMLInputElement>(null)

  // Outbound state
  const [outInput, setOutInput] = useState('')
  const [outLoading, setOutLoading] = useState(false)
  const [outError, setOutError] = useState('')
  const [outResult, setOutResult] = useState<OutboundResult | null>(null)
  const [outFileName, setOutFileName] = useState('')
  const [outDragOver, setOutDragOver] = useState(false)
  const [sourceParnter, setSourcePartner] = useState('')
  const [destPartner, setDestPartner] = useState('')
  const outFileRef = useRef<HTMLInputElement>(null)

  // Partners state
  const [partners, setPartners] = useState<PartnerProfile[]>([])
  const [partnerLoading, setPartnerLoading] = useState(false)
  const [partnerError, setPartnerError] = useState('')
  const [partnerSaving, setPartnerSaving] = useState(false)
  const [partnerForm, setPartnerForm] = useState({
    partner_id: '', partner_name: '', isa_qualifier: 'ZZ', isa_id: '',
    gs_id: '', edi_version: '005010', transport: '', van_provider: '', notes: '',
    document_agreements: [] as string[],
  })

  useEffect(() => {
    if (activeTab === 'partners') fetchPartners()
  }, [activeTab])

  async function fetchPartners() {
    setPartnerLoading(true); setPartnerError('')
    try {
      const res = await fetch(`${API}/api/v1/partners`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setPartners(await res.json())
    } catch (e) {
      setPartnerError(String(e))
    } finally {
      setPartnerLoading(false)
    }
  }

  async function savePartner() {
    if (!partnerForm.partner_id || !partnerForm.partner_name || !partnerForm.isa_id) return
    setPartnerSaving(true); setPartnerError('')
    try {
      const payload = {
        ...partnerForm,
        gs_id: partnerForm.gs_id || null,
        transport: partnerForm.transport || null,
        van_provider: partnerForm.van_provider || null,
        notes: partnerForm.notes || null,
        document_agreements: partnerForm.document_agreements.map(t => ({ type: t, enabled: true })),
      }
      const res = await fetch(`${API}/api/v1/partners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail ?? `Server error ${res.status}`)
      }
      setPartnerForm({ partner_id: '', partner_name: '', isa_qualifier: 'ZZ', isa_id: '', gs_id: '', edi_version: '005010', transport: '', van_provider: '', notes: '', document_agreements: [] })
      await fetchPartners()
    } catch (e) {
      setPartnerError(String(e))
    } finally {
      setPartnerSaving(false)
    }
  }

  async function deletePartner(partnerId: string) {
    await fetch(`${API}/api/v1/partners/${partnerId}`, { method: 'DELETE' })
    await fetchPartners()
  }

  function switchTab(tab: 'inbound' | 'outbound' | 'partners') {
    setActiveTab(tab)
  }

  function readFile(file: File, setter: (v: string) => void, nameSetter: (v: string) => void) {
    nameSetter(file.name)
    const reader = new FileReader()
    reader.onload = (e) => setter(e.target?.result as string ?? '')
    reader.readAsText(file)
  }

  const onInDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setInDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) readFile(file, setInInput, setInFileName)
  }, [])

  const onOutDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setOutDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) readFile(file, setOutInput, setOutFileName)
  }, [])

  async function runInbound() {
    if (!inInput.trim()) return
    setInLoading(true); setInError(''); setInResult(null); setCorrected(false)
    try {
      const res = await fetch(`${API}/api/v1/inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_document: inInput }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}: ${await res.text()}`)
      setInResult(await res.json())
    } catch (e) {
      setInError(String(e))
    } finally {
      setInLoading(false)
    }
  }

  async function runOutbound() {
    if (!outInput.trim()) return
    setOutLoading(true); setOutError(''); setOutResult(null)
    try {
      const res = await fetch(`${API}/api/v1/outbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_document: outInput,
          source_partner: sourceParnter,
          destination_partner: destPartner,
        }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}: ${await res.text()}`)
      setOutResult(await res.json())
    } catch (e) {
      setOutError(String(e))
    } finally {
      setOutLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">

      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 font-mono font-bold text-lg tracking-tight">AGENT EDDY</span>
          <span className="text-zinc-600 font-mono text-xs">|</span>
          <span className="text-zinc-500 font-mono text-xs">Transaction Intelligence Platform</span>
        </div>
        <div className="font-mono text-xs text-zinc-600">
          {activeTab === 'inbound' && inResult && (
            <>doc: <span className="text-zinc-400">{inResult.document_id.slice(0, 8)}…</span></>
          )}
          {activeTab === 'outbound' && outResult && (
            <>doc: <span className="text-zinc-400">{outResult.document_id.slice(0, 8)}…</span></>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <div className="border-b border-zinc-800 px-6 py-2 flex items-center gap-2 shrink-0">
        {([['inbound', '← inbound'], ['outbound', 'outbound →'], ['partners', '⚙ partners']] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => switchTab(tab)}
            className={`text-xs font-mono px-3 py-1 rounded border transition-colors ${
              activeTab === tab
                ? 'border-emerald-600 text-emerald-400 bg-emerald-950'
                : 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="text-zinc-700 font-mono text-xs ml-2">
          {activeTab === 'inbound' && 'X12 / JSON / CSV / Email → canonical + ERP payload'}
          {activeTab === 'outbound' && 'JSON PO / ASN / Invoice → X12 850 / 856 / 810'}
          {activeTab === 'partners' && 'manage trading partner profiles'}
        </span>
      </div>

      {/* Pipeline strip */}
      {activeTab === 'inbound' && inResult && (
        <div className="border-b border-zinc-800 px-6 py-2 bg-zinc-900 shrink-0">
          <PipelineSteps completed={inResult.completed_skills} status={inResult.final_status} />
        </div>
      )}
      {activeTab === 'outbound' && outResult && (
        <div className="border-b border-zinc-800 px-6 py-2 bg-zinc-900 shrink-0">
          <PipelineSteps
            completed={outResult.completed_skills}
            status={outResult.final_status}
            skills={OUTBOUND_SKILLS_BY_TYPE[outResult.transaction_type] ?? OUTBOUND_SKILLS_BY_TYPE.default}
          />
        </div>
      )}

      {/* ── INBOUND TAB ── */}
      {activeTab === 'inbound' && (
        <main className="flex-1 grid grid-cols-3 divide-x divide-zinc-800 overflow-hidden">

          {/* LEFT — Raw Input */}
          <section className="flex flex-col p-4 gap-3 overflow-auto">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500">raw input</div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => inFileRef.current?.click()}
                className="text-xs font-mono px-2 py-0.5 rounded border border-zinc-600 text-zinc-300 hover:border-emerald-600 hover:text-emerald-400 transition-colors flex items-center gap-1"
              >
                ↑ upload file
              </button>
              <input
                ref={inFileRef} type="file" accept=".edi,.x12,.txt,.json,.csv,.xml" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, setInInput, setInFileName) }}
              />
              <span className="text-zinc-700 text-xs font-mono">or samples:</span>
              {Object.keys(INBOUND_SAMPLES).map((label) => (
                <button key={label} onClick={() => { setInInput(INBOUND_SAMPLES[label]); setInFileName('') }}
                  className="text-xs font-mono px-2 py-0.5 rounded border border-zinc-700 text-zinc-500 hover:border-emerald-700 hover:text-emerald-400 transition-colors"
                >{label}</button>
              ))}
            </div>
            <div
              className={`flex-1 flex flex-col min-h-64 rounded border transition-colors ${inDragOver ? 'border-emerald-500 bg-emerald-950/20' : 'border-zinc-800'}`}
              onDrop={onInDrop} onDragOver={(e) => { e.preventDefault(); setInDragOver(true) }} onDragLeave={() => setInDragOver(false)}
            >
              {inDragOver ? (
                <div className="flex-1 flex items-center justify-center text-emerald-400 font-mono text-xs">drop file here</div>
              ) : (
                <textarea
                  className="flex-1 bg-zinc-900 rounded p-3 text-xs font-mono text-zinc-300 resize-none focus:outline-none placeholder-zinc-700"
                  placeholder="Paste X12, JSON, CSV, freeform text — or drag & drop a file…"
                  value={inInput} onChange={(e) => { setInInput(e.target.value); setInFileName('') }} spellCheck={false}
                />
              )}
            </div>
            {inFileName && (
              <div className="text-xs font-mono text-zinc-500 flex items-center gap-1">
                <span className="text-emerald-600">↑</span> {inFileName}
                <button onClick={() => { setInFileName(''); setInInput('') }} className="ml-auto text-zinc-700 hover:text-zinc-400">✕</button>
              </div>
            )}
            {inError && <div className="text-xs font-mono text-red-400 border border-red-800 rounded p-2">{inError}</div>}
            <button onClick={runInbound} disabled={inLoading || !inInput.trim()}
              className="w-full py-2 font-mono text-sm rounded border border-emerald-700 text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {inLoading ? <span className="animate-pulse">processing…</span> : '▶  run pipeline'}
            </button>
          </section>

          {/* CENTER — Canonical Event */}
          <section className="flex flex-col p-4 gap-3 overflow-auto">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500">canonical event</div>
            {inResult ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {([['type', inResult.transaction_type], ['format', inResult.source_format], ['from', inResult.source_partner], ['to', inResult.destination_partner]] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="bg-zinc-900 border border-zinc-800 rounded p-2">
                      <div className="text-xs text-zinc-600 font-mono">{k}</div>
                      <div className="text-xs text-zinc-200 font-mono font-semibold truncate">{v || '—'}</div>
                    </div>
                  ))}
                </div>
                <div className="flex-1 min-h-0"><JsonPanel label="" data={inResult.canonical_event} /></div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-zinc-700 font-mono text-xs">awaiting document…</span>
              </div>
            )}
          </section>

          {/* RIGHT — ERP Payload */}
          <section className="flex flex-col p-4 gap-3 overflow-auto">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500">erp payload</div>
            {inResult ? (
              <>
                <ConfidenceBadge score={inResult.confidence_score} status={corrected ? 'COMPLETED' : inResult.final_status} />
                {inResult.validation_errors.length > 0 && (
                  <div className="border border-red-800 rounded p-2 space-y-1">
                    {inResult.validation_errors.map((e, i) => (
                      <div key={i} className="text-xs font-mono text-red-400">✗ {e}</div>
                    ))}
                  </div>
                )}
                {inResult.hitl_required && !corrected ? (
                  <HitlCorrection documentId={inResult.document_id} currentPayload={inResult.mapped_payload} onCorrected={() => setCorrected(true)} />
                ) : (
                  <div className="flex-1 min-h-0"><JsonPanel label="" data={inResult.mapped_payload} /></div>
                )}
                <MappingExplanations explanations={inResult.mapping_explanations} unmapped={inResult.unmapped_fields} />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-zinc-700 font-mono text-xs">awaiting mapping…</span>
              </div>
            )}
          </section>
        </main>
      )}

      {/* ── PARTNERS TAB ── */}
      {activeTab === 'partners' && (
        <main className="flex-1 grid grid-cols-2 divide-x divide-zinc-800 overflow-hidden">

          {/* LEFT — Add partner form */}
          <section className="flex flex-col p-4 gap-3 overflow-auto">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500">add partner</div>

            <div className="grid grid-cols-2 gap-2">
              {[
                ['partner_id', 'Partner ID *', 'e.g. ACME001'],
                ['partner_name', 'Partner Name *', 'e.g. Acme Retail Corp'],
                ['isa_id', 'ISA ID *', '15 chars max'],
                ['isa_qualifier', 'ISA Qualifier', 'ZZ'],
                ['gs_id', 'GS ID', 'defaults to ISA ID'],
                ['edi_version', 'EDI Version', '005010'],
                ['transport', 'Transport', 'SFTP | VAN | AS2 | API'],
                ['van_provider', 'VAN Provider', 'SPS | TrueCommerce'],
              ].map(([field, label, placeholder]) => (
                <div key={field} className="flex flex-col gap-1">
                  <label className="text-xs font-mono text-zinc-600">{label}</label>
                  <input
                    className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-300 focus:outline-none focus:border-emerald-700 placeholder-zinc-700"
                    placeholder={placeholder}
                    value={(partnerForm as unknown as Record<string, string>)[field] ?? ''}
                    onChange={(e) => setPartnerForm(f => ({ ...f, [field]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono text-zinc-600">Document Agreements</label>
              <div className="flex flex-wrap gap-2">
                {DOC_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-emerald-500"
                      checked={partnerForm.document_agreements.includes(type)}
                      onChange={(e) => setPartnerForm(f => ({
                        ...f,
                        document_agreements: e.target.checked
                          ? [...f.document_agreements, type]
                          : f.document_agreements.filter(t => t !== type),
                      }))}
                    />
                    <span className="text-xs font-mono text-zinc-400">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono text-zinc-600">Notes</label>
              <textarea
                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-300 focus:outline-none focus:border-emerald-700 placeholder-zinc-700 resize-none h-16"
                placeholder="Optional notes…"
                value={partnerForm.notes}
                onChange={(e) => setPartnerForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>

            {partnerError && <div className="text-xs font-mono text-red-400 border border-red-800 rounded p-2">{partnerError}</div>}

            <button
              onClick={savePartner}
              disabled={partnerSaving || !partnerForm.partner_id || !partnerForm.partner_name || !partnerForm.isa_id}
              className="w-full py-2 font-mono text-sm rounded border border-emerald-700 text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {partnerSaving ? <span className="animate-pulse">saving…</span> : '+ add partner'}
            </button>
          </section>

          {/* RIGHT — Partner list */}
          <section className="flex flex-col p-4 gap-3 overflow-auto">
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono uppercase tracking-widest text-zinc-500">partners ({partners.length})</div>
              <button onClick={fetchPartners} className="text-xs font-mono text-zinc-600 hover:text-zinc-400 transition-colors">↻ refresh</button>
            </div>

            {partnerLoading && <div className="text-xs font-mono text-zinc-600 animate-pulse">loading…</div>}

            {partners.length === 0 && !partnerLoading && (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-zinc-700 font-mono text-xs">no partners yet — add one</span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {partners.map((p) => (
                <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono text-zinc-200 font-semibold">{p.partner_name}</span>
                      <span className="ml-2 text-xs font-mono text-zinc-500">{p.partner_id}</span>
                    </div>
                    <button
                      onClick={() => deletePartner(p.partner_id)}
                      className="text-xs font-mono text-zinc-700 hover:text-red-400 transition-colors"
                    >✕</button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      ['ISA', `${p.isa_qualifier}/${p.isa_id}`],
                      ['Version', p.edi_version],
                      ['Transport', p.transport ?? '—'],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div className="text-zinc-600 font-mono text-xs">{k}</div>
                        <div className="text-zinc-400 font-mono text-xs truncate">{v}</div>
                      </div>
                    ))}
                  </div>
                  {p.document_agreements.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.document_agreements.map((a) => (
                        <span key={a.type} className={`text-xs font-mono px-1.5 py-0.5 rounded border ${a.enabled ? 'border-emerald-700 text-emerald-500' : 'border-zinc-700 text-zinc-600'}`}>
                          {a.type}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </main>
      )}

      {/* ── OUTBOUND TAB ── */}
      {activeTab === 'outbound' && (
        <main className="flex-1 grid grid-cols-2 divide-x divide-zinc-800 overflow-hidden">

          {/* LEFT — JSON PO Input */}
          <section className="flex flex-col p-4 gap-3 overflow-auto">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500">json po input</div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => outFileRef.current?.click()}
                className="text-xs font-mono px-2 py-0.5 rounded border border-zinc-600 text-zinc-300 hover:border-emerald-600 hover:text-emerald-400 transition-colors"
              >
                ↑ upload file
              </button>
              <input
                ref={outFileRef} type="file" accept=".json,.txt" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, setOutInput, setOutFileName) }}
              />
              <span className="text-zinc-700 text-xs font-mono">or samples:</span>
              {Object.keys(OUTBOUND_SAMPLES).map((label) => (
                <button key={label} onClick={() => { setOutInput(OUTBOUND_SAMPLES[label]); setOutFileName('') }}
                  className="text-xs font-mono px-2 py-0.5 rounded border border-zinc-700 text-zinc-500 hover:border-emerald-700 hover:text-emerald-400 transition-colors"
                >{label}</button>
              ))}
            </div>

            <div
              className={`flex-1 flex flex-col min-h-64 rounded border transition-colors ${outDragOver ? 'border-emerald-500 bg-emerald-950/20' : 'border-zinc-800'}`}
              onDrop={onOutDrop} onDragOver={(e) => { e.preventDefault(); setOutDragOver(true) }} onDragLeave={() => setOutDragOver(false)}
            >
              {outDragOver ? (
                <div className="flex-1 flex items-center justify-center text-emerald-400 font-mono text-xs">drop file here</div>
              ) : (
                <textarea
                  className="flex-1 bg-zinc-900 rounded p-3 text-xs font-mono text-zinc-300 resize-none focus:outline-none placeholder-zinc-700"
                  placeholder="Paste JSON purchase order…"
                  value={outInput} onChange={(e) => { setOutInput(e.target.value); setOutFileName('') }} spellCheck={false}
                />
              )}
            </div>

            {outFileName && (
              <div className="text-xs font-mono text-zinc-500 flex items-center gap-1">
                <span className="text-emerald-600">↑</span> {outFileName}
                <button onClick={() => { setOutFileName(''); setOutInput('') }} className="ml-auto text-zinc-700 hover:text-zinc-400">✕</button>
              </div>
            )}

            {/* Partner ID overrides */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono text-zinc-600">sender id (optional)</label>
                <input
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-300 focus:outline-none focus:border-emerald-700 placeholder-zinc-700"
                  placeholder="e.g. BUYER001"
                  value={sourceParnter} onChange={(e) => setSourcePartner(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono text-zinc-600">receiver id (optional)</label>
                <input
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-300 focus:outline-none focus:border-emerald-700 placeholder-zinc-700"
                  placeholder="e.g. SUPPLIER01"
                  value={destPartner} onChange={(e) => setDestPartner(e.target.value)}
                />
              </div>
            </div>

            {outError && <div className="text-xs font-mono text-red-400 border border-red-800 rounded p-2">{outError}</div>}

            <button onClick={runOutbound} disabled={outLoading || !outInput.trim()}
              className="w-full py-2 font-mono text-sm rounded border border-emerald-700 text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {outLoading ? <span className="animate-pulse">generating…</span> : '▶  generate x12'}
            </button>
          </section>

          {/* RIGHT — X12 Output */}
          <section className="flex flex-col p-4 gap-3 overflow-auto">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500">
              {outResult ? `x12 ${outResult.transaction_type === 'SHIPMENT_NOTICE' ? '856' : outResult.transaction_type === 'INVOICE' ? '810' : '850'} output` : 'x12 output'}
            </div>

            {outResult ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {([['status', outResult.final_status], ['type', outResult.transaction_type], ['from', outResult.source_partner], ['to', outResult.destination_partner]] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="bg-zinc-900 border border-zinc-800 rounded p-2">
                      <div className="text-xs text-zinc-600 font-mono">{k}</div>
                      <div className={`text-xs font-mono font-semibold truncate ${k === 'status' && v === 'COMPLETED' ? 'text-emerald-400' : k === 'status' && v === 'FAILED' ? 'text-red-400' : 'text-zinc-200'}`}>{v || '—'}</div>
                    </div>
                  ))}
                </div>

                {outResult.validation_errors.length > 0 && (
                  <div className="border border-red-800 rounded p-2 space-y-1">
                    {outResult.validation_errors.map((e, i) => (
                      <div key={i} className="text-xs font-mono text-red-400">✗ {e}</div>
                    ))}
                  </div>
                )}

                <div className="flex-1 min-h-0">
                  <EdiPanel data={outResult.edi_output} />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-zinc-700 font-mono text-xs">awaiting generation…</span>
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  )
}
