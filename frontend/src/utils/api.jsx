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

  // Update user profile settings
  updateProfile: (data) => apiClient.patch('/auth/profile', data),

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

  // Get all emails with query and pagination
  getAllEmails: (query = '', maxResults = 20, pageToken = null) =>
    apiClient.get('/api/emails/', { params: { query, max_results: maxResults, page_token: pageToken } }),

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

  // Manually reschedule meeting (with emails)
  rescheduleMeetingManual: (eventId, data) => apiClient.post(`/api/meetings/${eventId}/reschedule-manual`, data),

  // Get weekly events
  getWeeklyEvents: (weekStart = null) =>
    apiClient.get('/api/meetings/calendar/week', { params: weekStart ? { week_start: weekStart } : {} }),

  // Get monthly events
  getMonthlyEvents: (month = null) =>
    apiClient.get('/api/meetings/calendar/month', { params: month ? { month } : {} }),

  // Get events by date range
  getEventsByRange: (startDate, endDate, maxResults = 100) =>
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

// AI API
export const aiAPI = {
  // Chat with AI assistant
  chat: (message) => apiClient.post('/api/ai/chat', { message }),

  // Chat history
  getChatHistory: (limit = 50) => apiClient.get(`/api/ai/chat/history?limit=${limit}`),
  clearChatHistory: () => apiClient.delete('/api/ai/chat/history'),

  // Generate reply
  generateReply: (emailBody) => apiClient.post('/api/ai/generate-reply', { email_body: emailBody }),

  // Get proactive dashboard insights (Gemini-powered briefing + conflicts)
  getInsights: () => apiClient.get('/api/ai/insights'),

  // Detect meeting conflicts
  getConflicts: () => apiClient.get('/api/ai/conflicts'),

  // Ask Gemini for rescheduling suggestions for conflicts
  resolveConflicts: () => apiClient.post('/api/ai/conflicts/resolve'),

  // Email smart actions
  smartReply: (emailId) => apiClient.post('/api/ai/smart-reply', { email_id: emailId }),
  extractMeeting: (text) => apiClient.post('/api/ai/meeting/extract', { text }),
  logProactiveAction: (logData) => apiClient.post('/api/ai/log-action', logData),

  // Proactive rescheduling
  autoReschedule: () => apiClient.post('/api/ai/auto-reschedule'),
  getFreeSlots: (duration = 60, days = 7) => apiClient.get(`/api/ai/free-slots?duration=${duration}&days=${days}`),
  executeProactiveSync: (emailId, meetingInfo, plan) => 
    apiClient.post('/api/ai/execute-proactive-sync', { email_id: emailId, meeting_info: meetingInfo, plan }),
};

// Teams API
export const teamsAPI = {
  getTeams: () => apiClient.get('/api/teams/'),
  createTeam: (data) => apiClient.post('/api/teams/', data),
  updateTeam: (teamId, data) => apiClient.patch(`/api/teams/${teamId}`, data),
  deleteTeam: (teamId) => apiClient.delete(`/api/teams/${teamId}`),
};

// Health API (Fitbit integration)
export const healthAPI = {
  // Get connection status
  getStatus: () => apiClient.get('/api/health/status'),

  // Get Fitbit connect URL
  getConnectUrl: () => apiClient.get('/api/health/connect'),

  // Get health data for a date
  getData: (date = null) => apiClient.get('/api/health/data', { params: date ? { date } : {} }),

  // Force sync from Fitbit
  sync: () => apiClient.post('/api/health/sync'),

  // Manual entry (for testing)
  manualEntry: (sleepHours, steps, restingHr) =>
    apiClient.post('/api/health/manual', null, {
      params: { sleep_hours: sleepHours, steps, resting_hr: restingHr },
    }),
};

// Agentic Actions API (1-click operations)
export const actionsAPI = {
  // Reschedule a meeting
  reschedule: (eventId, newStart, newEnd, reason = '') =>
    apiClient.post('/api/actions/reschedule', {
      event_id: eventId,
      new_start: newStart,
      new_end: newEnd,
      reason,
    }),

  // Draft an AI email reply in Gmail
  draftReply: (emailId, tone = 'professional') =>
    apiClient.post('/api/actions/draft-email', {
      email_id: emailId,
      tone,
    }),
};

export default apiClient;
