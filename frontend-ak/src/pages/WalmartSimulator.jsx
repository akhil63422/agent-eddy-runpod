import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send, Package, FileText, CheckCircle2, Loader2,
  Building2, Plus, Minus, AlertCircle, CreditCard,
  Building, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { documentsService } from '@/services/documents';

const WALMART_BLUE = '#0071CE';

// ── Document type configs (mirrors SAP simulator structure) ─────────────────
const DOC_CONFIGS = {
  '850': {
    key: '850',
    label: '850 Purchase Order',
    short: '850 PO',
    icon: Package,
    color: 'purple',
    desc: 'Walmart sends PO to supplier',
    x12Code: '850',
  },
  '820': {
    key: '820',
    label: '820 Payment Order',
    short: '820',
    icon: CreditCard,
    color: 'emerald',
    desc: 'Walmart sends payment remittance',
    x12Code: '820',
  },
  '997': {
    key: '997',
    label: '997 Functional ACK',
    short: '997',
    icon: CheckCircle2,
    color: 'blue',
    desc: 'Walmart acknowledges supplier EDI',
    x12Code: '997',
  },
};

const SAMPLE_PRODUCTS = [
  { material: '012345678905', sku: 'ELEC-TV-55', desc: '55" 4K Smart TV', price: 349.99, uom: 'EA' },
  { material: '012345678912', sku: 'ELEC-LAPTOP', desc: '15" Laptop 16GB', price: 799.99, uom: 'EA' },
  { material: '012345678929', sku: 'HOME-BLNDR', desc: 'Professional Blender', price: 89.99, uom: 'EA' },
  { material: '012345678936', sku: 'APRL-SHIRT', desc: "Men's Cotton T-Shirt", price: 14.99, uom: 'EA' },
  { material: '012345678943', sku: 'FOOD-CEREAL', desc: 'Organic Granola Cereal', price: 6.49, uom: 'EA' },
  { material: '012345678950', sku: 'TOY-LEGO', desc: 'LEGO City Building Set', price: 49.99, uom: 'EA' },
];

const FIXED_SUPPLIER = { id: 'your-supplier', label: 'Agent Eddy (YOURSUPPLIER)', code: 'YOURSUPPLIER' };

function padIsa15(value) {
  const s = String(value || '').trim().toUpperCase().slice(0, 15);
  return s.padEnd(15, ' ');
}

