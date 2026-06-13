import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send, Package, FileText, Truck, CheckCircle2, Loader2,
  Building2, Plus, Minus, AlertCircle, Zap, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { partnersService } from '@/services/partners';
import api from '@/services/api';

// ── Document type configs ──────────────────────────────────────────────────
const DOC_CONFIGS = {
  INVOIC01: {
    label: '810 Invoice',
    idocType: 'INVOIC01',
    icon: FileText,
    color: 'emerald',
    x12Code: '810',
    desc: 'Send an invoice to the retailer for goods shipped',
  },
  ORDRSP: {
    label: '855 PO Acknowledgment',
    idocType: 'ORDRSP',
    icon: CheckCircle2,
    color: 'blue',
    x12Code: '855',
    desc: 'Acknowledge a purchase order from the retailer',
  },
  DESADV: {
    label: '856 Ship Notice (ASN)',
    idocType: 'DESADV',
    icon: Truck,
    color: 'orange',
    x12Code: '856',
    desc: 'Notify the retailer that goods have shipped',
  },
  ORDERS05: {
    label: '850 Purchase Order',
    idocType: 'ORDERS05',
    icon: Package,
    color: 'purple',
    x12Code: '850',
    desc: 'Send a purchase order to a supplier',
  },
};

// ── Sample products ────────────────────────────────────────────────────────
const SAMPLE_PRODUCTS = [
  { material: '012345678905', sku: 'ELEC-BT-SPKR', desc: 'Bluetooth Speaker 20W', price: 29.99, uom: 'EA' },
  { material: '012345678912', sku: 'ELEC-CHRG-PAD', desc: 'Wireless Charging Pad 15W', price: 49.99, uom: 'EA' },
  { material: '012345678929', sku: 'ELEC-CABLE-6FT', desc: 'USB-C Cable 6ft Braided', price: 9.99, uom: 'EA' },
  { material: '078652341001', sku: 'FIT-YOGA-MAT', desc: 'Premium Yoga Mat 6mm', price: 45.00, uom: 'EA' },
  { material: '078652341018', sku: 'FIT-BAND-SET', desc: 'Resistance Band Set 5pc', price: 12.50, uom: 'EA' },
  { material: '028877454078', sku: 'HOME-CANDLE-LG', desc: 'Scented Candle Large Jar', price: 18.50, uom: 'EA' },
  { material: '12337001382', sku: 'PHARMA-IBU-100', desc: 'Ibuprofen 200mg 100ct', price: 72.00, uom: 'CA' },
  { material: '12337001467', sku: 'PHARMA-VITD-200', desc: 'Vitamin D3 2000IU 200ct', price: 135.00, uom: 'CA' },
];

const generatePONumber = () => {
  const d = new Date();
  return `PO-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(Math.floor(Math.random()*9999)).padStart(4,'0')}`;
};
const generateInvoiceNumber = () => `INV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Math.floor(Math.random()*9999)).padStart(4,'0')}`;
const generateShipmentId = () => `ASN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Math.floor(Math.random()*999)).padStart(3,'0')}`;
const todayISO = () => new Date().toISOString().slice(0,10);

