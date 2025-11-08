import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card } from '../components/ui/card.jsx';
import { Switch } from '../components/ui/switch.jsx';
import { SimpleSwitch } from '../components/ui/SimpleSwitch.jsx';

const ProfileSetup = () => {
  const [profileData, setProfileData] = useState({
    name: '',
    bio: '',
    timezone: '',
    preferences: {
      calendarAccess: false,
      mailAccess: false,
      meetAccess: false,
      notifications: true,
      darkMode: false
    }
  });
  const [error, setError] = useState('');
  const { completeProfile, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    setProfileData({
      ...profileData,
      [e.target.name]: e.target.value
    });
  };

  const handlePreferenceChange = (key, value) => {
    setProfileData({
      ...profileData,
      preferences: {
        ...profileData.preferences,
        [key]: value
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    console.log('Profile setup form submitted', profileData);
    
    try {
      const result = await completeProfile(profileData);
      console.log('Complete profile result:', result);
      
      if (result && result.success) {
        console.log('Navigating to dashboard...');
        // Small delay to ensure state is updated
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 200);
      } else {
        const errorMsg = result?.error || 'Profile setup failed';
        console.error('Profile setup failed:', errorMsg);
        setError(errorMsg);
      }
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      setError(error.message || 'An error occurred during profile setup');
    }
  };

  const accessOptions = [
    {
      key: 'calendarAccess',
      title: 'Calendar Access',
      description: 'Allow Proactive AI to read and manage your calendar events',
      icon: '📅',
      benefits: ['Smart scheduling', 'Meeting optimization', 'Time blocking']
    },
    {
      key: 'mailAccess',
      title: 'Email Access',
      description: 'Enable AI to read and organize your emails',
      icon: '📧',
      benefits: ['Email prioritization', 'Smart replies', 'Auto-categorization']
    },
    {
      key: 'meetAccess',
      title: 'Google Meet Access',
      description: 'Integrate with Google Meet for enhanced meeting experience',
      icon: '🎥',
      benefits: ['Meeting insights', 'Auto-join', 'Recording summaries']
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-primary-500 to-primary-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-bold text-3xl">P</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Complete Your Profile
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Set up your preferences and grant permissions to unlock the full power of Proactive AI
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Information */}
          <Card className="p-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
              Basic Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Full Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={profileData.name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-800 dark:text-white transition-colors"
                  placeholder="Enter your full name"
                  required
                />
              </div>
              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Timezone
                </label>
                <select
                  id="timezone"
                  name="timezone"
                  value={profileData.timezone}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-800 dark:text-white transition-colors"
                  required
                >
                  <option value="">Select your timezone</option>
                  <option value="UTC-12">UTC-12 (Baker Island)</option>
                  <option value="UTC-11">UTC-11 (American Samoa)</option>
                  <option value="UTC-10">UTC-10 (Hawaii)</option>
                  <option value="UTC-9">UTC-9 (Alaska)</option>
                  <option value="UTC-8">UTC-8 (Pacific Time)</option>
                  <option value="UTC-7">UTC-7 (Mountain Time)</option>
                  <option value="UTC-6">UTC-6 (Central Time)</option>
                  <option value="UTC-5">UTC-5 (Eastern Time)</option>
                  <option value="UTC-4">UTC-4 (Atlantic Time)</option>
                  <option value="UTC-3">UTC-3 (Brazil)</option>
                  <option value="UTC-2">UTC-2 (Mid-Atlantic)</option>
                  <option value="UTC-1">UTC-1 (Azores)</option>
                  <option value="UTC+0">UTC+0 (Greenwich)</option>
                  <option value="UTC+1">UTC+1 (Central European)</option>
                  <option value="UTC+2">UTC+2 (Eastern European)</option>
                  <option value="UTC+3">UTC+3 (Moscow)</option>
                  <option value="UTC+4">UTC+4 (Gulf)</option>
                  <option value="UTC+5">UTC+5 (Pakistan)</option>
                  <option value="UTC+5:30">UTC+5:30 (India)</option>
                  <option value="UTC+6">UTC+6 (Bangladesh)</option>
                  <option value="UTC+7">UTC+7 (Thailand)</option>
                  <option value="UTC+8">UTC+8 (China)</option>
                  <option value="UTC+9">UTC+9 (Japan)</option>
                  <option value="UTC+10">UTC+10 (Australia)</option>
                  <option value="UTC+11">UTC+11 (Solomon Islands)</option>
                  <option value="UTC+12">UTC+12 (New Zealand)</option>
                </select>
              </div>
            </div>
            <div className="mt-6">
              <label htmlFor="bio" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Bio (Optional)
              </label>
              <textarea
                id="bio"
                name="bio"
                value={profileData.bio}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-800 dark:text-white transition-colors"
                placeholder="Tell us a bit about yourself..."
              />
            </div>
          </Card>

          {/* Access Permissions */}
          <Card className="p-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
              Grant Access Permissions
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Enable these features to get the most out of Proactive AI. You can change these settings anytime.
            </p>
            
            <div className="space-y-6">
              {accessOptions.map((option) => (
                <div key={option.key} className="border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-3">
                        <span className="text-2xl mr-3">{option.icon}</span>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {option.title}
                          </h3>
                          <p className="text-gray-600 dark:text-gray-400">
                            {option.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {option.benefits.map((benefit, index) => (
                          <span
                            key={index}
                            className="px-3 py-1 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 text-sm rounded-full"
                          >
                            {benefit}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="ml-4 flex items-center">
                      <SimpleSwitch
                        checked={profileData.preferences[option.key]}
                        onCheckedChange={(checked) => handlePreferenceChange(option.key, checked)}
                        className="scale-110"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* General Preferences */}
          <Card className="p-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
              General Preferences
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Enable Notifications</h3>
                  <p className="text-gray-600 dark:text-gray-400">Receive proactive reminders and updates</p>
                </div>
                <div className="flex items-center">
                  <SimpleSwitch
                    checked={profileData.preferences.notifications}
                    onCheckedChange={(checked) => handlePreferenceChange('notifications', checked)}
                    className="scale-110"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Dark Mode</h3>
                  <p className="text-gray-600 dark:text-gray-400">Use dark theme for better viewing</p>
                </div>
                <div className="flex items-center">
                  <SimpleSwitch
                    checked={profileData.preferences.darkMode}
                    onCheckedChange={(checked) => handlePreferenceChange('darkMode', checked)}
                    className="scale-110"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Error Display */}
          {error && (
            <div className="text-red-600 text-center mb-6">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-center">
            <Button
              type="submit"
              className="px-12 py-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl text-lg transition-colors"
              disabled={isLoading}
            >
              {isLoading ? 'Setting up your profile...' : 'Complete Setup'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileSetup;
