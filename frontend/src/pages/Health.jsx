import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { Heart, Moon, Footprints, Activity, Zap, RefreshCw, Link, Plus, X, Loader2, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { Button } from '../components/ui/button.jsx';
import { healthAPI } from '../utils/api.jsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// ─── Circular Progress Ring ──────────────────────────────────────────────────
const CircularProgress = ({ value, max, size = 120, strokeWidth = 8, color = '#10b981', label, sublabel }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min((value || 0) / max, 1);
  const offset = circumference * (1 - pct);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90 absolute">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="flex flex-col items-center justify-center z-10">
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{label ?? '—'}</span>
        {sublabel && <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sublabel}</span>}
      </div>
    </div>
  );
};

// ─── Metric Card ─────────────────────────────────────────────────────────────
const MetricCard = ({ icon: Icon, color, value, unit, label, subtext }) => (
  <div className="flex flex-col items-center p-4 rounded-xl bg-white/70 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
    <Icon className={`w-6 h-6 mb-2 ${color}`} />
    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
      {value ?? '—'}<span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>
    </div>
    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mt-0.5">{label}</div>
    {subtext && <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{subtext}</div>}
  </div>
);

// ─── Source Badge ─────────────────────────────────────────────────────────────
const SourceBadge = ({ source }) => {
  const configs = {
    google_fit: { label: 'Google Fit', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', dot: 'bg-blue-500' },
    fitbit: { label: 'Fitbit', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300', dot: 'bg-teal-500' },
    manual: { label: 'Manual Entry', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', dot: 'bg-gray-400' },
    none: { label: 'No Source', color: 'bg-gray-100 text-gray-500', dot: 'bg-gray-300' },
  };
  const cfg = configs[source] || configs.none;
  return (
    <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      <span>{cfg.label}</span>
    </span>
  );
};

const getReadinessColor = (score) => {
  if (!score) return '#6b7280';
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
};

// ─── Health Page ──────────────────────────────────────────────────────────────
const Health = () => {
  const queryClient = useQueryClient();
  const [showManual, setShowManual] = useState(false);
  const [manualSleep, setManualSleep] = useState('');
  const [manualSteps, setManualSteps] = useState('');
  const [manualHR, setManualHR] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ['health-data'],
    queryFn: async () => { const res = await healthAPI.getData(); return res.data; },
    staleTime: 5 * 60 * 1000,      // consider fresh for 5 min (instant nav)
    gcTime: 10 * 60 * 1000,        // keep in cache 10 min
    retry: false,
  });

  const { data: fitbitStatus } = useQuery({
    queryKey: ['fitbit-status'],
    queryFn: async () => { const res = await healthAPI.getStatus(); return res.data; },
    staleTime: 60 * 1000,
    retry: false,
  });


  const handleSync = async () => {
    setSyncing(true);
    try {
      await healthAPI.sync();
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['dashboard-contextual'] });
      showToast('Health data synced successfully!');
    } catch (err) {
      // 422 = no data in Google Fit/Fitbit — show helpful guidance
      const detail = err?.response?.data?.detail;
      if (detail?.suggestion) {
        showToast(`No data found in Google Fit. ${detail.suggestion}`, 'info');
      } else if (err?.response?.status === 422) {
        showToast('No data in Google Fit yet. Try syncing the Google Fit app on your phone first, then retry.', 'info');
      } else {
        showToast('Sync failed — check your connection and try again.', 'error');
      }
    } finally { setSyncing(false); }
  };

  const handleConnectFitbit = async () => {
    setConnecting(true);
    try {
      const res = await healthAPI.getConnectUrl();
      window.open(res.data.auth_url, '_blank');
      showToast('Fitbit authorization window opened', 'info');
    } catch (err) {
      showToast('Fitbit not configured — add credentials to .env', 'error');
    } finally { setConnecting(false); }
  };

  const handleManualSave = async () => {
    if (!manualSleep && !manualSteps && !manualHR) return;
    setSaving(true);
    try {
      await healthAPI.manualEntry(
        manualSleep ? parseFloat(manualSleep) : null,
        manualSteps ? parseInt(manualSteps) : null,
        manualHR ? parseInt(manualHR) : null,
      );
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['dashboard-contextual'] });
      setShowManual(false);
      setManualSleep(''); setManualSteps(''); setManualHR('');
      showToast('Health data saved — AI insights updated!');
    } catch (err) {
      showToast('Failed to save. Please try again.', 'error');
    } finally { setSaving(false); }
  };

  const readinessColor = getReadinessColor(health?.readiness_score);
  const hasData = health && health.source !== 'none' && health.readiness_score !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Health & Readiness</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Your daily wellness snapshot — used by AI to optimize your schedule
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {hasData && (
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}
              className="text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
              <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync Now'}
            </Button>
          )}
          <Button size="sm" onClick={() => setShowManual(!showManual)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {showManual ? <X className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            {showManual ? 'Cancel' : 'Log Data'}
          </Button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center space-x-2 p-3 rounded-lg border text-sm ${
          toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300' :
          toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300' :
          'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300'
        }`}>
          {toast.type === 'success' && <CheckCircle className="w-4 h-4" />}
          {toast.type === 'error' && <AlertTriangle className="w-4 h-4" />}
          {toast.type === 'info' && <Info className="w-4 h-4" />}
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Manual Entry Form */}
      {showManual && (
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center space-x-2">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Log Today's Health Data</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {[
                { label: 'Sleep Duration', key: 'sleep', state: manualSleep, set: setManualSleep, placeholder: '7.5', unit: 'hrs', type: 'number', step: '0.5' },
                { label: 'Steps Today', key: 'steps', state: manualSteps, set: setManualSteps, placeholder: '8000', unit: '', type: 'number' },
                { label: 'Resting Heart Rate', key: 'hr', state: manualHR, set: setManualHR, placeholder: '65', unit: 'bpm', type: 'number' },
              ].map(({ label, key, state, set, placeholder, unit, type, step }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">{label}</label>
                  <div className="relative">
                    <input type={type} step={step} value={state} onChange={e => set(e.target.value)} placeholder={placeholder}
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{unit}</span>}
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={handleManualSave} disabled={saving || (!manualSleep && !manualSteps && !manualHR)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : 'Save & Update AI'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 h-[200px] bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
          <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-28 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      ) : hasData ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <Card className="lg:col-span-1 bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-emerald-900/20 dark:to-teal-800/20 border-emerald-200 dark:border-emerald-800 flex items-center justify-center py-6">
              <div className="flex flex-col items-center space-y-3">
                <CircularProgress value={health.readiness_score} max={100} size={130} strokeWidth={9}
                  color={readinessColor} label={health.readiness_score} sublabel={health.readiness_label} />
                <div className="text-center space-y-1">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Readiness Score</p>
                  <SourceBadge source={health.source} />
                </div>
              </div>
            </Card>
            <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-4">
              <MetricCard icon={Moon} color="text-indigo-500" value={health.sleep_hours} unit="hrs" label="Sleep"
                subtext={`${health.sleep_minutes || 0} minutes total`} />
              <MetricCard icon={Footprints} color="text-orange-500"
                value={health.steps != null ? (health.steps >= 1000 ? `${(health.steps/1000).toFixed(1)}k` : health.steps) : null}
                unit="" label="Steps"
                subtext={health.steps >= 8000 ? '🎯 Goal reached!' : `${Math.max(0, 8000-(health.steps||0)).toLocaleString()} to goal`} />
              <MetricCard icon={Activity} color="text-red-500" value={health.resting_heart_rate || null} unit="bpm" label="Resting HR"
                subtext={health.resting_heart_rate ? (health.resting_heart_rate < 60 ? 'Athletic' : health.resting_heart_rate < 80 ? 'Normal' : 'Elevated') : 'Not recorded'} />
              <MetricCard icon={Heart} color="text-pink-500" value={health.sleep_score || null} unit="/100" label="Sleep Score" subtext="Based on duration" />
              <MetricCard icon={Zap} color="text-yellow-500" value={health.calories_burned || null} unit="kcal" label="Calories" subtext="Active burn" />
              <MetricCard icon={Activity} color="text-emerald-500" value={health.active_minutes || null} unit="min" label="Active Mins" subtext="Moderate + vigorous" />
            </div>
          </div>

          {health.readiness_score < 60 && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 flex items-start space-x-3">
              <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-amber-800 dark:text-amber-300">Low Readiness Detected</p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                  Score: {health.readiness_score}/100.
                  {health.sleep_hours < 6 && ` Only ${health.sleep_hours}hrs sleep (recommended: 7-9hrs).`}
                  {' '}AI has adjusted your scheduling recommendations accordingly.
                </p>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400 text-right">Last updated: {health.date} · <SourceBadge source={health.source} /></p>
        </>
      ) : (
        <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10 border-emerald-200 dark:border-emerald-800">
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center space-y-6 max-w-md mx-auto">
              <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                <Heart className="w-10 h-10 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Connect a Health Source</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Choose how to get your data — Google Fit works automatically if you have an Android phone.</p>
              </div>
              <div className="w-full space-y-3">
                {/* Google Fit */}
                <div className="p-4 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-white/80 dark:bg-gray-800/80 text-left">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-sm">G</span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Google Fit</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ Already connected — uses your Google account</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">Tracks steps, sleep & HR from your Android phone. Make sure Google Fit app has data first.</p>
                  <Button size="sm" onClick={handleSync} disabled={syncing} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                    <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Fetching from Google Fit…' : 'Fetch from Google Fit'}
                  </Button>
                </div>
                {/* Fitbit */}
                <div className="p-4 rounded-xl border-2 border-teal-200 dark:border-teal-800 bg-white/80 dark:bg-gray-800/80 text-left">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-sm">F</span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Fitbit</p>
                      <p className="text-xs text-gray-500">Requires dev.fitbit.com registration</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">Richer sleep stages (light, deep, REM). Register at dev.fitbit.com → add to .env → connect.</p>
                  <Button size="sm" variant="outline" onClick={handleConnectFitbit} disabled={connecting} className="w-full border-teal-300 text-teal-700 dark:text-teal-300 hover:bg-teal-50">
                    <Link className="w-3.5 h-3.5 mr-1.5" />
                    {connecting ? 'Opening…' : 'Connect Fitbit'}
                  </Button>
                </div>
                {/* Manual */}
                <div className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 text-left">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                      <Plus className="w-4 h-4 text-gray-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Manual Entry</p>
                      <p className="text-xs text-gray-500">Works immediately, no device needed</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">Enter sleep hours, steps from phone, and heart rate manually.</p>
                  <Button size="sm" variant="outline" onClick={() => setShowManual(true)} className="w-full">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />Log Manually
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Health;
