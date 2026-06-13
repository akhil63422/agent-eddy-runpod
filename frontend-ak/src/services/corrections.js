import api from './api';

/**
 * Learning loop: record user corrections for reuse in AI domain context.
 */
export const correctionsService = {
  /**
   * @param {{ partner_id: string, document_type: string, field_name: string, ai_value?: string, corrected_value?: string, confidence_score?: number }} payload
   */
  create: async (payload) => {
    const response = await api.post('/corrections', payload);
    return response.data;
  },
};
