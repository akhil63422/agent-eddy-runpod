/**
 * System Configuration service — wraps /system-config/* endpoints.
 */
import api from './api';

export const systemConfigService = {
  // Partner Identifiers
  listPartnerIdentifiers: (params = {}) =>
    api.get('/system-config/partner-identifiers', { params }).then(r => r.data),
  createPartnerIdentifier: (body) =>
    api.post('/system-config/partner-identifiers', body).then(r => r.data),
  updatePartnerIdentifier: (id, body) =>
    api.patch(`/system-config/partner-identifiers/${id}`, body).then(r => r.data),
  deletePartnerIdentifier: (id) =>
    api.delete(`/system-config/partner-identifiers/${id}`),

  // Partner Rules
  listPartnerRules: (params = {}) =>
    api.get('/system-config/partner-rules', { params }).then(r => r.data),
  createPartnerRule: (body) =>
    api.post('/system-config/partner-rules', body).then(r => r.data),
  updatePartnerRule: (id, body) =>
    api.patch(`/system-config/partner-rules/${id}`, body).then(r => r.data),
  deletePartnerRule: (id) =>
    api.delete(`/system-config/partner-rules/${id}`),

  // Document Types
  listDocumentTypes: (params = {}) =>
    api.get('/system-config/document-types', { params }).then(r => r.data),
  createDocumentType: (body) =>
    api.post('/system-config/document-types', body).then(r => r.data),
  updateDocumentType: (id, body) =>
    api.patch(`/system-config/document-types/${id}`, body).then(r => r.data),

  // Segment Definitions
  listSegmentDefinitions: (params = {}) =>
    api.get('/system-config/segment-definitions', { params }).then(r => r.data),
  createSegmentDefinition: (body) =>
    api.post('/system-config/segment-definitions', body).then(r => r.data),
  updateSegmentDefinition: (id, body) =>
    api.patch(`/system-config/segment-definitions/${id}`, body).then(r => r.data),

  // Supported Formats
  listSupportedFormats: (params = {}) =>
    api.get('/system-config/supported-formats', { params }).then(r => r.data),
  toggleFormat: (id, isActive) =>
    api.patch(`/system-config/supported-formats/${id}`, null, { params: { is_active: isActive } }).then(r => r.data),

  // Seed
  runSeed: () =>
    api.post('/system-config/seed').then(r => r.data),
};