export const ERPSimulator = () => {
  const navigate = useNavigate();
  const [partners, setPartners] = useState([]);
  /** ISA / org id and name from GET /connections/our-company — used in parties.*.id */
  const [ourCompany, setOurCompany] = useState({ isa_id: '', name: '' });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  // Form state
  const [selectedPartner, setSelectedPartner] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('INVOIC01');
  const [poNumber, setPONumber] = useState(generatePONumber());
  const [invoiceNumber, setInvoiceNumber] = useState(generateInvoiceNumber());
  const [shipmentId, setShipmentId] = useState(generateShipmentId());
  const [carrier, setCarrier] = useState('UPS');
  const [trackingNumber, setTrackingNumber] = useState('1Z999999' + String(Math.floor(Math.random()*9999999999)).padStart(10,'0'));
  const [lineItems, setLineItems] = useState([
    { ...SAMPLE_PRODUCTS[0], qty: 24, line: 1 },
    { ...SAMPLE_PRODUCTS[1], qty: 12, line: 2 },
  ]);

  useEffect(() => {
    (async () => {
      try {
        const [res, ocRes] = await Promise.all([
          partnersService.list({ limit: 500 }),
          api.get('/connections/our-company').catch(() => ({ data: {} })),
        ]);
        const o = ocRes?.data || {};
        setOurCompany({
          isa_id: String(o.isa_id || o.org_code || '').trim(),
          name: String(o.name || '').trim() || 'Your Company',
        });
        const raw = Array.isArray(res) ? res : (res.partners || res || []);
        const list = raw.map(p => ({
          id: p.id || p._id,
          name: p.business_name || p.name,
          code: p.partner_code || '',
          role: p.role || 'Customer',
        }));
        setPartners(list);
        if (list.length > 0) setSelectedPartner(list[0].id);
      } catch (e) {
        toast.error('Failed to load partners');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const addLineItem = () => {
    const available = SAMPLE_PRODUCTS.filter(p => !lineItems.find(li => li.material === p.material));
    if (available.length === 0) { toast.info('All sample products already added'); return; }
    setLineItems(prev => [...prev, { ...available[0], qty: 6, line: prev.length + 1 }]);
  };

  const removeLineItem = (index) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter((_, i) => i !== index).map((li, i) => ({ ...li, line: i + 1 })));
  };

  const updateLineItem = (index, field, value) => {
    setLineItems(prev => prev.map((li, i) => i === index ? { ...li, [field]: value } : li));
  };

  const subTotal = lineItems.reduce((sum, li) => sum + (li.qty * li.price), 0);

  const buildPayload = () => {
    const partner = partners.find(p => p.id === selectedPartner);
    const partnerCode = partner?.code || 'PARTNER';
    const today = todayISO();
    const ourId = (ourCompany.isa_id || '').trim() || 'YOURSUPPLIER';
    const ourName = ourCompany.name || 'Your Company';

    const parties = {
      seller: { id: ourId, name: ourName },
      buyer: { id: partnerCode, name: partner?.name || 'Trading Partner' },
    };
    if (selectedDocType === 'ORDERS05') {
      parties.seller = { id: partnerCode, name: partner?.name || 'Trading Partner' };
      parties.buyer = { id: ourId, name: ourName };
    }

    const items = lineItems.map(li => ({
      line: li.line,
      material: li.material,
      vendorSku: li.sku,
      qty: Number(li.qty),
      uom: li.uom,
      price: Number(li.price),
      description: li.desc,
    }));

    switch (selectedDocType) {
      case 'INVOIC01':
        return {
          idocType: 'INVOIC01',
          control: { invoiceNumber, invoiceDate: today, poNumber },
          parties,
          lineItems: items,
          totals: { subTotal: subTotal.toFixed(2), grandTotal: subTotal.toFixed(2), currency: 'USD' },
          terms: '2% 10 Net 30',
        };
      case 'ORDRSP':
        return {
          idocType: 'ORDRSP',
          control: { poNumber, acknowledgmentDate: today, acknowledgmentType: 'AC' },
          parties,
          lineItems: items.map(li => ({ ...li, status: 'Accepted', estimatedShipDate: today })),
          totals: { subTotal: subTotal.toFixed(2), currency: 'USD' },
        };
      case 'DESADV':
        return {
          idocType: 'DESADV',
          control: { shipmentId, shipDate: today, poNumber, carrier, trackingNumber, totalCartons: lineItems.length, totalWeight: (lineItems.length * 8.5).toFixed(1), weightUnit: 'LB' },
          parties: { ...parties, shipTo: { id: partnerCode + '-DC1', name: partner?.name + ' Distribution Center' } },
          lineItems: items,
        };
      case 'ORDERS05':
        return {
          idocType: 'ORDERS05',
          control: { poNumber, poDate: today },
          parties,
          lineItems: items,
          totals: { subTotal: subTotal.toFixed(2), currency: 'USD' },
        };
      default:
        return { idocType: selectedDocType, control: { poNumber }, parties, lineItems: items };
    }
  };

  const handleSend = async () => {
    if (!selectedPartner) { toast.error('Select a trading partner'); return; }
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return; }

    setSending(true);
    setLastResult(null);
    try {
      const payload = buildPayload();
      const response = await api.post('/ingestion/erp', {
        payload,
        partner_id: selectedPartner,
      });
      const data = response.data;
      setLastResult({ success: true, ...data });
      toast.success(`${DOC_CONFIGS[selectedDocType].label} sent to Agent Eddy!`);
      // Refresh numbers for next send
      setPONumber(generatePONumber());
      setInvoiceNumber(generateInvoiceNumber());
      setShipmentId(generateShipmentId());
    } catch (e) {
      const detail = e?.response?.data?.detail || e.message || 'Send failed';
      setLastResult({ success: false, error: detail });
      toast.error(typeof detail === 'string' ? detail : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const docConfig = DOC_CONFIGS[selectedDocType];
  const DocIcon = docConfig.icon;

  const colorMap = {
    emerald: { bg: 'bg-emerald-950/30', border: 'border-emerald-800/40', text: 'text-[var(--status-success-text)]', badge: 'bg-emerald-900/50 text-[var(--status-success-text)] border-emerald-700/50' },
    blue: { bg: 'bg-blue-950/30', border: 'border-blue-800/40', text: 'text-[var(--status-info-text)]', badge: 'bg-blue-900/50 text-[var(--text-secondary)] border-blue-700/50' },
    orange: { bg: 'bg-orange-950/30', border: 'border-orange-800/40', text: 'text-[var(--status-warn-text)]', badge: 'bg-orange-900/50 text-orange-300 border-orange-700/50' },
    purple: { bg: 'bg-purple-950/30', border: 'border-purple-800/40', text: 'text-[var(--text-secondary)]', badge: 'bg-purple-900/50 text-[var(--text-secondary)] border-purple-700/50' },
  };
  const dc = colorMap[docConfig.color] || colorMap.emerald;

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 text-[var(--status-info-text)] animate-spin" />
        <span className="ml-3 text-[var(--text-secondary)]">Loading SAP Simulator…</span>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 pb-10 min-h-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-gradient-to-br bg-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-[var(--text-primary)]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">SAP Simulator</h1>
              <p className="text-sm text-[var(--text-secondary)]">Generate SAP IDoc payloads and send to Agent Eddy</p>
            </div>
          </div>
        </div>
      </div>

      {/* Flow banner */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-900/40 border border-blue-700/30 flex items-center justify-center text-xs font-bold text-[var(--text-secondary)]">SAP</div>
            <span className="text-[var(--text-secondary)]">Your ERP</span>
          </div>
          <div className="text-[var(--text-secondary)]">→ IDoc JSON →</div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-900/40 border border-emerald-700/30 flex items-center justify-center text-xs font-bold text-[var(--status-success-text)]">AE</div>
            <span className="text-[var(--text-secondary)]">Agent Eddy</span>
          </div>
          <div className="text-[var(--text-secondary)]">→ X12 EDI →</div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[var(--status-warn-text)]" />
            <span className="text-[var(--text-secondary)]">Trading Partner</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Document Config ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Partner + Doc Type */}
          <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Trading Partner</label>
                  <select
                    value={selectedPartner}
                    onChange={e => setSelectedPartner(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-focus)] text-[var(--text-primary)] text-sm rounded-lg p-2.5"
                  >
                    <option value="">Select partner...</option>
                    {partners.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Document Type</label>
                  <select
                    value={selectedDocType}
                    onChange={e => setSelectedDocType(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-focus)] text-[var(--text-primary)] text-sm rounded-lg p-2.5"
                  >
                    {Object.entries(DOC_CONFIGS).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.label} ({cfg.idocType})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Doc type description */}
              <div className={`rounded-lg ${dc.bg} border ${dc.border} p-3 flex items-center gap-3`}>
                <DocIcon className={`w-5 h-5 ${dc.text} shrink-0`} />
                <div>
                  <span className={`text-xs font-bold ${dc.text}`}>{docConfig.label}</span>
                  <span className="text-xs text-[var(--text-secondary)] ml-2">{docConfig.desc}</span>
                </div>
                <Badge className={`ml-auto text-[10px] ${dc.badge} border shrink-0`}>
                  → X12 {docConfig.x12Code}
                </Badge>
              </div>

              {/* Control fields */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">PO Number</label>
                  <Input value={poNumber} onChange={e => setPONumber(e.target.value)}
                    className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9" />
                </div>
                {selectedDocType === 'INVOIC01' && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Invoice Number</label>
                    <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                      className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9" />
                  </div>
                )}
                {selectedDocType === 'DESADV' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Carrier</label>
                      <select value={carrier} onChange={e => setCarrier(e.target.value)}
                        className="w-full bg-[var(--bg-surface)] border border-[var(--border-focus)] text-[var(--text-primary)] text-xs rounded-md p-2 h-9">
                        {['UPS', 'FedEx', 'USPS', 'DHL', 'FedEx Freight', 'Old Dominion'].map(c =>
                          <option key={c} value={c}>{c}</option>
                        )}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Tracking #</label>
                      <Input value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)}
                        className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9" />
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-[var(--text-primary)] flex items-center gap-2">
                  <Package className="w-4 h-4 text-[var(--text-primary)]" /> Line Items
                </CardTitle>
                <Button variant="outline" size="sm" onClick={addLineItem}
                  className="border-[var(--border)] text-[var(--text-primary)] h-7 text-xs">
                  <Plus className="w-3 h-3 mr-1" /> Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
                      {['#', 'UPC / Material', 'SKU', 'Description', 'Qty', 'UOM', 'Price', 'Total', ''].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li, i) => (
                      <tr key={i} className="border-b border-[var(--border-subtle)]/50 hover:bg-[var(--bg-surface)]/20">
                        <td className="py-2 px-3 text-xs text-[var(--text-muted)] font-mono">{li.line}</td>
                        <td className="py-2 px-3">
                          <select value={li.material}
                            onChange={e => {
                              const prod = SAMPLE_PRODUCTS.find(p => p.material === e.target.value);
                              if (prod) updateLineItem(i, 'material', prod.material);
                              if (prod) setLineItems(prev => prev.map((item, idx) => idx === i ? { ...item, ...prod } : item));
                            }}
                            className="bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] text-xs rounded p-1 w-full">
                            {SAMPLE_PRODUCTS.map(p => (
                              <option key={p.material} value={p.material}>{p.material}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3 text-xs font-mono text-[var(--text-primary)]">{li.sku}</td>
                        <td className="py-2 px-3 text-xs text-[var(--text-primary)]">{li.desc}</td>
                        <td className="py-2 px-3">
                          <Input type="number" value={li.qty} min={1}
                            onChange={e => updateLineItem(i, 'qty', parseInt(e.target.value) || 1)}
                            className="bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-primary)] text-xs h-7 w-16" />
                        </td>
                        <td className="py-2 px-3 text-xs text-[var(--text-secondary)]">{li.uom}</td>
                        <td className="py-2 px-3">
                          <Input type="number" value={li.price} step="0.01"
                            onChange={e => updateLineItem(i, 'price', parseFloat(e.target.value) || 0)}
                            className="bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-primary)] text-xs h-7 w-20" />
                        </td>
                        <td className="py-2 px-3 text-xs font-semibold text-[var(--status-success-text)] font-mono">
                          ${(li.qty * li.price).toFixed(2)}
                        </td>
                        <td className="py-2 px-3">
                          {lineItems.length > 1 && (
                            <Button variant="ghost" size="sm" onClick={() => removeLineItem(i)}
                              className="text-[var(--text-muted)] hover:text-[var(--status-error-text)] h-6 w-6 p-0">
                              <Minus className="w-3 h-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[var(--bg-surface)]/40">
                      <td colSpan={7} className="py-2.5 px-3 text-xs font-semibold text-[var(--text-primary)] text-right">
                        Subtotal ({lineItems.length} items)
                      </td>
                      <td className="py-2.5 px-3 text-sm font-bold text-[var(--status-success-text)] font-mono">
                        ${subTotal.toFixed(2)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Preview + Send ── */}
        <div className="space-y-4">
          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={sending || !selectedPartner}
            className="w-full h-14 text-base font-bold bg-gradient-to-r bg-primary hover:bg-[#ffffff] shadow-lg shadow-none"
          >
            {sending ? (
              <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Sending to Agent Eddy...</>
            ) : (
              <><Send className="w-5 h-5 mr-2" /> Send {docConfig.label}</>
            )}
          </Button>

          {/* Payload preview */}
          <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> IDoc Payload Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-[9px] font-mono text-[var(--text-primary)]/70 bg-background rounded-lg p-3 overflow-auto max-h-64 leading-relaxed whitespace-pre-wrap">
                {JSON.stringify(buildPayload(), null, 2)}
              </pre>
            </CardContent>
          </Card>

          {/* Last result */}
          {lastResult && (
            <Card className={`border ${lastResult.success ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-red-950/20 border-red-800/40'}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  {lastResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-[var(--status-success-text)]" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-[var(--status-error-text)]" />
                  )}
                  <span className={`text-sm font-bold ${lastResult.success ? 'text-[var(--status-success-text)]' : 'text-red-300'}`}>
                    {lastResult.success ? 'Sent Successfully!' : 'Send Failed'}
                  </span>
                </div>

                {lastResult.success && (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-[var(--text-muted)]">Document ID</div>
                      <div className="text-[var(--text-primary)] font-mono text-[10px] truncate">{lastResult.document_id}</div>
                      <div className="text-[var(--text-muted)]">Status</div>
                      <div>
                        <Badge className="bg-emerald-900/50 text-[var(--status-success-text)] border border-emerald-700/50 text-[10px]">
                          {lastResult.status || 'Queued'}
                        </Badge>
                      </div>
                      {lastResult.doc_type && (
                        <>
                          <div className="text-[var(--text-muted)]">Generated</div>
                          <div className="text-[var(--text-primary)] text-[10px]">{lastResult.doc_type}</div>
                        </>
                      )}
                    </div>
                    {lastResult.document_id && (
                      <Button variant="outline" size="sm"
                        onClick={() => navigate(`/document/${lastResult.document_id}`)}
                        className="w-full border-emerald-800/50 text-[var(--status-success-text)] hover:bg-emerald-900/20 text-xs">
                        <ExternalLink className="w-3 h-3 mr-1.5" />
                        View in Agent Eddy
                      </Button>
                    )}
                  </>
                )}

                {!lastResult.success && (
                  <div className="text-xs text-red-300/80 bg-red-950/30 rounded p-2 font-mono">
                    {typeof lastResult.error === 'string'
                      ? lastResult.error
                      : JSON.stringify(lastResult.error)}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Quick info */}
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-3 space-y-2">
            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">What happens next</div>
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="text-[var(--text-secondary)] font-mono text-[10px] mt-0.5 shrink-0">1.</span>
                Agent Eddy receives the IDoc JSON
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[var(--text-secondary)] font-mono text-[10px] mt-0.5 shrink-0">2.</span>
                Resolves partner & direction (Outbound)
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[var(--text-secondary)] font-mono text-[10px] mt-0.5 shrink-0">3.</span>
                Maps to canonical model via AI
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[var(--text-secondary)] font-mono text-[10px] mt-0.5 shrink-0">4.</span>
                Generates X12 {docConfig.x12Code} with partner envelope
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[var(--text-secondary)] font-mono text-[10px] mt-0.5 shrink-0">5.</span>
                Ready for delivery via AS2/SFTP/VAN
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
