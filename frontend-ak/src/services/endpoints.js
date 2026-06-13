import api from './api';

export const endpointsService = {
  /** List all endpoints, optionally filtered by partnerId. */
  list: async (partnerId = null) => {
    const params = partnerId ? `?partner_id=${partnerId}` : '';
    const response = await api.get(`/endpoints/${params}`);
    return response.data;
  },

  /** Get a single endpoint by ID. */
  getById: async (id) => {
    const response = await api.get(`/endpoints/${id}`);
    return response.data;
  },

  /** Create a new endpoint. */
  create: async (data) => {
    const response = await api.post('/endpoints/', data);
    return response.data;
  },

  /** Full update of an endpoint. */
  update: async (id, data) => {
    const response = await api.put(`/endpoints/${id}`, data);
    return response.data;
  },

  /** Delete an endpoint. */
  delete: async (id) => {
    await api.delete(`/endpoints/${id}`);
  },

  /**
   * Test connectivity for an endpoint.
   * Returns { ok, result, message, endpoint }
   */
  test: async (id) => {
    const response = await api.post(`/endpoints/${id}/test`);
    return response.data;
  },
};
