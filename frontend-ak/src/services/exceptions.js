import api from './api';
import { localDataStore } from '@/store/localDataStore';

export const exceptionsService = {
  // Get all exceptions (uses localStorage when imported data exists, unless forceApi=true)
  getAll: async (params = {}) => {
    const { forceApi, ...rest } = params;
    if (!forceApi) {
      const data = localDataStore.getData();
      if (data && data.exceptions?.length > 0) {
        return localDataStore.filterExceptions(data.exceptions, {
          skip: rest.skip ?? 0,
          limit: rest.limit ?? 100,
          status: rest.status,
          severity: rest.severity,
          exception_type: rest.exception_type,
          partner_id: rest.partner_id,
          document_id: rest.document_id,
        });
      }
    }
    const { skip = 0, limit = 100, status, severity, exception_type, partner_id, document_id } = rest;
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    });
    if (status) queryParams.append('status', status);
    if (severity) queryParams.append('severity', severity);
    if (exception_type) queryParams.append('exception_type', exception_type);
    if (partner_id) queryParams.append('partner_id', partner_id);
    if (document_id) queryParams.append('document_id', document_id);
    const response = await api.get(`/exceptions/?${queryParams}`);
    return response.data;
  },

  // Get exception by ID
  getById: async (id) => {
    const data = localDataStore.getData();
    if (data) {
      const found = data.exceptions.find(
        (e) => String(e._id) === String(id) || String(e.id) === String(id)
      );
      if (found) return found;
    }
    const response = await api.get(`/exceptions/${id}`);
    return response.data;
  },

  // Create exception
  create: async (exceptionData) => {
    const response = await api.post('/exceptions', exceptionData);
    return response.data;
  },

  // Update exception
  update: async (id, exceptionData) => {
    const response = await api.put(`/exceptions/${id}`, exceptionData);
    return response.data;
  },

  /** Dashboard KPI counts (always calls API). */
  getSummary: async (params = {}) => {
    const dr = params.date_range || 'last30days';
    const response = await api.get(`/exceptions/summary?date_range=${encodeURIComponent(dr)}`);
    return response.data;
  },

  /** Paginated unified list + type_breakdown (always calls API). */
  getList: async (params = {}) => {
    const q = new URLSearchParams();
    q.set('date_range', params.date_range || 'last30days');
    q.set('page', String(params.page ?? 1));
    q.set('page_size', String(params.page_size ?? 20));
    if (params.partner && params.partner !== 'all') q.set('partner', params.partner);
    if (params.severity && params.severity !== 'all') q.set('severity', params.severity);
    if (params.status && params.status !== 'all') q.set('status', params.status);
    if (params.exception_type && params.exception_type !== 'all') {
      q.set('exception_type', params.exception_type);
    }
    if (params.search && params.search.trim()) q.set('search', params.search.trim());
    const response = await api.get(`/exceptions/list?${q}`);
    return response.data;
  },

  /** Resolve exception (DB or synthetic — pass document_id + exception_type when synthetic). */
  resolve: async (id, body = {}) => {
    const response = await api.post(`/exceptions/${encodeURIComponent(id)}/resolve`, body);
    return response.data;
  },
};
