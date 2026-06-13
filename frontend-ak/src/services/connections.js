import api from './api';

export const connectionsService = {
  list: async (partnerId = null) => {
    const params = partnerId ? `?partner_id=${partnerId}` : '';
    const response = await api.get(`/connections/${params}`);
    return response.data;
  },

  get: async (id) => {
    const response = await api.get(`/connections/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/connections/', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/connections/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/connections/${id}`);
    return response.data;
  },

  getDirectionMatrix: async () => {
    const response = await api.get('/connections/direction-matrix/preview');
    return response.data;
  },
};
