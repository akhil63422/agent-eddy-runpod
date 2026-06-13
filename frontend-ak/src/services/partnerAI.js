import api from './api';

export const partnerAIService = {
  // Check AI status (Hugging Face models available)
  getStatus: async () => {
    const response = await api.get('/partners/ai/status');
    return response.data;
  },

  // Process chat message
  processChat: async (message, conversationHistory = [], context = {}) => {
    const formData = new FormData();
    formData.append('message', message);
    if (conversationHistory.length > 0) {
      formData.append('conversation_history', JSON.stringify(conversationHistory));
    }
    if (Object.keys(context).length > 0) {
      formData.append('context', JSON.stringify(context));
    }
    
    // Do NOT set Content-Type - axios adds multipart boundary automatically
    const response = await api.post('/partners/ai/chat', formData);
    return response.data;
  },

  // Process voice input (context optional: { current_question } for backend)
  processVoice: async (audioFile, context = {}) => {
    const formData = new FormData();
    formData.append('audio_file', audioFile);
    if (context.current_question) {
      formData.append('current_question', context.current_question);
    }
    const response = await api.post('/partners/ai/voice', formData);
    return response.data;
  },

  // Process document upload
  processDocument: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/partners/ai/document', formData);
    return response.data;
  },

  // Save partner from AI extracted data
  savePartner: async (partnerData) => {
    const response = await api.post('/partners/ai/save-partner', partnerData);
    return response.data;
  },

  // Text-to-speech (neural female voice via edge-tts)
  getTTSAudio: async (text, voice = 'en-US-JennyNeural') => {
    const params = new URLSearchParams({ text: text.substring(0, 1000), voice });
    const base = api.defaults.baseURL || '/api/v1';
    const fullBase = base.startsWith('http') ? base : (typeof window !== 'undefined' ? window.location.origin : '') + base;
    const res = await fetch(`${fullBase}/partners/ai/tts?${params}`);
    if (!res.ok) throw new Error('TTS failed');
    return res.blob();
  },
};
