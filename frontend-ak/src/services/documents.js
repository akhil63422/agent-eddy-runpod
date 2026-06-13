import api from './api';
import { localDataStore } from '@/store/localDataStore';

export const documentsService = {
  // Get all documents (uses localStorage when imported data exists, unless forceApi=true)
  // Inbound & Outbound always use API, never local db
  getAll: async (params = {}) => {
    const { forceApi, ...rest } = params;
    const useApi = forceApi || (rest.direction && ['Inbound', 'Outbound'].includes(rest.direction));
    if (!useApi) {
      const data = localDataStore.getData();
      if (data && data.documents?.length > 0) {
        return localDataStore.filterDocuments(data.documents, {
          skip: rest.skip ?? 0,
          limit: rest.limit ?? 100,
          direction: rest.direction,
          status: rest.status,
          partner_id: rest.partner_id,
          document_type: rest.document_type,
        });
      }
    }
    const { skip = 0, limit = 100, direction, status, partner_id, document_type, summary } = rest;
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    });
    if (summary) queryParams.append('summary', 'true');
    if (direction) queryParams.append('direction', direction);
    const viewerRole = typeof window !== 'undefined' ? localStorage.getItem('role') : null;
    if (viewerRole) queryParams.append('viewer_role', viewerRole);
    if (status) queryParams.append('status', status);
    if (partner_id) queryParams.append('partner_id', partner_id);
    if (document_type) queryParams.append('document_type', document_type);
    const response = await api.get(`/documents/?${queryParams}`);
    return response.data;
  },

  /** Hierarchical transaction groups (PO + 997, 855, …) — GET /transactions/grouped */
  getGrouped: async (params = {}) => {
    const { limit = 40, partner_id } = params;
    const q = new URLSearchParams({ limit: String(limit) });
    if (partner_id) q.append('partner_id', partner_id);
    const response = await api.get(`/transactions/grouped?${q}`);
    return response.data;
  },

  // Get document by ID (forceApi: skip localStorage, always fetch from backend)
  getById: async (id, forceApi = false) => {
    if (!forceApi) {
      const data = localDataStore.getData();
      if (data) {
        const found = data.documents.find(
          (d) => String(d._id) === String(id) || String(d.id) === String(id)
        );
        if (found) return found;
      }
    }
    const viewerRole = typeof window !== 'undefined' ? localStorage.getItem('role') : null;
    const params = viewerRole ? `?viewer_role=${encodeURIComponent(viewerRole)}` : '';
    const response = await api.get(`/documents/${id}${params}`);
    return response.data;
  },

  // Create document
  create: async (documentData) => {
    const response = await api.post('/documents', documentData);
    return response.data;
  },

  // Update document
  update: async (id, documentData) => {
    const response = await api.put(`/documents/${id}`, documentData);
    return response.data;
  },

  /** Original uploaded file content only (never modified). */
  getRawInput: async (documentId) => {
    const response = await api.get(`/documents/${documentId}/raw-input`);
    return response.data;
  },

  /** Generated X12 from canonical + partner rules (x12_output only; never raw upload). */
  getGeneratedX12: async (documentId) => {
    const response = await api.get(`/documents/${documentId}/generated-x12`);
    return response.data;
  },

  /** Pre-upload exact partner match (no document created). */
  validatePartner: async (payload) => {
    const response = await api.post('/documents/validate-partner', payload);
    return response.data;
  },

  /**
   * Multipart upload — long timeout for large files / slow networks only (processing runs server-side after 201).
   */
  uploadFile: async (formData) => {
    const response = await api.post('/documents/upload', formData, { timeout: 180000 });
    return response.data;
  },

  // Get document with review suggestions (rule-based immediately; AI in background)
  getReview: async (id) => {
    const response = await api.get(`/documents/${id}/review`);
    return response.data;
  },

  // Fetch cached AI suggestions (poll after load; non-blocking)
  getAiSuggestions: async (id) => {
    const response = await api.get(`/documents/${id}/review/ai-suggestions`);
    return response.data;
  },

  // Apply a field correction
  applyCorrection: async (id, correction) => {
    const response = await api.post(`/documents/${id}/review/apply`, correction);
    return response.data;
  },

  // Approve a "Needs Review" document -> "Ready for Dispatch"
  approve: async (id) => {
    const response = await api.post(`/documents/${id}/approve`);
    return response.data;
  },

  /** Deliver approved outbound EDI via partner API / SFTP / S3 (after Ready for Dispatch). */
  dispatchOutbound: async (id) => {
    const response = await api.post(`/documents/${id}/dispatch-outbound`);
    return response.data;
  },

  // Patch canonical JSON fields (manual HITL correction), returns updated canonical + validation
  patchCanonical: async (id, editsOrPayload) => {
    const payload = Array.isArray(editsOrPayload)
      ? { edits: editsOrPayload }
      : {
          edits: editsOrPayload?.edits ?? [],
          header: editsOrPayload?.header,
        };
    const response = await api.patch(`/documents/${id}/canonical`, payload);
    return response.data;
  },

  reject: async (id, reason = '') => {
    const response = await api.post(`/documents/${id}/reject`, { reason });
    return response.data;
  },

  // Re-run the 10-step pipeline
  reprocess: async (id) => {
    const response = await api.post(`/documents/${id}/reprocess`);
    return response.data;
  },

  // Create outbound transmission from inbound (replaces legacy Send to ERP)
  createOutboundFromInbound: async (id) => {
    const response = await api.post(`/documents/${id}/create-outbound`);
    return response.data;
  },

  // Generate canonical JSON from parsed segments
  generateCanonical: async (id) => {
    const response = await api.post(`/documents/${id}/generate-canonical`);
    return response.data;
  },

  // Convert canonical JSON to X12 EDI (for JSON/XML/CSV sources — partners that need EDI)
  generateX12: async (canonical, docType = '850') => {
    const response = await api.post('/ingestion/generate-x12', {
      canonical,
      doc_type: docType,
    });
    return response.data;
  },

  // Generate X12 from document's canonical, persist to x12_output, return EDI string
  generateX12ForDocument: async (documentId) => {
    const response = await api.post(`/documents/${documentId}/generate-x12`);
    return response.data;
  },

  // Generate source structure (field_mappings, ai_corrections) for JSON/XML/CSV documents
  generateSourceStructure: async (documentId) => {
    const response = await api.post(`/documents/${documentId}/generate-source-structure`);
    return response.data;
  },

  // Mark AI corrections as resolved (applied or kept) — disables approval buttons
  setCorrectionsResolved: async (documentId, resolved) => {
    const response = await api.post(`/documents/${documentId}/set-corrections-resolved`, {
      resolved,
    });
    return response.data;
  },

  // Get linked documents and SLA information
  getRelatedDocuments: async (docId) => {
    const response = await api.get(`/documents/${docId}/related`);
    return response.data;
  },
};
