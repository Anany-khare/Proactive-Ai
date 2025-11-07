import React from 'react';

const HealthAgentCard = () => {
  // Placeholder data - will be replaced with API calls
  const healthData = {
    steps: {
      current: 8420,
      goal: 10000,
      percentage: 84
    },
    water: {
      current: 6,
      goal: 8,
      percentage: 75
    },
    reminders: [
      { id: 1, text: 'Take morning vitamins', time: '9:00 AM', completed: true },
      { id: 2, text: 'Drink water', time: '11:00 AM', completed: false },
      { id: 3, text: 'Lunch break', time: '1:00 PM', completed: false }
    ]
  };

  const ProgressBar = ({ percentage, color = 'bg-primary-500' }) => (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div 
        className={`h-2 rounded-full transition-all duration-300 ${color}`}
        style={{ width: `${percentage}%` }}
      ></div>
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 card-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-lg">💊</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Health Agent</h3>
            <p className="text-sm text-gray-500">Today's wellness</p>
          </div>
        </div>
        <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>

      {/* Steps Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-lg">👟</span>
            <span className="text-sm font-medium text-gray-700">Steps</span>
          </div>
          <span className="text-sm text-gray-500">{healthData.steps.current.toLocaleString()} / {healthData.steps.goal.toLocaleString()}</span>
        </div>
        <ProgressBar percentage={healthData.steps.percentage} color="bg-blue-500" />
        <p className="text-xs text-gray-500 mt-1">{healthData.steps.percentage}% of daily goal</p>
      </div>

      {/* Water Intake */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-lg">💧</span>
            <span className="text-sm font-medium text-gray-700">Water</span>
          </div>
          <span className="text-sm text-gray-500">{healthData.water.current} / {healthData.water.goal} glasses</span>
        </div>
        <ProgressBar percentage={healthData.water.percentage} color="bg-cyan-500" />
        <p className="text-xs text-gray-500 mt-1">{healthData.water.percentage}% of daily goal</p>
      </div>

      {/* Reminders */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Today's Reminders</h4>
        <div className="space-y-2">
          {healthData.reminders.map((reminder) => (
            <div key={reminder.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex-shrink-0">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  reminder.completed 
                    ? 'bg-green-500 border-green-500' 
                    : 'border-gray-300'
                }`}>
                  {reminder.completed && (
                    <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${reminder.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                  {reminder.text}
                </p>
                <p className="text-xs text-gray-500">{reminder.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <button className="w-full text-sm text-primary-600 hover:text-primary-700 font-medium py-2 rounded-lg hover:bg-primary-50 transition-colors">
          View Health Dashboard
        </button>
      </div>
    </div>
  );
};

export default HealthAgentCard;