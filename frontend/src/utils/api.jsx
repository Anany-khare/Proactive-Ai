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
  
  // Get user profile with stats
  getUserProfile: () => apiClient.get('/auth/profile'),
  
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

// Email API
export const emailAPI = {
  // Get email by ID
  getEmail: (messageId) => apiClient.get(`/api/emails/${messageId}`),
  
  // Get all emails with query
  getAllEmails: (query = '', maxResults = 50) => 
    apiClient.get('/api/emails/', { params: { query, max_results: maxResults } }),
  
  // Reply to email
  replyToEmail: (messageId, replyText) => 
    apiClient.post(`/api/emails/${messageId}/reply`, { message_id: messageId, reply_text: replyText }),
  
  // Forward email
  forwardEmail: (messageId, toEmails, forwardText = '') => 
    apiClient.post(`/api/emails/${messageId}/forward`, { 
      message_id: messageId, 
      to_emails: toEmails, 
      forward_text: forwardText 
    }),
  
  // Delete email
  deleteEmail: (messageId) => apiClient.delete(`/api/emails/${messageId}`),
  
  // Mark email as read/unread
  markEmailRead: (messageId, read = true) => 
    apiClient.patch(`/api/emails/${messageId}/read`, { message_id: messageId, read }),
  
  // Get email thread
  getEmailThread: (threadId) => apiClient.get(`/api/emails/thread/${threadId}`),
};

// Meeting API
export const meetingAPI = {
  // Get meeting by ID
  getMeeting: (eventId) => apiClient.get(`/api/meetings/${eventId}`),
  
  // Create meeting
  createMeeting: (meetingData) => apiClient.post('/api/meetings/', meetingData),
  
  // Update meeting
  updateMeeting: (eventId, meetingData) => apiClient.patch(`/api/meetings/${eventId}`, meetingData),
  
  // Delete meeting
  deleteMeeting: (eventId) => apiClient.delete(`/api/meetings/${eventId}`),
  
  // Get weekly events
  getWeeklyEvents: (weekStart = null) => 
    apiClient.get('/api/meetings/calendar/week', { params: weekStart ? { week_start: weekStart } : {} }),
  
  // Get monthly events
  getMonthlyEvents: (month = null) => 
    apiClient.get('/api/meetings/calendar/month', { params: month ? { month } : {} }),
  
  // Get events by date range
  getEventsByDateRange: (startDate, endDate, maxResults = 100) => 
    apiClient.get('/api/meetings/range/events', { 
      params: { start_date: startDate, end_date: endDate, max_results: maxResults } 
    }),
};

// Real-time API
export const realtimeAPI = {
  // Get SSE stream URL
  getStreamUrl: () => `${API_BASE_URL}/api/realtime/stream`,
  
  // Trigger email update (for testing)
  triggerEmailUpdate: (messageId, action) => 
    apiClient.post('/api/realtime/trigger/email', null, { 
      params: { message_id: messageId, action } 
    }),
  
  // Trigger meeting update (for testing)
  triggerMeetingUpdate: (eventId, action) => 
    apiClient.post('/api/realtime/trigger/meeting', null, { 
      params: { event_id: eventId, action } 
    }),
};

// Push Notification API
export const pushAPI = {
  // Subscribe to push notifications
  subscribe: (subscription) => apiClient.post('/api/push/subscribe', subscription),
  
  // Unsubscribe from push notifications
  unsubscribe: (endpoint) => apiClient.delete('/api/push/unsubscribe', { 
    params: { endpoint } 
  }),
  
  // Get subscriptions
  getSubscriptions: () => apiClient.get('/api/push/subscriptions'),
};

// Admin API
export const adminAPI = {
  // Clear dashboard cache
  clearCache: () => apiClient.delete('/api/admin/cache/clear'),
};

export default apiClient;
