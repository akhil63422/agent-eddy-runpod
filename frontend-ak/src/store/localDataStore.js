/**
 * Local data store - stores imported DB snapshot in localStorage.
 * When data exists, services use it instead of API so workflow works offline.
 */
const STORAGE_KEY = 'edi_platform_local_data';

const defaultData = () => ({
  trading_partners: [],
  documents: [],
  exceptions: [],
  audit_logs: [],
  version: '1.0',
  imported_at: null,
});

export const localDataStore = {
  getData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const required = ['trading_partners', 'documents', 'exceptions', 'audit_logs'];
      for (const key of required) {
        if (!Array.isArray(data[key])) return null;
      }
      return data;
    } catch {
      return null;
    }
  },

  setData(data) {
    try {
      // Exclude inbound & outbound documents from local db
      const docs = (data.documents || []).filter(
        (d) => !['Inbound', 'Outbound'].includes((d.direction || '').trim())
      );
      const payload = {
        ...defaultData(),
        trading_partners: data.trading_partners || [],
        documents: docs,
        exceptions: data.exceptions || [],
        audit_logs: data.audit_logs || [],
        version: data.version || '1.0',
        imported_at: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  },

  hasLocalData() {
    return this.getData() !== null;
  },

  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  },

  /** Remove inbound & outbound documents from local db */
  clearInboundOutboundDocuments() {
    const data = this.getData();
    if (!data?.documents?.length) return true;
    const filtered = data.documents.filter(
      (d) => !['Inbound', 'Outbound'].includes((d.direction || '').trim())
    );
    if (filtered.length === data.documents.length) return true;
    this.setData({ ...data, documents: filtered });
    return true;
  },

  /** Add a document (e.g. from Playground Connect to System). Inbound/Outbound are not stored in local db. */
  addDocument(doc) {
    if (['Inbound', 'Outbound'].includes((doc.direction || '').trim())) return;
    const data = this.getData();
    const docs = data ? [...data.documents] : [];
    docs.unshift(doc);
    this.setData(
      data
        ? { ...data, documents: docs }
        : { trading_partners: [], documents: docs, exceptions: [], audit_logs: [] }
    );
  },

  // Filter helpers to mimic API query params
  filterPartners(arr, { skip = 0, limit = 100, status, search } = {}) {
    let out = [...arr];
    if (status) out = out.filter((p) => (p.status || '').toLowerCase() === status.toLowerCase());
    if (search && search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (p) =>
          (p.business_name || '').toLowerCase().includes(q) ||
          (p.partner_code || '').toLowerCase().includes(q)
      );
    }
    return out.slice(skip, skip + limit);
  },

  filterDocuments(arr, { skip = 0, limit = 100, direction, status, partner_id, document_type } = {}) {
    let out = [...arr];
    if (direction) out = out.filter((d) => (d.direction || '').toLowerCase() === direction.toLowerCase());
    if (status) out = out.filter((d) => (d.status || '').toLowerCase() === status.toLowerCase());
    if (partner_id) out = out.filter((d) => String(d.partner_id || d.partner_code) === String(partner_id));
    if (document_type) out = out.filter((d) => (d.document_type || '').toLowerCase() === document_type.toLowerCase());
    return out.slice(skip, skip + limit);
  },

  filterExceptions(arr, { skip = 0, limit = 100, status, severity, exception_type, partner_id, document_id } = {}) {
    let out = [...arr];
    if (status) out = out.filter((e) => (e.status || '').toLowerCase() === status.toLowerCase());
    if (severity) out = out.filter((e) => (e.severity || '').toLowerCase() === severity.toLowerCase());
    if (exception_type) out = out.filter((e) => (e.exception_type || '').toLowerCase() === exception_type.toLowerCase());
    if (partner_id) out = out.filter((e) => String(e.partner_id || e.partner_code) === String(partner_id));
    if (document_id) out = out.filter((e) => String(e.document_id) === String(document_id));
    return out.slice(skip, skip + limit);
  },

  filterAuditLogs(arr, { skip = 0, limit = 100, action_type, entity_type, entity_id, user_id } = {}) {
    let out = [...arr];
    if (action_type) out = out.filter((a) => (a.action_type || '').toLowerCase() === action_type.toLowerCase());
    if (entity_type) out = out.filter((a) => (a.entity_type || '').toLowerCase() === entity_type.toLowerCase());
    if (entity_id) out = out.filter((a) => String(a.entity_id) === String(entity_id));
    if (user_id) out = out.filter((a) => String(a.user_id) === String(user_id));
    return out.slice(skip, skip + limit);
  },
};
