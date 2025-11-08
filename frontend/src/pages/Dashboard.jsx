import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { useContextualData } from '../hooks/useContextualData.jsx';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates.jsx';
import { Mail, Calendar, CheckSquare, Bell, Lightbulb, Clock, User, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button.jsx';

const Dashboard = () => {
  const { dailyBrief, emails, meetings, todos, notifications, suggestions, isLoading, error, refetch } = useContextualData();
  
  // Real-time updates
  const handleEmailUpdate = (newEmails) => {
    // Refresh dashboard data when new emails arrive
    if (refetch) {
      refetch();
    }
  };

  const handleMeetingUpdate = (newMeetings) => {
    // Refresh dashboard data when new meetings arrive
    if (refetch) {
      refetch();
    }
  };

  const { connected } = useRealtimeUpdates(handleEmailUpdate, handleMeetingUpdate);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-48 animate-pulse"></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          {dailyBrief && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{dailyBrief.date}</p>
          )}
        </div>
        {connected && (
          <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-sm">Real-time updates active</span>
          </div>
        )}
      </div>

      {/* Smart Summary - Daily Brief */}
      {dailyBrief && (
        <Card className="bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 border-primary-200 dark:border-primary-800">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Lightbulb className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <span>Daily Brief</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{dailyBrief.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest Emails Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Mail className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <span>Latest Emails</span>
              </div>
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                {emails.length} unread
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {emails.slice(0, 5).map((email) => (
                <div
                  key={email.id}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                    <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                        {email.from_email || 'Unknown'}
                      </span>
                      {email.priority === 'high' && (
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                      {email.unread && (
                        <span className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0"></span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
                      {email.time}
                    </span>
                  </div>
                  <p 
                    className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1 cursor-pointer hover:text-primary-600 dark:hover:text-primary-400"
                    onClick={() => {
                      if (email.thread_id) {
                        window.location.href = `/emails?thread=${email.thread_id}`;
                      } else {
                        window.location.href = `/emails/${email.id}`;
                      }
                    }}
                  >
                    {email.subject}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                    {email.preview}
                  </p>
                </div>
              ))}
              {emails.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No unread emails
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Meetings Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <span>Upcoming Meetings</span>
              </div>
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                Next {meetings.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {meetings.slice(0, 3).map((meeting) => (
                <div
                  key={meeting.id}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-1">
                        {meeting.title}
                      </h4>
                      <div className="flex items-center space-x-4 text-xs text-gray-600 dark:text-gray-400">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{meeting.time}</span>
                        </div>
                        <span>{meeting.duration}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1 text-xs text-gray-600 dark:text-gray-400">
                      <span>{meeting.location}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      {meeting.attendees.slice(0, 3).map((attendee, idx) => (
                        <div
                          key={idx}
                          className="w-6 h-6 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center"
                          title={attendee}
                        >
                          <span className="text-xs font-medium text-primary-700 dark:text-primary-300">
                            {attendee[0]}
                          </span>
                        </div>
                      ))}
                      {meeting.attendees.length > 3 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          +{meeting.attendees.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {meetings.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No upcoming meetings
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* To-Do List / Action Items */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckSquare className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <span>Action Items</span>
              </div>
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                {todos.length} items
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {todos.map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {todo.task}
                    </p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        todo.priority === 'high'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : todo.priority === 'medium'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {todo.priority}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Due: {todo.dueDate}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        • {todo.category}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {todos.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No action items
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notifications Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <span>Notifications</span>
              </div>
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="text-xs font-normal bg-red-500 text-white px-2 py-1 rounded-full">
                  {notifications.filter(n => !n.read).length} new
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 rounded-lg border ${
                    !notification.read
                      ? 'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-800'
                  } hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {notification.time}
                      </p>
                    </div>
                    {!notification.read && (
                      <span className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0 mt-1"></span>
                    )}
                  </div>
                </div>
              ))}
              {notifications.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No notifications
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Proactive Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Lightbulb className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Proactive Suggestions</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="p-4 rounded-lg bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800"
                >
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                    {suggestion.message}
                  </p>
                  <Button variant="outline" size="sm" className="w-full">
                    {suggestion.action}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
