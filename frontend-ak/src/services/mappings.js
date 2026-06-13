import api from './api';

export const mappingsService = {
  // Get all mappings
  getAll: async (params = {}) => {
    const { skip = 0, limit = 100, partner_id, document_type, direction, is_active } = params;
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    });
    if (partner_id) queryParams.append('partner_id', partner_id);
    if (document_type) queryParams.append('document_type', document_type);
    if (direction) queryParams.append('direction', direction);
    if (is_active !== undefined) queryParams.append('is_active', is_active.toString());
    
    const response = await api.get(`/mappings/?${queryParams}`);
    return response.data;
  },

  // Get mapping by ID
  getById: async (id) => {
    const response = await api.get(`/mappings/${id}`);
    return response.data;
  },

  // Create mapping
  create: async (mappingData) => {
    const response = await api.post('/mappings', mappingData);
    return response.data;
  },

  // Update mapping
  update: async (id, mappingData) => {
    const response = await api.put(`/mappings/${id}`, mappingData);
    return response.data;
  },

  // Delete mapping
  delete: async (id) => {
    await api.delete(`/mappings/${id}`);
  },
};
