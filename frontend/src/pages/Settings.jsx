import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { authAPI, dashboardAPI } from '../utils/api.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import PushNotificationSetup from '../components/PushNotificationSetup.jsx';
import { User, Mail, Calendar, CheckSquare, Bell, Settings as SettingsIcon, Link2, Link2Off } from 'lucide-react';

const Settings = () => {
  const { user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [stats, setStats] = useState(null);
  const [integrations, setIntegrations] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [todos, setTodos] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [emails, setEmails] = useState([]);
  const [meetings, setMeetings] = useState([]);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch profile data
      const profileResponse = await authAPI.getUserProfile();
      setProfileData(profileResponse.data.user);
      setStats(profileResponse.data.stats);
      setIntegrations(profileResponse.data.integrations);

      // Fetch todos
      const todosResponse = await dashboardAPI.getTodos();
      setTodos(todosResponse.data || []);

      // Fetch notifications
      const notificationsResponse = await dashboardAPI.getNotifications();
      setNotifications(notificationsResponse.data || []);

      // Fetch emails
      try {
        const emailsResponse = await dashboardAPI.getEmails();
        setEmails(emailsResponse.data || []);
      } catch (e) {
        console.error('Error fetching emails:', e);
        setEmails([]);
      }

      // Fetch meetings
      try {
        const meetingsResponse = await dashboardAPI.getMeetings();
        setMeetings(meetingsResponse.data || []);
      } catch (e) {
        console.error('Error fetching meetings:', e);
        setMeetings([]);
      }
    } catch (err) {
      console.error('Error fetching profile data:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-48 animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-red-500 dark:text-red-400">Error: {error}</div>
        <button
          onClick={fetchAllData}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Profile & Settings</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Manage your account and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="w-5 h-5" />
              <span>Profile Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profileData?.picture && (
              <div className="flex justify-center">
                <img
                  src={profileData.picture}
                  alt={profileData.name || 'Profile'}
                  className="w-24 h-24 rounded-full"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Name
              </label>
              <input
                type="text"
                value={profileData?.name || ''}
                readOnly
                className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={profileData?.email || ''}
                readOnly
                className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700"
              />
            </div>
            {profileData?.created_at && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Member Since
                </label>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {new Date(profileData.created_at).toLocaleDateString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <SettingsIcon className="w-5 h-5" />
              <span>Statistics</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                    <div className="flex items-center space-x-2 mb-2">
                      <CheckSquare className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Todos</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {stats.todos_total}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {stats.todos_completed} completed
                    </div>
                  </div>
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="flex items-center space-x-2 mb-2">
                      <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Notifications</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {stats.notifications_total}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {stats.notifications_unread} unread
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Integrations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Link2 className="w-5 h-5" />
              <span>Integrations</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {integrations && (
              <>
                <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    {integrations.google_connected ? (
                      <Link2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <Link2Off className="w-5 h-5 text-gray-400" />
                    )}
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">Google Account</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {integrations.google_connected ? 'Connected' : 'Not Connected'}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    {integrations.gmail_enabled ? (
                      <Mail className="w-5 h-5 text-green-500" />
                    ) : (
                      <Mail className="w-5 h-5 text-gray-400" />
                    )}
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">Gmail</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {integrations.gmail_enabled ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    {integrations.calendar_enabled ? (
                      <Calendar className="w-5 h-5 text-green-500" />
                    ) : (
                      <Calendar className="w-5 h-5 text-gray-400" />
                    )}
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">Calendar</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {integrations.calendar_enabled ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Recent Todos ({todos.length})
              </h3>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {todos.slice(0, 5).map((todo) => (
                  <div key={todo.id} className="text-sm text-gray-600 dark:text-gray-400">
                    • {todo.task}
                  </div>
                ))}
                {todos.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-500">No todos</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Recent Emails ({emails.length})
              </h3>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {emails.slice(0, 5).map((email) => (
                  <div key={email.id} className="text-sm text-gray-600 dark:text-gray-400">
                    • {email.subject}
                  </div>
                ))}
                {emails.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-500">No emails</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Upcoming Meetings ({meetings.length})
              </h3>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {meetings.slice(0, 5).map((meeting) => (
                  <div key={meeting.id} className="text-sm text-gray-600 dark:text-gray-400">
                    • {meeting.title} at {meeting.time}
                  </div>
                ))}
                {meetings.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-500">No meetings</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Push Notifications */}
        <PushNotificationSetup />
      </div>
    </div>
  );
};

export default Settings;

