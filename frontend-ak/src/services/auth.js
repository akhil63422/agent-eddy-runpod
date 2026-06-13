import api from './api';

export const authService = {
  // Login with org scope (orgCode required)
  login: async (orgCode, username, password, role = null) => {
    const url = role ? `/auth/login?role=${encodeURIComponent(role)}` : '/auth/login';
    const response = await api.post(url, {
      org_code: (orgCode || '').trim(),
      username: (username || '').trim(),
      password,
    });
    
    // Store token
    if (response.data.access_token) {
      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('user_id', response.data.user_id);
      localStorage.setItem('username', response.data.username);
      localStorage.setItem('role', response.data.role);
      if (response.data.company_id) {
        localStorage.setItem('company_id', response.data.company_id);
      }
    }
    
    return response.data;
  },

  // Register (legacy - creates user without org)
  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  // Create new organization and first user
  registerCreateOrg: async (data) => {
    const response = await api.post('/auth/register/create-org', data);
    return response.data;
  },

  // Join existing organization
  registerJoinOrg: async (data) => {
    const response = await api.post('/auth/register/join', data);
    return response.data;
  },

  // Lookup organization by code (for join flow)
  getCompanyByCode: async (orgCode) => {
    const response = await api.get(`/companies/by-code/${encodeURIComponent(orgCode)}`);
    return response.data;
  },

  // Get current user
  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  /** Local preview when the API is unavailable — not valid for production auth. */
  enterDevSession: () => {
    localStorage.setItem('access_token', 'dev-local-preview');
    localStorage.setItem('user_id', 'dev-user');
    localStorage.setItem('username', 'dev');
    localStorage.setItem('role', 'Admin');
    localStorage.setItem('company_id', 'DEFAULT');
    localStorage.setItem('dev_session', 'true');
  },

  isDevSession: () => localStorage.getItem('dev_session') === 'true',

  // Logout
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    localStorage.removeItem('company_id');
    localStorage.removeItem('dev_session');
  },

  // Check if authenticated
  isAuthenticated: () => {
    return !!localStorage.getItem('access_token');
  },
};