function safePid(text) {
  return String(text || '').replace(/[*~:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function generatePoWmt() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `PO-WMT-${ymd}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
}

function generateTrace() {
  const d = new Date();
  return `TR-WMT-${d.toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function buildWalmart850X12({
  poNumber,
  poDateYYYYMMDD,
  departmentNumber,
  vendorNumber,
  shipToStoreNumber,
  lineItems,
}) {
  const dt = new Date();
  const yy = String(dt.getFullYear()).slice(2);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const date6 = `${yy}${mm}${dd}`;
  const date8 = String(poDateYYYYMMDD || '').replace(/-/g, '') || `${dt.getFullYear()}${mm}${dd}`;
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  const time4 = `${hh}${mi}`;
  const icCtrl = String(Math.floor(Math.random() * 1e9)).padStart(9, '0').slice(0, 9);
  const groupCtrl = String(Math.floor(Math.random() * 1e5)).padStart(5, '0');

  const isaSend = padIsa15('WALMART');
  const isaRecv = padIsa15('AgentEddy');

  const parts = [];
  parts.push(
    `ISA*00*          *00*          *ZZ*${isaSend}*ZZ*${isaRecv}*${date6}*${time4}*^*00501*${icCtrl}*0*P*:~`,
  );
  parts.push(`GS*PO*WALMART*AgentEddy*${date8}*${time4}*${groupCtrl}*X*005010~`);

  const txn = [];
  txn.push('ST*850*0001~');
  txn.push(`BEG*00*SA*${poNumber}**${date8}~`);
  if (departmentNumber) txn.push(`REF*DP*${safePid(departmentNumber)}~`);
  if (vendorNumber) txn.push(`REF*9V*${safePid(vendorNumber)}~`);
  txn.push(`N1*ST*SHIP TO*92*${safePid(shipToStoreNumber || '0001')}~`);

  lineItems.forEach((li, i) => {
    const ln = String(i + 1);
    const qty = String(li.qty);
    const uom = li.uom || 'EA';
    const price = Number(li.price).toFixed(2);
    txn.push(`PO1*${ln}*${qty}*${uom}*${price}**VP*${safePid(li.sku)}*UP*${li.material}~`);
    txn.push(`PID*F****${safePid(li.desc)}~`);
  });

  txn.push(`CTT*${lineItems.length}~`);
  const seNum = txn.length + 1;
  txn.push(`SE*${seNum}*0001~`);

  const body = txn.join('');
  parts.push(body);
  parts.push(`GE*1*${groupCtrl}~`);
  parts.push(`IEA*1*${icCtrl}~`);
  return parts.join('');
}

export const WalmartSimulator = () => {
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const [selectedDocType, setSelectedDocType] = useState('850');

  // 850
  const [poNumber, setPONumber] = useState(generatePoWmt);
  const [poDate, setPoDate] = useState(todayISO);
  const [departmentNumber, setDepartmentNumber] = useState('92');
  const [vendorNumber, setVendorNumber] = useState('VEND-WMT-001');
  const [shipToStoreNumber, setShipToStoreNumber] = useState('5521');
  const [lineItems, setLineItems] = useState([
    { ...SAMPLE_PRODUCTS[0], qty: 4, line: 1 },
    { ...SAMPLE_PRODUCTS[1], qty: 2, line: 2 },
  ]);

  // 820 (remittance)
  const [remittancePoRef, setRemittancePoRef] = useState(generatePoWmt);
  const [remittanceInvoice, setRemittanceInvoice] = useState(() => `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-WMT`);
  const [remittanceAmount, setRemittanceAmount] = useState('12500.00');
  const [remittancePayDate, setRemittancePayDate] = useState(todayISO);
  const [remittanceTrace, setRemittanceTrace] = useState(generateTrace);
  const [remittanceMethod, setRemittanceMethod] = useState('ACH');

  // 997 (functional ack)
  const [faAckDocType, setFaAckDocType] = useState('855');
  const [faOrigCtrl, setFaOrigCtrl] = useState('000012345');
  const [faGroupCtrl, setFaGroupCtrl] = useState('54321');
  const [faAcceptStatus, setFaAcceptStatus] = useState('Accepted');

  const subTotal = lineItems.reduce((sum, li) => sum + Number(li.qty) * Number(li.price), 0);

  const build820Payload = useCallback(() => ({
    sender: 'WALMART',
    receiver: 'AgentEddy',
    partner_code: 'WALMART',
    document_type: '820',
    standard: 'X12',
    payment: {
      po_reference: remittancePoRef,
      invoice_number: remittanceInvoice,
      amount: remittanceAmount,
      payment_date: remittancePayDate,
      trace_number: remittanceTrace,
      payment_method: remittanceMethod,
    },
  }), [remittancePoRef, remittanceInvoice, remittanceAmount, remittancePayDate, remittanceTrace, remittanceMethod]);

  const build997Payload = useCallback(() => ({
    sender: 'WALMART',
    receiver: 'AgentEddy',
    partner_code: 'WALMART',
    document_type: '997',
    standard: 'X12',
    functional_ack: {
      acknowledged_document_type: faAckDocType,
      original_control_number: faOrigCtrl,
      group_control_number: faGroupCtrl,
      acceptance_status: faAcceptStatus,
    },
  }), [faAckDocType, faOrigCtrl, faGroupCtrl, faAcceptStatus]);

  const previewPayload = useMemo(() => {
    if (selectedDocType === '850') {
      return buildWalmart850X12({
        poNumber,
        poDateYYYYMMDD: poDate.replace(/-/g, ''),
        departmentNumber,
        vendorNumber,
        shipToStoreNumber,
        lineItems,
      });
    }
    if (selectedDocType === '820') return JSON.stringify(build820Payload(), null, 2);
    return JSON.stringify(build997Payload(), null, 2);
  }, [
    selectedDocType,
    poNumber,
    poDate,
    departmentNumber,
    vendorNumber,
    shipToStoreNumber,
    lineItems,
    build820Payload,
    build997Payload,
  ]);

  const whatHappensNext = useMemo(() => {
    if (selectedDocType === '850') {
      return [
        'Agent Eddy receives X12 850 PO',
        'Resolves partner (Walmart) & direction (Inbound)',
        'Maps to canonical model via AI',
        'Generates ERP IDoc payload (ORDERS05)',
        'Ready for SAP import',
      ];
    }
    if (selectedDocType === '820') {
      return [
        'Agent Eddy receives payment remittance',
        'Resolves direction (Inbound)',
        'Maps to REMADV IDoc',
        'Ready for AP system import',
      ];
    }
    return [
      'Agent Eddy receives functional ACK',
      'Updates outbound document status',
      'Marks transaction as acknowledged',
    ];
  }, [selectedDocType]);

  const addLineItem = () => {
    const available = SAMPLE_PRODUCTS.filter((p) => !lineItems.find((li) => li.material === p.material));
    if (available.length === 0) {
      toast.info('All sample products already added');
      return;
    }
    setLineItems((prev) => [...prev, { ...available[0], qty: 6, line: prev.length + 1 }]);
  };

  const removeLineItem = (index) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) =>
      prev.filter((_, i) => i !== index).map((li, i) => ({ ...li, line: i + 1 })),
    );
  };

  const updateLineItem = (index, field, value) => {
    setLineItems((prev) =>
      prev.map((li, i) => (i === index ? { ...li, [field]: value } : li)),
    );
  };

  const handleSend = async () => {
    if (selectedDocType === '850') {
      if (lineItems.length === 0) {
        toast.error('Add at least one line item');
        return;
      }
    }

    setSending(true);
    setLastResult(null);
    try {
      const formData = new FormData();

      if (selectedDocType === '850') {
        const x12 = buildWalmart850X12({
          poNumber,
          poDateYYYYMMDD: poDate.replace(/-/g, ''),
          departmentNumber,
          vendorNumber,
          shipToStoreNumber,
          lineItems,
        });
        const blob = new Blob([x12], { type: 'application/octet-stream' });
        formData.append('file', blob, `walmart_850_${poNumber.replace(/[^a-zA-Z0-9-_]/g, '_')}.edi`);
      } else if (selectedDocType === '820') {
        const json = build820Payload();
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        formData.append('file', blob, `walmart_820_${d}.json`);
      } else {
        const json = build997Payload();
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        formData.append('file', blob, `walmart_997_${d}.json`);
      }

      if (selectedDocType !== '850') {
        const role = localStorage.getItem('role');
        if (role) formData.append('role', role);
      }

      const data = await documentsService.uploadFile(formData);
      setLastResult({
        success: true,
        document_id: data.document_id || data.id,
        status: data.status || 'Queued',
        doc_type: data.document_type || data.doc_type,
      });
      toast.success(`${DOC_CONFIGS[selectedDocType].label} sent to Agent Eddy!`);
      if (selectedDocType === '850') {
        setPONumber(generatePoWmt());
      }
      if (selectedDocType === '820') {
        setRemittanceTrace(generateTrace());
      }
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
  const dc = colorMap[docConfig.color] || colorMap.purple;

  const sendDisabled =
    sending ||
    (selectedDocType === '850' && lineItems.length === 0);

  return (
    <div className="p-6 lg:p-8 pb-10 min-h-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-sm flex items-center justify-center text-xl shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${WALMART_BLUE}, #005BB5)`,
            }}
          >
            🏪
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Walmart Retailer Simulator</h1>
            <p className="text-sm text-[var(--text-secondary)] font-semibold tracking-wide">
              TRADING PARTNER EDI TEST HARNESS
            </p>
          </div>
        </div>
      </div>

      {/* Flow banner — same shell as SAP simulator */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <div className="flex items-center gap-4 sm:gap-6 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-[var(--text-primary)] border"
              style={{ backgroundColor: `${WALMART_BLUE}33`, borderColor: `${WALMART_BLUE}55` }}
            >
              WMT
            </div>
            <span className="text-[var(--text-secondary)]">Walmart</span>
          </div>
          <div className="text-[var(--text-secondary)]">→ X12 EDI →</div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-900/40 border border-emerald-700/30 flex items-center justify-center text-xs font-bold text-[var(--status-success-text)]">
              AE
            </div>
            <span className="text-[var(--text-secondary)]">Agent Eddy</span>
          </div>
          <div className="text-[var(--text-secondary)]">→ ERP →</div>
          <div className="flex items-center gap-2">
            <Building className="w-5 h-5 text-[var(--text-secondary)]" />
            <span className="text-[var(--text-secondary)]">ERP</span>
          </div>
          <div className="text-[var(--text-secondary)]">→</div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[var(--status-info-text)]" />
            <span className="text-[var(--text-secondary)]">SAP</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedDocType === '850' && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                      Trading Partner
                    </label>
                    <select
                      value={FIXED_SUPPLIER.id}
                      disabled
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-focus)] text-[var(--text-primary)] text-sm rounded-lg p-2.5 opacity-90 cursor-not-allowed"
                    >
                      <option value={FIXED_SUPPLIER.id}>{FIXED_SUPPLIER.label}</option>
                    </select>
                  </div>
                )}
                <div className={`space-y-2 ${selectedDocType !== '850' ? 'md:col-span-2' : ''}`}>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Document Type
                  </label>
                  <select
                    value={selectedDocType}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedDocType(v);
                      setLastResult(null);
                      if (v === '820') {
                        setRemittanceAmount(subTotal.toFixed(2));
                      }
                    }}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-focus)] text-[var(--text-primary)] text-sm rounded-lg p-2.5"
                  >
                    {Object.entries(DOC_CONFIGS).map(([key, cfg]) => (
                      <option key={key} value={key}>
                        {cfg.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

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

              {/* Type-specific fields */}
              {selectedDocType === '850' && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">PO Number</label>
                    <Input
                      value={poNumber}
                      onChange={(e) => setPONumber(e.target.value)}
                      className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">PO Date</label>
                    <Input
                      type="date"
                      value={poDate}
                      onChange={(e) => setPoDate(e.target.value)}
                      className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Department Number</label>
                    <Input
                      value={departmentNumber}
                      onChange={(e) => setDepartmentNumber(e.target.value)}
                      className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Vendor Number</label>
                    <Input
                      value={vendorNumber}
                      onChange={(e) => setVendorNumber(e.target.value)}
                      className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Ship-To Store Number</label>
                    <Input
                      value={shipToStoreNumber}
                      onChange={(e) => setShipToStoreNumber(e.target.value)}
                      className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9"
                    />
                  </div>
                </div>
              )}

              {selectedDocType === '820' && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">PO Reference</label>
                    <Input
                      value={remittancePoRef}
                      onChange={(e) => setRemittancePoRef(e.target.value)}
                      className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Invoice Number</label>
                    <Input
                      value={remittanceInvoice}
                      onChange={(e) => setRemittanceInvoice(e.target.value)}
                      className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Payment Amount</label>
                    <Input
                      value={remittanceAmount}
                      onChange={(e) => setRemittanceAmount(e.target.value)}
                      className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Payment Date</label>
                    <Input
                      type="date"
                      value={remittancePayDate}
                      onChange={(e) => setRemittancePayDate(e.target.value)}
                      className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Trace Number</label>
                    <Input
                      value={remittanceTrace}
                      onChange={(e) => setRemittanceTrace(e.target.value)}
                      className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Payment Method</label>
                    <select
                      value={remittanceMethod}
                      onChange={(e) => setRemittanceMethod(e.target.value)}
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-focus)] text-[var(--text-primary)] text-xs rounded-md p-2 h-9"
                    >
                      <option value="ACH">ACH</option>
                      <option value="Wire">Wire</option>
                      <option value="Check">Check</option>
                    </select>
                  </div>
                </div>
              )}

              {selectedDocType === '997' && (
                <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Acknowledged Doc Type</label>
                    <select
                      value={faAckDocType}
                      onChange={(e) => setFaAckDocType(e.target.value)}
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-focus)] text-[var(--text-primary)] text-xs rounded-md p-2 h-9"
                    >
                      <option value="855">855</option>
                      <option value="856">856</option>
                      <option value="810">810</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Acceptance Status</label>
                    <select
                      value={faAcceptStatus}
                      onChange={(e) => setFaAcceptStatus(e.target.value)}
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-focus)] text-[var(--text-primary)] text-xs rounded-md p-2 h-9"
                    >
                      <option value="Accepted">Accepted</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Original Control Number</label>
                    <Input
                      value={faOrigCtrl}
                      onChange={(e) => setFaOrigCtrl(e.target.value)}
                      className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Group Control Number</label>
                    <Input
                      value={faGroupCtrl}
                      onChange={(e) => setFaGroupCtrl(e.target.value)}
                      className="bg-[var(--bg-surface)] border-[var(--border-focus)] text-[var(--text-primary)] text-xs h-9"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedDocType === '850' && (
            <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-[var(--text-primary)] flex items-center gap-2">
                    <Package className="w-4 h-4 text-[var(--text-primary)]" /> Line Items
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addLineItem}
                    className="border-[var(--border)] text-[var(--text-primary)] h-7 text-xs"
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
                        {['#', 'UPC', 'SKU', 'Description', 'Qty', 'UOM', 'Unit Cost', 'Total', ''].map((h) => (
                          <th key={h} className="text-left py-2 px-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((li, i) => (
                        <tr key={i} className="border-b border-[var(--border-subtle)]/50 hover:bg-[var(--bg-surface)]/20">
                          <td className="py-2 px-3 text-xs text-[var(--text-muted)] font-mono">{li.line}</td>
                          <td className="py-2 px-3">
                            <select
                              value={li.material}
                              onChange={(e) => {
                                const prod = SAMPLE_PRODUCTS.find((p) => p.material === e.target.value);
                                if (prod) {
                                  setLineItems((prev) =>
                                    prev.map((item, idx) =>
                                      idx === i ? { ...item, ...prod, line: item.line } : item,
                                    ),
                                  );
                                }
                              }}
                              className="bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] text-xs rounded p-1 w-full"
                            >
                              {SAMPLE_PRODUCTS.map((p) => (
                                <option key={p.material} value={p.material}>
                                  {p.material}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3 text-xs font-mono text-[var(--text-primary)]">{li.sku}</td>
                          <td className="py-2 px-3 text-xs text-[var(--text-primary)]">{li.desc}</td>
                          <td className="py-2 px-3">
                            <Input
                              type="number"
                              value={li.qty}
                              min={1}
                              onChange={(e) => updateLineItem(i, 'qty', parseInt(e.target.value, 10) || 1)}
                              className="bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-primary)] text-xs h-7 w-16"
                            />
                          </td>
                          <td className="py-2 px-3 text-xs text-[var(--text-secondary)]">{li.uom}</td>
                          <td className="py-2 px-3">
                            <Input
                              type="number"
                              value={li.price}
                              step="0.01"
                              onChange={(e) => updateLineItem(i, 'price', parseFloat(e.target.value) || 0)}
                              className="bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-primary)] text-xs h-7 w-20"
                            />
                          </td>
                          <td className="py-2 px-3 text-xs font-semibold text-[var(--status-success-text)] font-mono">
                            ${(Number(li.qty) * Number(li.price)).toFixed(2)}
                          </td>
                          <td className="py-2 px-3">
                            {lineItems.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeLineItem(i)}
                                className="text-[var(--text-muted)] hover:text-[var(--status-error-text)] h-6 w-6 p-0"
                              >
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
          )}
        </div>

        <div className="space-y-4">
          <Button
            onClick={handleSend}
            disabled={sendDisabled}
            className="h-14 w-full text-base font-medium bg-primary text-primary-foreground hover:bg-[#ffffff] shadow-none"
          >
            {sending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Sending to Agent Eddy...
              </>
            ) : (
              <>
                <Send className="w-5 h-5 mr-2" /> Send {docConfig.label}
              </>
            )}
          </Button>

          <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> EDI PAYLOAD PREVIEW
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-[9px] font-mono text-[var(--text-primary)]/70 bg-background rounded-lg p-3 overflow-auto max-h-64 leading-relaxed whitespace-pre-wrap break-all">
                {previewPayload}
              </pre>
            </CardContent>
          </Card>

          {lastResult && (
            <Card
              className={`border ${
                lastResult.success
                  ? 'bg-emerald-950/20 border-emerald-800/40'
                  : 'bg-red-950/20 border-red-800/40'
              }`}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  {lastResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-[var(--status-success-text)]" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-[var(--status-error-text)]" />
                  )}
                  <span
                    className={`text-sm font-bold ${lastResult.success ? 'text-[var(--status-success-text)]' : 'text-red-300'}`}
                  >
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
                          <div className="text-[var(--text-muted)]">Type</div>
                          <div className="text-[var(--text-primary)] text-[10px]">{lastResult.doc_type}</div>
                        </>
                      )}
                    </div>
                    {lastResult.document_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/document/${lastResult.document_id}`)}
                        className="w-full border-emerald-800/50 text-[var(--status-success-text)] hover:bg-emerald-900/20 text-xs"
                      >
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

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-3 space-y-2">
            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">What happens next</div>
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed space-y-1.5">
              {whatHappensNext.map((line, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-[var(--text-secondary)] font-mono text-[10px] mt-0.5 shrink-0">{idx + 1}.</span>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
