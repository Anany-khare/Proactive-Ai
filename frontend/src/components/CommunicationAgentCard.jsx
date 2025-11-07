import React from 'react';

const CommunicationAgentCard = () => {
  // Placeholder data - will be replaced with API calls
  const messages = [
    {
      id: 1,
      sender: 'Sarah Johnson',
      preview: 'Hey! Can we reschedule our meeting to tomorrow?',
      time: '2 min ago',
      unread: true,
      platform: 'email',
      avatar: 'SJ'
    },
    {
      id: 2,
      sender: 'Team Slack',
      preview: 'New message in #project-updates',
      time: '15 min ago',
      unread: true,
      platform: 'slack',
      avatar: 'TS'
    },
    {
      id: 3,
      sender: 'Mike Chen',
      preview: 'Thanks for the quick response on the proposal',
      time: '1 hour ago',
      unread: false,
      platform: 'whatsapp',
      avatar: 'MC'
    },
    {
      id: 4,
      sender: 'LinkedIn',
      preview: 'You have 3 new connection requests',
      time: '2 hours ago',
      unread: false,
      platform: 'linkedin',
      avatar: 'LI'
    }
  ];

  const getPlatformIcon = (platform) => {
    switch (platform) {
      case 'email':
        return '📧';
      case 'slack':
        return '💬';
      case 'whatsapp':
        return '📱';
      case 'linkedin':
        return '💼';
      default:
        return '💬';
    }
  };

  const getPlatformColor = (platform) => {
    switch (platform) {
      case 'email':
        return 'bg-blue-100 text-blue-800';
      case 'slack':
        return 'bg-purple-100 text-purple-800';
      case 'whatsapp':
        return 'bg-green-100 text-green-800';
      case 'linkedin':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const unreadCount = messages.filter(msg => msg.unread).length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 card-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-lg">💬</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Communication Agent</h3>
            <p className="text-sm text-gray-500">
              {unreadCount > 0 ? `${unreadCount} unread messages` : 'All caught up!'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
              {unreadCount}
            </span>
          )}
          <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {messages.slice(0, 3).map((message) => (
          <div key={message.id} className={`flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors ${
            message.unread ? 'bg-blue-50 border border-blue-100' : ''
          }`}>
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-medium">{message.avatar}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium truncate ${message.unread ? 'text-gray-900' : 'text-gray-700'}`}>
                  {message.sender}
                </p>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getPlatformColor(message.platform)}`}>
                  {getPlatformIcon(message.platform)}
                </span>
              </div>
              <p className={`text-sm truncate mt-1 ${message.unread ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                {message.preview}
              </p>
              <p className="text-xs text-gray-500 mt-1">{message.time}</p>
            </div>
            {message.unread && (
              <div className="flex-shrink-0">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              </div>
            )}
          </div>
        ))}
      </div>

      {messages.length > 3 && (
        <div className="mt-3 text-center">
          <p className="text-xs text-gray-500">
            +{messages.length - 3} more messages
          </p>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200">
        <button className="w-full text-sm text-primary-600 hover:text-primary-700 font-medium py-2 rounded-lg hover:bg-primary-50 transition-colors">
          View All Messages
        </button>
      </div>
    </div>
  );
};

export default CommunicationAgentCard;