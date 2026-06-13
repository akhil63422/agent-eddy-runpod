import api from './api';
import { localDataStore } from '@/store/localDataStore';

/**
 * API may store transport_config.endpoint as a URL string or { host, port, path } (SFTP imports).
 * Never use the raw endpoint as a single "host" string — React cannot render objects as text children.
 */
export function flattenTransportConfig(transport) {
  if (!transport || typeof transport !== 'object') {
    return {
      type: '',
      host: '',
      port: '22',
      path: '/',
      username: '',
      schedule: '',
      encryption: false,
    };
  }
  const creds = transport.credentials || {};
  const ep = transport.endpoint;
  let host = creds.host != null ? String(creds.host) : '';
  let port = creds.port != null ? String(creds.port) : '22';
  let path = creds.path != null ? String(creds.path) : '/';
  let username = creds.username != null ? String(creds.username) : '';
  if (ep && typeof ep === 'object' && !Array.isArray(ep)) {
    if (ep.host != null) host = String(ep.host);
    if (ep.port != null) port = String(ep.port);
    if (ep.path != null) path = String(ep.path);
  } else if (typeof ep === 'string' && ep.trim()) {
    if (!host) host = ep.trim();
  }
  return {
    type: transport.type ? String(transport.type) : '',
    host,
    port,
    path,
    username,
    schedule: transport.schedule != null ? String(transport.schedule) : '',
    encryption: !!transport.encryption,
  };
}

/** Map Add Trading Partner wizard state → API body (create or full update). */
export function wizardFormToPartnerPayload(partnerData) {
  const businessName = (partnerData.businessName || partnerData.business_name || '').trim();
  const partnerCode = (partnerData.partnerCode || partnerData.partner_code || '').trim().toUpperCase();
  const hasBusinessContact = partnerData.businessContact &&
    (partnerData.businessContact.name || partnerData.businessContact.email);
  const hasTechnicalContact = partnerData.technicalContact &&
    (partnerData.technicalContact.name || partnerData.technicalContact.email);
  const hasEdiConfig = partnerData.ediStandard || partnerData.ediConfig?.standard;

  return {
    business_name: businessName,
    partner_code: partnerCode,
    role: partnerData.role || 'Both',
    industry: partnerData.industry || null,
    country: partnerData.country || null,
    timezone: partnerData.timezone || null,
    status: partnerData.status && ['Draft', 'Active', 'Testing', 'Suspended'].includes(partnerData.status)
      ? partnerData.status
      : undefined,
    business_contact: hasBusinessContact ? {
      name: (partnerData.businessContact.name || 'N/A').trim() || 'N/A',
      email: (partnerData.businessContact.email || 'N/A').trim() || 'N/A',
      phone: partnerData.businessContact.phone?.trim() || null,
    } : null,
    technical_contact: hasTechnicalContact ? {
      name: (partnerData.technicalContact.name || 'N/A').trim() || 'N/A',
      email: (partnerData.technicalContact.email || 'N/A').trim() || 'N/A',
      phone: partnerData.technicalContact.phone?.trim() || null,
    } : null,
    edi_config: hasEdiConfig ? {
      standard: partnerData.ediStandard || partnerData.ediConfig?.standard || 'X12',
      version: partnerData.version || partnerData.ediConfig?.version || '5010',
      functional_group: partnerData.functionalGroups?.[0] || partnerData.functionalGroup || null,
      character_set: partnerData.characterSet || 'ASCII',
      delimiters: (() => {
        const d = partnerData.delimiters || {};
        return {
          element: d.element || '*',
          segment: d.segment || '~',
          sub_element: d.sub_element || d.subElement || ':',
        };
      })(),
      isa_sender_id: partnerData.isaSenderId || partnerData.ediConfig?.isaSenderId || null,
      isa_receiver_id: partnerData.isaReceiverId || partnerData.ediConfig?.isaReceiverId || null,
      gs_ids: partnerData.gsIds?.sender || partnerData.gsIds?.receiver
        ? { sender: partnerData.gsIds?.sender || '', receiver: partnerData.gsIds?.receiver || '' }
        : null,
    } : null,
    document_agreements: (() => {
      if (Array.isArray(partnerData.documentAgreements) && partnerData.documentAgreements.length > 0) {
        return partnerData.documentAgreements
          .map((d) => {
            if (!d || typeof d !== 'object') return null;
            const ts = String(d.transactionSet ?? d.transaction_set ?? '')
              .replace(/\s*\(.*\)/, '')
              .trim();
            const dir = String(d.direction ?? 'Inbound').trim() || 'Inbound';
            return ts ? { transaction_set: ts, direction: dir } : null;
          })
          .filter(Boolean);
      }
      return (partnerData.documents || [])
      .map((doc) => {
        if (typeof doc === 'object' && doc.transactionSet) {
            return {
              transaction_set: String(doc.transactionSet).trim(),
              direction: String(doc.direction || 'Inbound').trim() || 'Inbound',
            };
        }
        const ts = String(doc).replace(/\s*\(.*\)/, '').trim();
        return ts ? { transaction_set: ts, direction: 'Inbound' } : null;
      })
        .filter(Boolean);
    })(),
    erp_context: partnerData.erpContext?.targetSystem?.system || partnerData.erpContext?.partnerERP?.system
      ? {
        backend_system: partnerData.erpContext?.partnerERP?.system || partnerData.erpContext?.targetSystem?.system || null,
        version: partnerData.erpContext?.partnerERP?.version || null,
        notes: partnerData.erpContext?.partnerERP?.notes || null,
      }
      : null,
    transport_config: partnerData.transportType
      ? {
        type: String(partnerData.transportType).trim(),
        endpoint: (() => {
          const cfg = partnerData.transportConfig || {};
          if (cfg.endpoint && typeof cfg.endpoint === 'object') {
            return cfg.endpoint;
          }
          if (cfg.host) {
            return {
              host: String(cfg.host),
              port: cfg.port != null ? Number(cfg.port) : undefined,
              path: cfg.path != null ? String(cfg.path) : undefined,
            };
          }
          if (typeof cfg.endpoint === 'string' && cfg.endpoint.trim()) {
            return cfg.endpoint.trim();
          }
          return null;
        })(),
        credentials:
          partnerData.transportConfig?.credentials &&
          typeof partnerData.transportConfig.credentials === 'object'
            ? partnerData.transportConfig.credentials
            : undefined,
        schedule: partnerData.transportConfig?.schedule || null,
      }
      : null,
    notes: (() => {
      const raw = partnerData.exceptionRules ?? partnerData.notes;
      if (raw == null || raw === '') return null;
      return typeof raw === 'string' ? raw.trim() || null : String(raw);
    })(),
  };
}

