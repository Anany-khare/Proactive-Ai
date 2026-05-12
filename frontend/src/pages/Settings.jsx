import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { authAPI, dashboardAPI, healthAPI } from '../utils/api.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import PushNotificationSetup from '../components/PushNotificationSetup.jsx';
import { User, Mail, Calendar, CheckSquare, Bell, Settings as SettingsIcon, Link2, Link2Off, Edit3, Lock, Save, X, Heart, RefreshCw, CheckCircle, AlertCircle, Clock, CalendarDays, Plane, Zap, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button.jsx';
import apiClient from '../utils/api.jsx';

const Settings = () => {
  const { user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [stats, setStats] = useState(null);
  const [integrations, setIntegrations] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);
  const [healthSyncing, setHealthSyncing] = useState(false);
  const [healthConnecting, setHealthConnecting] = useState(false);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Preference update states
  const [updatingPref, setUpdatingPref] = useState(null);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const profileResponse = await authAPI.getUserProfile();
      setProfileData(profileResponse.data.user);
      setStats(profileResponse.data.stats);
      setIntegrations(profileResponse.data.integrations);
      // Fetch health source status
      try {
        const hRes = await healthAPI.getStatus();
        setHealthStatus(hRes.data);
      } catch (_) { /* health API may 401 if not set up yet */ }
    } catch (err) {
      console.error('Error fetching profile data:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = () => {
    setEditName(profileData?.name || '');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditName('');
  };

  const saveProfile = async () => {
    try {
      setSaving(true);
      const res = await authAPI.updateProfile({ name: editName });
      setProfileData(prev => ({ ...prev, name: res.data.user.name }));
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePreference = async (key, value) => {
    try {
      setUpdatingPref(key);
      const res = await authAPI.updateProfile({ [key]: value });
      setProfileData(prev => ({ ...prev, ...res.data.user }));
    } catch (err) {
      console.error(`Error updating preference ${key}:`, err);
      alert('Failed to update preference.');
    } finally {
      setUpdatingPref(null);
    }
  };

  const timeOptions = [
    { label: '6 AM', value: 6 },
    { label: '7 AM', value: 7 },
    { label: '8 AM', value: 8 },
    { label: '9 AM', value: 9 },
    { label: '10 AM', value: 10 },
    { label: '11 AM', value: 11 },
    { label: '12 PM', value: 12 },
    { label: '1 PM', value: 13 },
    { label: '2 PM', value: 14 },
    { label: '3 PM', value: 15 },
    { label: '4 PM', value: 16 },
    { label: '5 PM', value: 17 },
    { label: '6 PM', value: 18 },
    { label: '7 PM', value: 19 },
    { label: '8 PM', value: 20 },
    { label: '9 PM', value: 21 },
    { label: '10 PM', value: 22 },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-48 animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
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
        <Card className="overflow-hidden border-none shadow-xl bg-white dark:bg-[#0c0c1e] relative">
          <div className="h-32 bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] w-full" />
          <CardContent className="pt-0 -mt-12 flex flex-col items-center pb-8">
            <div className="relative isolate">
              {profileData?.picture && !imageError ? (
                <div className="relative">
                  <img
                    src={profileData.picture}
                    alt={profileData.name || 'Profile'}
                    className="w-24 h-24 rounded-full border-4 border-[#0c0c1e] shadow-lg object-cover"
                    onError={() => setImageError(true)}
                  />
                  <div className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-2 border-[#0c0c1e] rounded-full z-10" />
                </div>
              ) : (
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center border-4 border-[#0c0c1e] shadow-lg">
                    <span className="text-3xl font-bold text-white">
                      {profileData?.name ? profileData.name.charAt(0).toUpperCase() : 'O'}
                    </span>
                  </div>
                  <div className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-2 border-[#0c0c1e] rounded-full z-10" />
                </div>
              )}
              <div className="absolute top-0 right-0 left-0 bottom-0 rounded-full border border-white/20 -z-10 animate-pulse" />
            </div>

            <div className="mt-4 text-center w-full px-6">
              {isEditing ? (
                <div className="flex flex-col items-center space-y-3 pt-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full max-w-xs px-4 py-2 text-center rounded-lg bg-gray-100 dark:bg-gray-900/50 border-2 border-primary-500 focus:outline-none"
                    placeholder="Enter your name"
                    autoFocus
                  />
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={cancelEditing} disabled={saving}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={saveProfile} disabled={saving} className="bg-primary-600">
                      {saving ? 'Saving…' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center justify-center group">
                    {profileData?.name || 'User'}
                    <button onClick={startEditing} className="ml-2 opacity-0 group-hover:opacity-60 transition-opacity">
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </h2>
                  <div className="flex items-center justify-center space-x-2 text-gray-500 dark:text-gray-400 mt-1">
                    <Mail className="w-4 h-4" />
                    <span className="text-sm">{profileData?.email}</span>
                  </div>
                  <div className="inline-flex items-center px-3 py-1 mt-3 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-medium border border-primary-200 dark:border-primary-800/50">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Profile Synced via Google
                  </div>
                </>
              )}
            </div>

            <div className="w-full mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center text-xs text-gray-500">
              <span className="font-medium text-gray-400">Account Created</span>
              <span className="dark:text-gray-300">
                {profileData?.created_at ? new Date(profileData.created_at).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <Card className="border-none shadow-xl bg-white dark:bg-[#0c0c1e]">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-gray-800 dark:text-gray-200">
              <SettingsIcon className="w-5 h-5 text-primary-500" />
              <span>Statistics</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {stats && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100/50 dark:border-indigo-800/30 transition-all hover:shadow-md">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-800/50 rounded-lg">
                      <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Todos</span>
                  </div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    {stats.todos_total}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {stats.todos_completed} completed
                  </div>
                </div>

                <div className="p-5 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100/50 dark:border-blue-800/30 transition-all hover:shadow-md">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-800/50 rounded-lg">
                      <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Notifications</span>
                  </div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    {stats.notifications_total}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {stats.notifications_unread} unread
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Scheduling Preferences */}
        <Card className="border-none shadow-xl bg-white dark:bg-[#0c0c1e] lg:row-span-2">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-gray-800 dark:text-gray-200">
              <Clock className="w-5 h-5 text-indigo-500" />
              <span>AI Scheduling Preferences</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center">
                  <Clock className="w-3 h-3 mr-1" /> Work Starts
                </label>
                <select
                  value={profileData?.work_start_hour || 9}
                  onChange={(e) => handleUpdatePreference('work_start_hour', parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {timeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center">
                  <Clock className="w-3 h-3 mr-1" /> Work Ends
                </label>
                <select
                  value={profileData?.work_end_hour || 18}
                  onChange={(e) => handleUpdatePreference('work_end_hour', parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {timeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-gray-100 dark:border-gray-800/50">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                    <CalendarDays className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold dark:text-gray-200">Weekend Availability</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Allow AI to schedule on Sat/Sun</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={profileData?.weekends_enabled || false}
                  onChange={(e) => handleUpdatePreference('weekends_enabled', e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 dark:from-violet-500/20 dark:to-indigo-500/20 rounded-xl border border-violet-200 dark:border-violet-800/50">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-violet-600 rounded-lg shadow-lg shadow-violet-500/30">
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-violet-700 dark:text-violet-300">Auto-Pilot Mode</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">Zero-click meeting & reply sync</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {updatingPref === 'auto_pilot_enabled' && <Loader2 className="w-3 h-3 animate-spin text-violet-500" />}
                  <input
                    type="checkbox"
                    checked={profileData?.auto_pilot_enabled || false}
                    onChange={(e) => handleUpdatePreference('auto_pilot_enabled', e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex flex-col p-4 bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-gray-100 dark:border-gray-800/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg">
                      <Plane className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold dark:text-gray-200">Leave Status</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Automatic OOO replies & rescheduling</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={profileData?.on_leave || false}
                    onChange={(e) => handleUpdatePreference('on_leave', e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </div>
                
                {profileData?.on_leave && (
                  <div className="grid grid-cols-2 gap-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Leave Starts</label>
                      <input
                        type="date"
                        value={profileData?.leave_start_date || ''}
                        onChange={(e) => handleUpdatePreference('leave_start_date', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Leave Ends</label>
                      <input
                        type="date"
                        value={profileData?.leave_end_date || ''}
                        onChange={(e) => handleUpdatePreference('leave_end_date', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Integrations (Hidden or compact) */}
        {/* We can hide this or keep it minimal if space allows */}

        {/* Health Connector */}
        <Card className="border-none shadow-xl bg-white dark:bg-[#0c0c1e]">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-gray-800 dark:text-gray-200">
              <Heart className="w-5 h-5 text-emerald-500" />
              <span>Health Connector</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Choose how the AI gets your health data. Google Fit is automatic — Fitbit requires separate registration.
            </p>

            <div className="space-y-3">
              {/* Google Fit row */}
              <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                healthStatus?.google_fit?.connected
                  ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10'
                  : 'border-gray-100 dark:border-gray-800'
              }`}>
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                    <span className="text-white font-bold">G</span>
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-white">Google Fit</div>
                    {healthStatus?.google_fit?.connected ? (
                      <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Connected via Google</div>
                    ) : (
                      <div className="text-xs text-gray-500">Not connected</div>
                    )}
                  </div>
                </div>
                {healthStatus?.google_fit?.connected && (
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                )}
              </div>

              {/* Fitbit row */}
              <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                healthStatus?.fitbit?.connected
                  ? 'border-teal-500/30 bg-teal-500/5 dark:bg-teal-500/10'
                  : 'border-gray-100 dark:border-gray-800'
              }`}>
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
                    <span className="text-white font-bold">F</span>
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-white">Fitbit</div>
                    {healthStatus?.fitbit?.connected ? (
                      <div className="text-xs text-teal-600 dark:text-teal-400 font-medium">✓ Connected</div>
                    ) : (
                      <div className="text-xs text-gray-500">Not connected</div>
                    )}
                  </div>
                </div>
                {healthStatus?.fitbit?.connected ? (
                  <CheckCircle className="w-5 h-5 text-teal-500" />
                ) : (
                  <Button size="sm" variant="outline" disabled={healthConnecting}
                    className="text-xs border-teal-500/30 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20"
                    onClick={async () => {
                      setHealthConnecting(true);
                      try {
                        const res = await healthAPI.getConnectUrl();
                        window.open(res.data.auth_url, '_blank');
                      } catch (e) {
                        alert('Fitbit not configured');
                      } finally { setHealthConnecting(false); }
                    }}>
                    Connect
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800 mt-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
                Active source: <span className="text-gray-600 dark:text-gray-300 ml-1">{healthStatus?.fitbit?.connected ? 'Fitbit' : healthStatus?.google_fit?.connected ? 'Google Fit' : 'None'}</span>
              </div>
              <button
                disabled={healthSyncing}
                onClick={async () => {
                  setHealthSyncing(true);
                  try { await healthAPI.sync(); alert('Synced!'); }
                  catch (e) { alert('Sync failed'); }
                  finally { setHealthSyncing(false); }
                }}
                className="flex items-center text-[10px] font-bold text-indigo-500 hover:text-indigo-600 uppercase tracking-wider"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${healthSyncing ? 'animate-spin' : ''}`} />
                Sync now
              </button>
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
