import axios from 'axios';
import axiosRetry from 'axios-retry';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
});

// Configure automatic retries for serverless cold start timeouts (500 errors from CPU limits)
axiosRetry(api, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 500;
  }
});

// Add a request interceptor to include the auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('dms_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle 401 Unauthorized errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear local storage and redirect to home (login) if token is invalid/expired
      // Skip this if the request was actually to the login endpoint, so we can show the error message
      if (!error.config.url.includes('/api/auth/login')) {
        localStorage.removeItem('dms_token');
        localStorage.removeItem('dms_user');
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
