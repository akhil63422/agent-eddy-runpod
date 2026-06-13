import api from './api';

export const analyticsService = {
  getDashboard: async (days = 7) => {
    const response = await api.get(`/analytics/dashboard?days=${days}`);
    return response.data;
  },

  getOperationsKpis: async () => {
    const response = await api.get('/analytics/operations-kpis');
    return response.data;
  },

  getOperationsKpiDetail: async (bucket, limit = 500) => {
    const response = await api.get(
      `/analytics/operations-kpis/detail?bucket=${encodeURIComponent(bucket)}&limit=${limit}`,
    );
    return response.data;
  },

  getTrends: async (metric = 'documents', days = 30, splitByDirection = false) => {
    const params = new URLSearchParams({ metric, days: days.toString() });
    if (splitByDirection) params.append('split_by_direction', 'true');
    const response = await api.get(`/analytics/trends?${params}`);
    return response.data;
  },

  getDocumentTypes: async (days = 7, limit = 5) => {
    const response = await api.get(`/analytics/document-types?days=${days}&limit=${limit}`);
    return response.data;
  },

  getPartnerPerformance: async (partnerId = null, days = 30, period = null) => {
    const params = new URLSearchParams({ days: days.toString() });
    if (partnerId) params.append('partner_id', partnerId);
    if (period) params.append('period', period);
    const response = await api.get(`/analytics/partner-performance?${params}`);
    return response.data;
  },

  /** Legacy exception-resolution SLA (severity timelines). */
  getExceptionSla: async (days = 7) => {
    const response = await api.get(`/analytics/exception-sla?days=${days}`);
    return response.data;
  },

  /** Master analytics: `7d` | `14d` | `30d` | `90d` */
  getSummary: async (period = '7d') => {
    const response = await api.get(`/analytics/summary?period=${encodeURIComponent(period)}`);
    return response.data;
  },

  getThroughput: async (period = '7d') => {
    const response = await api.get(`/analytics/throughput?period=${encodeURIComponent(period)}`);
    return response.data;
  },

  getExceptionTrends: async (period = '7d') => {
    const response = await api.get(`/analytics/exception-trends?period=${encodeURIComponent(period)}`);
    return response.data;
  },

  getAiPerformance: async (period = '7d') => {
    const response = await api.get(`/analytics/ai-performance?period=${encodeURIComponent(period)}`);
    return response.data;
  },

  /** Document processing latency vs threshold (default 5 min). */
  getProcessingSla: async (period = '7d') => {
    const response = await api.get(`/analytics/sla?period=${encodeURIComponent(period)}`);
    return response.data;
  },

  getAiUsage: async () => {
    const response = await api.get('/analytics/ai-usage');
    return response.data;
  },
};
