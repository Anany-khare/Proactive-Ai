import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  // Initiate Google OAuth login
  googleLogin: () => {
    window.location.href = `${API_BASE_URL}/auth/login`;
  },
  
  // Get current user
  getCurrentUser: () => apiClient.get('/auth/me'),
  
  // Handle OAuth callback (token is in URL)
  handleCallback: (token) => {
    localStorage.setItem('auth_token', token);
    return Promise.resolve({ token });
  },
};

// Dashboard API
export const dashboardAPI = {
  // Get all contextual dashboard data
  getContextualData: () => apiClient.get('/api/dashboard/contextual-data'),
  
  // Get emails
  getEmails: () => apiClient.get('/api/dashboard/emails'),
  
  // Get meetings
  getMeetings: () => apiClient.get('/api/dashboard/meetings'),
  
  // Get todos
  getTodos: () => apiClient.get('/api/dashboard/todos'),
  
  // Create todo
  createTodo: (todoData) => apiClient.post('/api/dashboard/todos', todoData),
  
  // Update todo
  updateTodo: (todoId, todoData) => apiClient.patch(`/api/dashboard/todos/${todoId}`, todoData),
  
  // Get notifications
  getNotifications: () => apiClient.get('/api/dashboard/notifications'),
  
  // Mark notification as read
  markNotificationRead: (notificationId) => 
    apiClient.patch(`/api/dashboard/notifications/${notificationId}/read`),
};

export default apiClient;
