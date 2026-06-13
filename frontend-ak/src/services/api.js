import axios from 'axios';
import { resolveRuntimeConfig } from '@/config/runtimeConfig';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000/api/v1';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60 second timeout (cloud cold start can be slow)
});

const configReady = (async () => {
  const config = await resolveRuntimeConfig();
  if (config?.apiBaseUrl) {
    api.defaults.baseURL = `${config.apiBaseUrl}/`;
  }
})();

// Ensure config is loaded before first request (config.json overrides build-time URL)
api.interceptors.request.use(
  async (config) => {
    await configReady;
    // Axios: baseURL + path starting with / replaces path. Strip leading slash for correct URL.
    if (config.url?.startsWith('/') && config.baseURL?.startsWith('http')) {
      config.url = config.url.slice(1);
    }
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // FormData needs multipart boundary - let axios set it (don't force application/json)
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (err) => Promise.reject(err)
);

// Response interceptor - Handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isDevSession = localStorage.getItem('dev_session') === 'true';
      if (!isDevSession) {
        // Unauthorized - clear token and redirect to login
        localStorage.removeItem('access_token');
        localStorage.removeItem('user_id');
        localStorage.removeItem('username');
        localStorage.removeItem('role');
        localStorage.removeItem('company_id');
        const path = typeof window !== 'undefined' ? window.location.pathname : '';
        if (!path.startsWith('/login') && !path.startsWith('/register')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
