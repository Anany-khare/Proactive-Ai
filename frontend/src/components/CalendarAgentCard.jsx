import React from 'react';

const CalendarAgentCard = () => {
  // Placeholder data - will be replaced with API calls
  const upcomingEvents = [
    {
      id: 1,
      title: 'Team Meeting',
      time: '10:00 AM',
      type: 'meeting',
      attendees: 5
    },
    {
      id: 2,
      title: 'Doctor Appointment',
      time: '2:30 PM',
      type: 'appointment',
      attendees: 1
    },
    {
      id: 3,
      title: 'Project Deadline',
      time: '5:00 PM',
      type: 'deadline',
      attendees: 0
    }
  ];

  const getEventIcon = (type) => {
    switch (type) {
      case 'meeting':
        return '👥';
      case 'appointment':
        return '🏥';
      case 'deadline':
        return '⏰';
      default:
        return '📅';
    }
  };

  const getEventColor = (type) => {
    switch (type) {
      case 'meeting':
        return 'bg-blue-100 text-blue-800';
      case 'appointment':
        return 'bg-green-100 text-green-800';
      case 'deadline':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 card-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-lg">📅</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Calendar Agent</h3>
            <p className="text-sm text-gray-500">Upcoming events</p>
          </div>
        </div>
        <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>

      <div className="space-y-3">
        {upcomingEvents.map((event) => (
          <div key={event.id} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <div className="flex-shrink-0">
              <span className="text-lg">{getEventIcon(event.type)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-xs text-gray-500">{event.time}</span>
                {event.attendees > 0 && (
                  <span className="text-xs text-gray-500">• {event.attendees} attendees</span>
                )}
              </div>
            </div>
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getEventColor(event.type)}`}>
              {event.type}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <button className="w-full text-sm text-primary-600 hover:text-primary-700 font-medium py-2 rounded-lg hover:bg-primary-50 transition-colors">
          View Full Calendar
        </button>
      </div>
    </div>
  );
};

export default CalendarAgentCard;