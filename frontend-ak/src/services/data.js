import api from './api';
import { localDataStore } from '@/store/localDataStore';

export const dataService = {
  // Export: prefer localStorage when available, else API
  exportData: async () => {
    const local = localDataStore.getData();
    if (local) {
      return {
        version: local.version || '1.0',
        exported_at: local.imported_at || new Date().toISOString(),
        trading_partners: local.trading_partners,
        documents: local.documents,
        exceptions: local.exceptions,
        audit_logs: local.audit_logs,
      };
    }
    const response = await api.get('/data/export/');
    return response.data;
  },

  // Import: save to localStorage (browser) so workflow works; optionally sync to API
  importData: async (payload) => {
    localDataStore.setData(payload);
    try {
      const response = await api.post('/data/import/', payload);
      return response.data;
    } catch {
      return { success: true, message: 'Data saved to browser. Workflow will use local data.', counts: {} };
    }
  },

  hasLocalData: () => localDataStore.hasLocalData(),
  clearLocalData: () => localDataStore.clear(),
};
