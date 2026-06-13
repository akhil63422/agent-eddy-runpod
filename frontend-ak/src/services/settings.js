import api from './api';

/**
 * Platform settings API - Slack webhook, notification preferences
 */
export const getSettings = async () => {
  const { data } = await api.get('/settings', {
    params: { _t: Date.now() },
    headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' },
  });
  return data;
};

export const updateSettings = async (updates) => {
  const { data } = await api.patch('/settings', updates);
  return data;
};
