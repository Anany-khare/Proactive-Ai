import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { authAPI, dashboardAPI, healthAPI } from '../utils/api.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import PushNotificationSetup from '../components/PushNotificationSetup.jsx';
import { User, Mail, Calendar, CheckSquare, Bell, Settings as SettingsIcon, Link2, Link2Off, Edit3, Lock, Save, X, Heart, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
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
      const res = await apiClient.patch('/auth/profile', { name: editName });
      setProfileData(prev => ({ ...prev, name: res.data.user.name }));
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <User className="w-5 h-5" />
                <span>Profile Information</span>
              </div>
              {!isEditing ? (
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <Edit3 className="w-4 h-4 mr-1" />
                  Edit
                </Button>
              ) : (
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={cancelEditing} disabled={saving}>
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveProfile} disabled={saving}>
                    <Save className="w-4 h-4 mr-1" />
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              )}
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
              {isEditing ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-2 border-primary-500 dark:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter your name"
                  autoFocus
                />
              ) : (
                <input
                  type="text"
                  value={profileData?.name || ''}
                  readOnly
                  className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <div className="flex items-center space-x-1">
                  <span>Email</span>
                  <Lock className="w-3 h-3 text-gray-400" />
                </div>
              </label>
              <input
                type="email"
                value={profileData?.email || ''}
                readOnly
                className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 border border-gray-300 dark:border-gray-700 cursor-not-allowed"
                title="Connected via Google — cannot be changed"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Connected via Google OAuth — cannot be changed</p>
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

        {/* Health Connector */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Heart className="w-5 h-5 text-emerald-500" />
              <span>Health Connector</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Choose how the AI gets your health data. Google Fit is automatic — Fitbit requires separate registration.
            </p>

            {/* Google Fit row */}
            <div className={`flex items-center justify-between p-3 rounded-lg border-2 ${
              healthStatus?.google_fit?.connected
                ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-gray-200 dark:border-gray-700'
            }`}>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">G</span>
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100">Google Fit</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {healthStatus?.google_fit?.connected
                      ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Connected via your Google account</span>
                      : 'Login with Google to enable'}
                  </div>
                </div>
              </div>
              {healthStatus?.google_fit?.connected
                ? <CheckCircle className="w-5 h-5 text-emerald-500" />
                : <AlertCircle className="w-5 h-5 text-gray-400" />}
            </div>

            {/* Fitbit row */}
            <div className={`flex items-center justify-between p-3 rounded-lg border-2 ${
              healthStatus?.fitbit?.connected
                ? 'border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20'
                : 'border-gray-200 dark:border-gray-700'
            }`}>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">F</span>
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100">Fitbit</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {healthStatus?.fitbit?.connected
                      ? <span className="text-teal-600 dark:text-teal-400 font-medium">✓ Connected</span>
                      : 'Requires dev.fitbit.com registration'}
                  </div>
                </div>
              </div>
              {healthStatus?.fitbit?.connected
                ? <CheckCircle className="w-5 h-5 text-teal-500" />
                : (
                  <Button size="sm" variant="outline" disabled={healthConnecting}
                    className="text-xs border-teal-300 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/20"
                    onClick={async () => {
                      setHealthConnecting(true);
                      try {
                        const res = await healthAPI.getConnectUrl();
                        window.open(res.data.auth_url, '_blank');
                      } catch (e) {
                        alert('Fitbit not configured — add FITBIT_CLIENT_ID to .env first');
                      } finally { setHealthConnecting(false); }
                    }}>
                    {healthConnecting ? 'Opening…' : 'Connect'}
                  </Button>
                )}
            </div>

            {/* Active source + sync */}
            <div className="flex items-center justify-between pt-1">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Active source:{' '}
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  {healthStatus?.fitbit?.connected ? 'Fitbit' : healthStatus?.google_fit?.connected ? 'Google Fit' : 'None — use manual entry'}
                </span>
              </div>
              {(healthStatus?.google_fit?.connected || healthStatus?.fitbit?.connected) && (
                <Button size="sm" variant="ghost" disabled={healthSyncing}
                  className="text-xs text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                  onClick={async () => {
                    setHealthSyncing(true);
                    try { await healthAPI.sync(); alert('Health data synced!'); }
                    catch (e) {
                      const detail = e?.response?.data?.detail;
                      alert(detail?.suggestion || 'No data found. Try syncing your health app first.');
                    }
                    finally { setHealthSyncing(false); }
                  }}>
                  <RefreshCw className={`w-3 h-3 mr-1 ${healthSyncing ? 'animate-spin' : ''}`} />
                  {healthSyncing ? 'Syncing…' : 'Sync now'}
                </Button>
              )}
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