const _EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function _omitEmpty(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

/** Client-side validation for wizard steps (inline errors). */
export function validateWizardStep(step, formData) {
  const errors = {};

  if (step === 1) {
    if (!(formData.businessName || '').trim()) errors.businessName = 'This field is required';
    const code = (formData.partnerCode || '').trim();
    if (!code) errors.partnerCode = 'This field is required';
    else if (!/^[A-Za-z0-9_]+$/.test(code)) errors.partnerCode = 'Only letters, numbers, underscores allowed';
    if (!(formData.role || '').trim()) errors.role = 'This field is required';
    ['business', 'technical'].forEach((prefix) => {
      const c = prefix === 'business' ? formData.businessContact : formData.technicalContact;
      const em = (c?.email || '').trim();
      if (em && !_EMAIL_RE.test(em)) errors[`${prefix}ContactEmail`] = 'Enter a valid email address';
      const digits = String(c?.phone || '').replace(/\D/g, '');
      if (digits.length > 0 && digits.length < 10) {
        errors[`${prefix}ContactPhone`] = 'Enter a valid phone number (at least 10 digits)';
      }
    });
  } else if (step === 2) {
    if (!(formData.ediStandard || '').trim()) errors.ediStandard = 'This field is required';
    if (!(formData.version || '').trim()) errors.version = 'This field is required';
    if (formData.ediStandard === 'X12') {
      if (!(formData.isaSenderId || '').trim()) errors.isaSenderId = 'ISA Sender ID is required for X12';
      if (!(formData.isaReceiverId || '').trim()) errors.isaReceiverId = 'ISA Receiver ID is required for X12';
    }
  } else if (step === 3) {
    /* optional */
  } else if (step === 4) {
    if (!Array.isArray(formData.documents) || formData.documents.length === 0) {
      errors.documents = 'Select at least one document type';
    }
  } else if (step === 5) {
    /* optional */
  } else if (step === 6) {
    if (!Array.isArray(formData.mappings) || formData.mappings.length === 0) {
      errors.mappings = 'Add at least one mapping (or generate and approve)';
    }
  } else if (step === 7) {
    if (!(formData.transportType || '').trim()) errors.transportType = 'This field is required';
    const cfg = formData.transportConfig || {};
    const t = formData.transportType;
    if (t === 'SFTP') {
      if (!(cfg.host || '').trim()) errors.transportHost = 'Host is required for SFTP';
      if (!(cfg.username || '').trim()) errors.transportUsername = 'Username is required for SFTP';
    } else if (t === 'AS2' && !(cfg.url || '').trim()) {
      errors.transportUrl = 'AS2 URL is required';
    } else if (t === 'API' && !(cfg.endpoint || '').trim()) {
      errors.transportEndpoint = 'API endpoint is required';
    } else if (t === 'S3' && !(cfg.bucket || '').trim()) {
      errors.transportBucket = 'Bucket name is required for S3';
    }
  } else if (step === 8) {
    /* optional */
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Build PATCH body for a single wizard step (merged on server into existing partner).
 */
export function buildWizardSectionPayload(step, formData) {
  const full = wizardFormToPartnerPayload(formData);

  switch (step) {
    case 1:
      return _omitEmpty({
        business_name: full.business_name,
        partner_code: full.partner_code,
        role: full.role,
        industry: full.industry,
        country: full.country,
        timezone: full.timezone,
        status: full.status,
        business_contact: full.business_contact,
        technical_contact: full.technical_contact,
      });
    case 2:
      return full.edi_config ? { edi_config: full.edi_config } : {};
    case 3:
      return full.erp_context ? { erp_context: full.erp_context } : {};
    case 4:
      return { document_agreements: full.document_agreements || [] };
    case 5: {
      const wm = {};
      if (formData.partnerSpecificRules != null && formData.partnerSpecificRules !== '') {
        wm.partner_specific_rules = formData.partnerSpecificRules;
      }
      // Persist saved files arrays so they survive page reload
      if (Array.isArray(formData.savedSpecFiles) && formData.savedSpecFiles.length)
        wm.spec_files = formData.savedSpecFiles;
      if (Array.isArray(formData.savedSampleFiles) && formData.savedSampleFiles.length)
        wm.sample_files = formData.savedSampleFiles;
      const out = _omitEmpty({
        notes: full.notes,
        ...(Object.keys(wm).length ? { wizard_metadata: wm } : {}),
      });
      return out;
    }
    case 6:
      return { wizard_metadata: { field_mappings: formData.mappings || [] } };
    case 7:
      return full.transport_config && formData.transportType
        ? { transport_config: full.transport_config }
        : {};
    case 8: {
      const wm = _omitEmpty({
        test_status: formData.testStatus,
        last_test_date: formData.lastTestDate,
        test_notes: formData.testNotes,
        test_results: formData.testResults,
      });
      return Object.keys(wm).length ? { wizard_metadata: wm } : {};
    }
    case 9: {
      const wm = _omitEmpty({
        field_mappings: formData.mappings || [],
        test_status: formData.testStatus,
        last_test_date: formData.lastTestDate,
        test_notes: formData.testNotes,
        test_results: formData.testResults,
        partner_specific_rules: formData.partnerSpecificRules ?? null,
      });
      const base = _omitEmpty(full);
      return { ...base, ...(Object.keys(wm).length ? { wizard_metadata: wm } : {}) };
    }
    default:
      return {};
  }
}

/** Which steps appear fully configured when loading from API-mapped form (sidebar checks). */
export function computePersistedStepsFromForm(formData) {
  const s = new Set();
  if (
    (formData.businessName || '').trim() &&
    (formData.partnerCode || '').trim() &&
    (formData.role || '').trim()
  ) {
    s.add(1);
  }
  if ((formData.ediStandard || '').trim() && (formData.version || '').trim()) {
    s.add(2);
  }
  const erp = formData.erpContext?.partnerERP;
  if (erp && ((erp.system && erp.system !== 'Unknown') || (erp.notes || '').trim())) {
    s.add(3);
  }
  if (Array.isArray(formData.documents) && formData.documents.length > 0) s.add(4);
  if (
    (formData.exceptionRules || '').trim() ||
    formData.specFiles?.length ||
    formData.sampleFiles?.length ||
    formData.savedSpecFiles?.length ||
    formData.savedSampleFiles?.length
  ) s.add(5);
  if (Array.isArray(formData.mappings) && formData.mappings.length > 0) s.add(6);
  if ((formData.transportType || '').trim()) s.add(7);
  if ((formData.testResults || []).length > 0 || (formData.testNotes || '').trim() || (formData.testStatus || '').trim()) {
    s.add(8);
  }
  if (formData.monitoringEnabled !== undefined || (formData.activationDate || '').trim()) s.add(9);
  return s;
}

/** Map API partner (GET /partners/:id) → AddTradingPartnerWizard form shape for editing. */
export function apiPartnerToWizardForm(api) {
  if (!api) return {};
  const bc = api.business_contact || {};
  const tc = api.technical_contact || {};
  const edi = api.edi_config || {};
  const erp = api.erp_context || {};
  const transport = api.transport_config || {};
  const flatT = flattenTransportConfig(transport);
  const gs = edi.gs_ids || {};
  const docs = (api.document_agreements || [])
    .map((d) => (typeof d === 'object' && d ? d.transaction_set : null))
    .filter(Boolean);
  const base = {
    businessName: api.business_name || '',
    partnerCode: (api.partner_code || '').trim(),
    role: api.role || 'Both',
    industry: api.industry || '',
    country: api.country || '',
    timezone: api.timezone || '',
    businessContact: { name: bc.name || '', email: bc.email || '', phone: bc.phone || '' },
    technicalContact: { name: tc.name || '', email: tc.email || '', phone: tc.phone || '' },
    status: api.status || 'Draft',
    ediStandard: edi.standard || 'X12',
    version: edi.version || '5010',
    functionalGroups: edi.functional_group
      ? Array.isArray(edi.functional_group)
        ? edi.functional_group
        : [edi.functional_group]
      : [],
    characterSet: edi.character_set || 'ASCII',
    delimiters: {
      element: edi.delimiters?.element || '*',
      segment: edi.delimiters?.segment || '~',
      subElement: edi.delimiters?.sub_element || edi.delimiters?.subElement || '>',
    },
    isaSenderId: edi.isa_sender_id || '',
    isaReceiverId: edi.isa_receiver_id || '',
    gsIds: { sender: gs.sender || '', receiver: gs.receiver || '' },
    erpContext: {
      partnerERP: {
        system: erp.backend_system || 'Unknown',
        version: erp.version || '',
        customName: '',
        hasCustomizations: Array.isArray(erp.customizations) && erp.customizations.length > 0,
        notes: erp.notes || '',
      },
      targetSystem: {
        system: erp.backend_system || '',
        integrationMethod: 'API',
        dataOwner: '',
      },
    },
    documents: docs,
    transportType: flatT.type || '',
    transportConfig: {
      host: flatT.host,
      port: flatT.port,
      username: flatT.username,
      path: flatT.path,
      endpoint:
        transport.endpoint && typeof transport.endpoint === 'object'
          ? transport.endpoint
          : (transport.endpoint || ''),
      schedule: flatT.schedule,
    },
    exceptionRules: api.notes || '',
    mappings: [],
  };
  const wm = api.wizard_metadata || {};
  return {
    ...base,
    mappings: Array.isArray(wm.field_mappings) ? wm.field_mappings : base.mappings,
    testStatus: wm.test_status || '',
    lastTestDate: wm.last_test_date || '',
    testNotes: wm.test_notes || '',
    testResults: Array.isArray(wm.test_results) ? wm.test_results : [],
    partnerSpecificRules: wm.partner_specific_rules ?? null,
    // Saved files arrays from backend (display only — not File objects)
    savedSpecFiles: Array.isArray(api.spec_files) ? api.spec_files
      : Array.isArray(wm.spec_files) ? wm.spec_files
      : (wm.spec_file || api.spec_file) ? [wm.spec_file || api.spec_file] : [],
    savedSampleFiles: Array.isArray(api.sample_files) ? api.sample_files
      : Array.isArray(wm.sample_files) ? wm.sample_files
      : (wm.sample_file || api.sample_file) ? [wm.sample_file || api.sample_file] : [],
    // Clear in-memory pending file objects on load
    specFiles: [],
    sampleFiles: [],
  };
}

export const partnersService = {
  /** Alias for getAll (e.g. SAP Simulator). */
  list: async (params = {}) => partnersService.getAll({ limit: 500, ...params }),

  // Prefer live API so partners created in Postgres always show up. Fall back to imported local snapshot only if API fails.
  getAll: async (params = {}) => {
    const { skip = 0, limit = 100, status, search } = params;
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    });
    if (status) queryParams.append('status', status);
    if (search) queryParams.append('search', search);
    try {
      const response = await api.get(`/partners/?${queryParams}`);
      return response.data;
    } catch (e) {
      const data = localDataStore.getData();
      if (data?.trading_partners?.length > 0) {
        return localDataStore.filterPartners(data.trading_partners, {
          skip: params.skip ?? 0,
          limit: params.limit ?? 100,
          status: params.status,
          search: params.search,
        });
      }
      throw e;
    }
  },

  // Get partner by ID
  getById: async (id) => {
    try {
      const response = await api.get(`/partners/${id}`);
      return response.data;
    } catch (e) {
    const data = localDataStore.getData();
    if (data) {
      const found = data.trading_partners.find(
        (p) => String(p._id) === String(id) || String(p.id) === String(id)
      );
      if (found) return found;
    }
      throw e;
    }
  },

  // Create partner (pass snake_case body from wizardFormToPartnerPayload)
  create: async (partnerData) => {
    const response = await api.post('/partners/', partnerData);
    return response.data;
  },

  // Update partner (full PUT)
  update: async (id, partnerData) => {
    const response = await api.put(`/partners/${id}`, partnerData);
    return response.data;
  },

  /** Partial update (merges nested JSON on server). */
  patch: async (id, partnerData) => {
    const response = await api.patch(`/partners/${id}`, partnerData);
    return response.data;
  },

  // Delete partner
  delete: async (id) => {
    await api.delete(`/partners/${id}`);
  },

  getTrainingOverview: async () => {
    const response = await api.get('/partners/training/overview');
    return response.data;
  },

  getTrainingStatus: async (partnerId) => {
    const response = await api.get(`/partners/${partnerId}/training/status`);
    return response.data;
  },

  getFieldMappings: async (partnerId) => {
    const response = await api.get(`/partners/${partnerId}/field-mappings`);
    return response.data;
  },

  uploadTrainingEdi: async (partnerId, files) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    const response = await api.post(`/partners/${partnerId}/training/edi`, fd);
    return response.data;
  },

  uploadTrainingMappings: async (partnerId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const response = await api.post(`/partners/${partnerId}/training/mappings`, fd);
    return response.data;
  },

  uploadTrainingErp: async (partnerId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const response = await api.post(`/partners/${partnerId}/training/erp`, fd);
    return response.data;
  },

  /**
   * Upload a spec document (PDF/DOC) and append it to the partner's spec_files list.
   * Returns { ok: true, file: { id, name, size, ext, uploaded_at } }
   */
  uploadSpecFile: async (partnerId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const response = await api.post(`/partners/${partnerId}/files/spec`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /**
   * Upload a sample EDI file and append it to the partner's sample_files list.
   * Returns { ok: true, file: { id, name, size, ext, uploaded_at } }
   */
  uploadSampleFile: async (partnerId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const response = await api.post(`/partners/${partnerId}/files/sample`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /**
   * Delete a specific partner file by its ID.
   * fileType: 'spec' | 'sample'
   * fileId: the uuid returned when the file was uploaded
   */
  deletePartnerFile: async (partnerId, fileType, fileId) => {
    const response = await api.delete(`/partners/${partnerId}/files/${fileType}/${fileId}`);
    return response.data;
  },

  /**
   * Get the download URL for a specific partner file.
   * fileType: 'spec' | 'sample'
   * fileId: the uuid of the file
   */
  getFileDownloadUrl: (partnerId, fileType, fileId) => {
    return `/api/v1/partners/${partnerId}/files/${fileType}/${fileId}`;
  },
};
