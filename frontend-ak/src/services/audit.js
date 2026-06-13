import api from './api';
import { localDataStore } from '@/store/localDataStore';

/** New unified audit API (PostgreSQL) — always hits backend. */
export const auditLogService = {
  getSummary: async (params = {}) => {
    const q = new URLSearchParams();
    q.set('period_days', String(params.period_days ?? 7));
    if (params.date_to) q.set('date_to', params.date_to);
    if (params.date_from) q.set('date_from', params.date_from);
    const res = await api.get(`/audit-logs/summary?${q}`);
    return res.data;
  },

  getFacets: async (params = {}) => {
    const q = new URLSearchParams();
    if (params.date_from) q.set('date_from', params.date_from);
    if (params.date_to) q.set('date_to', params.date_to);
    q.set('period_days', String(params.period_days ?? 90));
    const res = await api.get(`/audit-logs/facets?${q}`);
    return res.data;
  },

  getList: async (params = {}) => {
    const q = new URLSearchParams();
    q.set('page', String(params.page ?? 1));
    q.set('page_size', String(params.page_size ?? 25));
    if (params.period_days != null) q.set('period_days', String(params.period_days));
    if (params.date_from) q.set('date_from', params.date_from);
    if (params.date_to) q.set('date_to', params.date_to);
    if (params.user && params.user !== 'all') q.set('user', params.user);
    if (params.action_type && params.action_type !== 'all') q.set('action_type', params.action_type);
    if (params.partner && params.partner !== 'all') q.set('partner', params.partner);
    if (params.search && params.search.trim()) q.set('search', params.search.trim());
    const res = await api.get(`/audit-logs/list?${q}`);
    return res.data;
  },

  /** Returns Blob. Caller should revoke object URL after download. */
  export: async (params = {}) => {
    const q = new URLSearchParams();
    q.set('date_from', params.date_from);
    q.set('date_to', params.date_to);
    q.set('format', params.format === 'json' ? 'json' : 'csv');
    if (params.user && params.user !== 'all') q.set('user', params.user);
    if (params.action_type && params.action_type !== 'all') q.set('action_type', params.action_type);
    if (params.partner && params.partner !== 'all') q.set('partner', params.partner);
    if (params.search && params.search.trim()) q.set('search', params.search.trim());
    const res = await api.get(`/audit-logs/export?${q}`, { responseType: 'blob' });
    return res.data;
  },
};

export const auditService = {
  // Get all audit logs (uses localStorage when imported data exists)
  getAll: async (params = {}) => {
    const data = localDataStore.getData();
    if (data) {
      return localDataStore.filterAuditLogs(data.audit_logs, {
        skip: params.skip ?? 0,
        limit: params.limit ?? 100,
        action_type: params.action_type,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        user_id: params.user_id,
      });
    }
    const { skip = 0, limit = 100, action_type, entity_type, entity_id, user_id, start_date, end_date } = params;
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    });
    if (action_type) queryParams.append('action_type', action_type);
    if (entity_type) queryParams.append('entity_type', entity_type);
    if (entity_id) queryParams.append('entity_id', entity_id);
    if (user_id) queryParams.append('user_id', user_id);
    if (start_date) queryParams.append('start_date', start_date);
    if (end_date) queryParams.append('end_date', end_date);
    const response = await api.get(`/audit/?${queryParams}`);
    return response.data;
  },

  getById: async (id) => {
    const data = localDataStore.getData();
    if (data) {
      const found = data.audit_logs.find(
        (a) => String(a._id) === String(id) || String(a.id) === String(id)
      );
      if (found) return found;
    }
    const response = await api.get(`/audit/${id}`);
    return response.data;
  },
};
