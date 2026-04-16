import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { useContextualData } from '../hooks/useContextualData.jsx';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates.jsx';
import { Mail, Calendar, Bell, Lightbulb, Clock, AlertCircle, Brain, Loader2, Users, Plus, Trash2, X, Pencil, Heart, Zap, Send, Video, ExternalLink, MapPin } from 'lucide-react';
import { Button } from '../components/ui/button.jsx';
import { aiAPI, teamsAPI, actionsAPI, meetingAPI, healthAPI } from '../utils/api.jsx';
import FormattedAIResponse from '../components/FormattedAIResponse.jsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog.jsx';
import { Moon, Footprints, Activity, RefreshCw, Link, ToggleLeft, ToggleRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

// ─── Circular Progress Ring ──────────────────────────────────────────────────
const CircularProgress = ({ value, max, size = 64, strokeWidth = 5, color = '#8b5cf6', label, sublabel }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(value / max, 1);
  const offset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{label}</span>
        {sublabel && <span className="text-[10px] text-gray-500 dark:text-gray-400">{sublabel}</span>}
      </div>
    </div>
  );
};

// ─── Health & Readiness Card ─────────────────────────────────────────────────
const HealthCard = ({ health }) => {
  const queryClient = useQueryClient();
  const [showManual, setShowManual] = useState(false);
  const [manualSleep, setManualSleep] = useState('');
  const [manualSteps, setManualSteps] = useState('');
  const [manualHR, setManualHR] = useState('');
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Check Fitbit status
  const { data: fitbitStatus } = useQuery({
    queryKey: ['fitbit-status'],
    queryFn: async () => { const res = await healthAPI.getStatus(); return res.data; },
    staleTime: 60 * 1000,
    retry: false,
  });

  const handleConnectFitbit = async () => {
    setConnecting(true);
    try {
      const res = await healthAPI.getConnectUrl();
      window.open(res.data.auth_url, '_blank');
    } catch (err) {
      console.error('Fitbit connect error:', err);
    } finally {
      setConnecting(false);
    }
  };

  const handleManualSave = async () => {
    setSaving(true);
    try {
      await healthAPI.manualEntry(
        manualSleep ? parseFloat(manualSleep) : null,
        manualSteps ? parseInt(manualSteps) : null,
        manualHR ? parseInt(manualHR) : null
      );
      queryClient.invalidateQueries({ queryKey: ['dashboard-contextual'] });
      setShowManual(false);
      setManualSleep(''); setManualSteps(''); setManualHR('');
    } catch (err) {
      console.error('Manual entry error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    try {
      await healthAPI.sync();
      queryClient.invalidateQueries({ queryKey: ['dashboard-contextual'] });
    } catch (err) {
      console.error('Sync error:', err);
    }
  };

  // Readiness color coding
  const getReadinessColor = (score) => {
    if (!score) return '#6b7280';
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  const readinessColor = getReadinessColor(health?.readiness_score);

  return (
    <Card className="bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-emerald-900/20 dark:to-teal-800/20 border-emerald-200 dark:border-emerald-800">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Heart className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Health & Readiness</span>
          </div>
          <div className="flex items-center space-x-1">
            {fitbitStatus?.connected && (
              <Button variant="ghost" size="sm" onClick={handleSync} title="Sync from Fitbit"
                className="h-7 w-7 p-0 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200/50 dark:hover:bg-emerald-800/50">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowManual(!showManual)}
              className="h-7 text-xs text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200/50 dark:hover:bg-emerald-800/50">
              {showManual ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              {showManual ? '' : 'Log'}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Manual entry form */}
        {showManual && (
          <div className="mb-4 p-3 rounded-lg border border-emerald-200 dark:border-emerald-700 bg-white/60 dark:bg-gray-800/60 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sleep (hrs)</label>
                <input type="number" step="0.5" value={manualSleep} onChange={e => setManualSleep(e.target.value)} placeholder="7.5"
                  className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Steps</label>
                <input type="number" value={manualSteps} onChange={e => setManualSteps(e.target.value)} placeholder="8000"
                  className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">HR (bpm)</label>
                <input type="number" value={manualHR} onChange={e => setManualHR(e.target.value)} placeholder="65"
                  className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
              </div>
            </div>
            <Button size="sm" onClick={handleManualSave} disabled={saving} className="w-full">
              {saving ? 'Saving…' : 'Save Health Data'}
            </Button>
          </div>
        )}

        {/* Health data display */}
        {health ? (
          <div className="space-y-4">
            {/* Readiness score + metrics row */}
            <div className="flex items-center justify-between">
              {/* Readiness Ring */}
              <div className="relative flex items-center justify-center">
                <CircularProgress
                  value={health.readiness_score || 0} max={100} size={80} strokeWidth={6}
                  color={readinessColor}
                  label={health.readiness_score ?? '—'}
                  sublabel={health.readiness_label || ''}
                />
              </div>

              {/* Metric cards */}
              <div className="flex-1 ml-4 grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center p-2 rounded-lg bg-white/50 dark:bg-gray-800/50">
                  <Moon className="w-4 h-4 text-indigo-500 mb-1" />
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {health.sleep_hours ?? '—'}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Hours</span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-lg bg-white/50 dark:bg-gray-800/50">
                  <Footprints className="w-4 h-4 text-orange-500 mb-1" />
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {health.steps != null ? (health.steps >= 1000 ? `${(health.steps / 1000).toFixed(1)}k` : health.steps) : '—'}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Steps</span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-lg bg-white/50 dark:bg-gray-800/50">
                  <Activity className="w-4 h-4 text-red-500 mb-1" />
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {health.resting_heart_rate || '—'}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">BPM</span>
                </div>
              </div>
            </div>

            {/* AI readiness insight */}
            {health.readiness_score != null && health.readiness_score < 60 && (
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-300 flex items-start space-x-2">
                <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Low readiness detected. The AI will factor this into your scheduling recommendations today.</span>
              </div>
            )}

            <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right">
              Data from {health.date} · {health.source}
            </p>
          </div>
        ) : (
          <div className="text-center py-4 space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">No health data yet</p>
            <div className="flex flex-col items-center space-y-2">
              <Button size="sm" variant="outline" onClick={handleConnectFitbit} disabled={connecting}
                className="text-xs border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30">
                <Link className="w-3.5 h-3.5 mr-1.5" />
                {connecting ? 'Connecting…' : 'Connect Fitbit'}
              </Button>
              <span className="text-[10px] text-gray-400">or use the "Log" button to enter data manually</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Teams Card Component ─────────────────────────────────────────────────────
const TeamsCard = () => {
  const queryClient = useQueryClient();
  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => { const res = await teamsAPI.getTeams(); return res.data; },
    staleTime: 5 * 60 * 1000,
  });

  const [showForm, setShowForm] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [members, setMembers] = useState([{ name: '', email: '' }]);
  const [saving, setSaving] = useState(false);

  const addMemberRow = () => setMembers(prev => [...prev, { name: '', email: '' }]);
  const removeMemberRow = (idx) => setMembers(prev => prev.filter((_, i) => i !== idx));
  const updateMember = (idx, field, value) => {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  };

  const handleEdit = (team) => {
    setEditingTeamId(team.id);
    setTeamName(team.name);
    setMembers(team.members?.length ? team.members : [{ name: '', email: '' }]);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!teamName.trim()) return;
    const validMembers = members.filter(m => m.name.trim() && m.email.trim());
    setSaving(true);
    try {
      if (editingTeamId) {
        await teamsAPI.updateTeam(editingTeamId, { name: teamName.trim(), members: validMembers });
      } else {
        await teamsAPI.createTeam({ name: teamName.trim(), members: validMembers });
      }
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setTeamName('');
      setMembers([{ name: '', email: '' }]);
      setShowForm(false);
      setEditingTeamId(null);
    } catch (err) {
      console.error('Failed to save team:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await teamsAPI.deleteTeam(id);
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    } catch (err) {
      console.error('Failed to delete team:', err);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <span>Teams</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            if (showForm && !editingTeamId) {
              setShowForm(false);
            } else {
              setEditingTeamId(null);
              setTeamName('');
              setMembers([{ name: '', email: '' }]);
              setShowForm(true);
            }
          }}>
            {(showForm && !editingTeamId) ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4 mr-1" />}
            {(showForm && !editingTeamId) ? '' : 'New'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Create form */}
        {showForm && (
          <div className="mb-4 p-3 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/10 space-y-3">
            <input
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              placeholder="Team name (e.g. Marketing Team)"
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Members</p>
              {members.map((m, i) => (
                <div key={i} className="flex items-center space-x-2">
                  <input
                    value={m.name}
                    onChange={e => updateMember(i, 'name', e.target.value)}
                    placeholder="Name"
                    className="flex-1 px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    value={m.email}
                    onChange={e => updateMember(i, 'email', e.target.value)}
                    placeholder="Email"
                    className="flex-1 px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  {members.length > 1 && (
                    <button onClick={() => removeMemberRow(i)} className="text-red-400 hover:text-red-600">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addMemberRow} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">+ Add member</button>
            </div>
            <div className="flex space-x-2">
              {editingTeamId && (
                <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setEditingTeamId(null); }} className="w-1/3">
                  Cancel
                </Button>
              )}
              <Button size="sm" onClick={handleSave} disabled={saving || !teamName.trim()} className={editingTeamId ? "w-2/3" : "w-full"}>
                {saving ? (editingTeamId ? 'Updating…' : 'Creating…') : (editingTeamId ? 'Update Team' : 'Create Team')}
              </Button>
            </div>
          </div>
        )}

        {/* Team list */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-4 text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</div>
          ) : teams.length === 0 && !showForm ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No teams yet — create one to group contacts
            </div>
          ) : (
            teams.map(team => (
              <div key={team.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{team.name}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{team.members?.length || 0} members</span>
                    <button onClick={() => handleEdit(team)} className="text-blue-400 hover:text-blue-600" title="Edit team">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(team.id)} className="text-red-400 hover:text-red-600" title="Delete team">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(team.members || []).slice(0, 4).map((m, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300" title={m.email}>
                      {m.name}
                    </span>
                  ))}
                  {(team.members || []).length > 4 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">+{team.members.length - 4} more</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Dashboard Component ──────────────────────────────────────────────────────
const Dashboard = () => {
  const { dailyBrief, emails, meetings, todos, notifications, suggestions, health, isLoading, error, refetch } = useContextualData();
  const navigate = useNavigate();
  const { user, updateAutoPilot } = useAuth();
  const queryClient = useQueryClient();

  // Action states for 1-click buttons
  const [draftingEmail, setDraftingEmail] = useState(null);
  const [draftResult, setDraftResult] = useState(null);
  
  // Meeting Detail states
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [showMeetingDialog, setShowMeetingDialog] = useState(false);
  const [deletingMeeting, setDeletingMeeting] = useState(false);

  // AI Insights — cached with React Query so they survive page navigation
  const { data: insightsData, isLoading: insightsLoading } = useQuery({
    queryKey: ['ai-insights'],
    queryFn: async () => {
      const res = await aiAPI.getInsights();
      return { insights: res.data.insights, conflicts: res.data.conflicts || [] };
    },
    staleTime: 10 * 60 * 1000, // 10 minutes — don't re-fetch on every page visit
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });
  const aiInsights = insightsData?.insights || null;
  const aiConflicts = insightsData?.conflicts || [];

  // 1-click Draft Reply handler
  const handleDraftReply = async (emailId) => {
    setDraftingEmail(emailId);
    setDraftResult(null);
    try {
      const res = await actionsAPI.draftReply(emailId, 'professional');
      setDraftResult(res.data);
    } catch (err) {
      setDraftResult({ success: false, message: 'Failed to create draft' });
    } finally {
      setDraftingEmail(null);
    }
  };

  const handleDeleteMeeting = async (eventId) => {
    if (!confirm('Are you sure you want to delete this meeting? This will remove it from your Google Calendar.')) return;
    setDeletingMeeting(true);
    try {
      await meetingAPI.deleteMeeting(eventId);
      setShowMeetingDialog(false);
      setSelectedMeeting(null);
      if (refetch) refetch();
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
    } catch (err) {
      console.error('Failed to delete meeting:', err);
      alert('Failed to delete meeting. Please try again.');
    } finally {
      setDeletingMeeting(false);
    }
  };

  // Real-time updates
  const handleEmailUpdate = React.useCallback((newEmails) => {
    if (refetch) refetch();
  }, [refetch]);

  const handleMeetingUpdate = React.useCallback((newMeetings) => {
    if (refetch) refetch();
  }, [refetch]);

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
          </div>
          {/* Auto-Pilot toggle removed. */}
      {/* Health Snapshot Banner — links to dedicated Health page */}
      {health && health.readiness_score !== null ? (
        <div
          onClick={() => navigate('/health')}
          className={`cursor-pointer flex items-center justify-between p-4 rounded-xl border-2 transition-all hover:shadow-md ${
            health.readiness_score >= 80 ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' :
            health.readiness_score >= 60 ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800' :
            'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm ${
              health.readiness_score >= 80 ? 'bg-emerald-500' : health.readiness_score >= 60 ? 'bg-amber-500' : 'bg-red-500'
            }`}>{health.readiness_score}</div>
            <div>
              <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                Readiness: {health.readiness_label} · {health.sleep_hours}h sleep · {health.steps >= 1000 ? `${(health.steps/1000).toFixed(1)}k` : health.steps} steps
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Tap to view full Health dashboard →</p>
            </div>
          </div>
          {health.readiness_score < 60 && (
            <div className="flex items-center space-x-1 text-xs text-red-600 dark:text-red-400 font-medium">
              <Zap className="w-4 h-4" /><span>Low Energy</span>
            </div>
          )}
        </div>
      ) : (
        <div onClick={() => navigate('/health')}
          className="cursor-pointer flex items-center space-x-3 p-4 rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-700 hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors">
          <Heart className="w-5 h-5 text-emerald-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">Set up health tracking for AI-aware scheduling →</span>
        </div>
      )}

      {/* AI Insights Panel — Gemini-powered briefing */}
      <Card className="bg-gradient-to-br from-violet-50 to-purple-100 dark:from-violet-900/20 dark:to-purple-800/20 border-violet-200 dark:border-violet-800">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Brain className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            <span>AI Insights</span>
            {insightsLoading && <Loader2 className="w-4 h-4 animate-spin text-violet-500" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {insightsLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">Generating your daily briefing…</p>
          ) : aiInsights ? (
            <div className="space-y-3">
              <FormattedAIResponse text={aiInsights} className="text-gray-700 dark:text-gray-300" />
              {aiConflicts.length > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400 flex items-center space-x-1">
                    <AlertCircle className="w-4 h-4" />
                    <span>{aiConflicts.length} scheduling conflict{aiConflicts.length !== 1 ? 's' : ''} detected</span>
                  </p>
                  <ul className="mt-1 space-y-1 text-xs text-red-600 dark:text-red-400">
                    {aiConflicts.map((c, i) => (
                      <li key={i}>⚠ "{c.meeting_a?.title}" overlaps with "{c.meeting_b?.title}"</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : dailyBrief ? (
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{dailyBrief.summary}</p>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No insights available yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Draft result toast */}
      {draftResult && (
        <div className={`p-3 rounded-lg border text-sm flex items-center justify-between ${draftResult.success
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
        }`}>
          <span>{draftResult.message}</span>
          <button onClick={() => setDraftResult(null)} className="ml-2 hover:opacity-70"><X className="w-4 h-4" /></button>
        </div>
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
            <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800 pr-2">
              {emails.map((email) => (
                <div
                  key={email.id}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-1 cursor-pointer" onClick={() => {
                    if (email.thread_id) window.location.href = `/emails?thread=${email.thread_id}`;
                    else window.location.href = `/emails/${email.id}`;
                  }}>
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
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{email.subject}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{email.preview}</p>

                  {/* 1-Click Draft Reply button */}
                  {email.priority === 'high' && (
                    <Button
                      size="sm" variant="outline"
                      className="mt-2 text-xs h-7 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                      onClick={(e) => { e.stopPropagation(); handleDraftReply(email.id); }}
                      disabled={draftingEmail === email.id}
                    >
                      {draftingEmail === email.id ? (
                        <><Loader2 className="w-3 h-3 animate-spin mr-1" />Drafting…</>
                      ) : (
                        <><Send className="w-3 h-3 mr-1" />AI Draft Reply</>
                      )}
                    </Button>
                  )}
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
              {meetings.slice(0, 5).map((meeting) => (
                <div
                  key={meeting.id}
                  onClick={() => { setSelectedMeeting(meeting); setShowMeetingDialog(true); }}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all cursor-pointer group shadow-sm hover:shadow-md"
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
                  {meeting.meet_link && (
                    <div className="mt-2 flex items-center text-xs text-blue-600 dark:text-blue-400 font-medium group-hover:underline">
                      <Video className="w-3 h-3 mr-1" />
                      Virtual Meeting Details
                    </div>
                  )}
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

        {/* Teams Panel */}
        <TeamsCard />

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
                  className={`p-3 rounded-lg border ${!notification.read
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
                  className="p-4 rounded-lg bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 shadow-sm"
                >
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                    {suggestion.message}
                  </p>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => {
                      if (suggestion.action === 'View Emails') navigate('/emails');
                      else if (suggestion.action === 'View Tasks') navigate('/chat');
                      else if (suggestion.action === 'View Meetings') navigate('/meetings');
                    }}>
                    {suggestion.action}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Meeting Detail Dialog */}
      <Dialog open={showMeetingDialog} onOpenChange={setShowMeetingDialog}>
        <DialogContent className="max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {selectedMeeting?.title || 'Meeting Details'}
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              View attendees and location for this event.
            </DialogDescription>
          </DialogHeader>
          
          {selectedMeeting && (
            <div className="space-y-4 py-2">
              <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                <div className="p-2 rounded-full bg-primary-100 dark:bg-primary-900/30">
                  <Clock className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedMeeting.time}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Duration: {selectedMeeting.duration}</div>
                </div>
              </div>

              {selectedMeeting.location && (
                <div className="flex items-start space-x-3 py-1">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{selectedMeeting.location}</span>
                </div>
              )}

              {selectedMeeting.attendees && selectedMeeting.attendees.length > 0 && (
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 flex items-center">
                    <Users className="w-3 h-3 mr-1" />
                    Attendees ({selectedMeeting.attendees.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedMeeting.attendees.map((a, i) => (
                      <div key={i} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                        {a}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedMeeting.description && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400">Notes</label>
                  <FormattedAIResponse text={selectedMeeting.description} className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-800/30 p-3 rounded-lg italic" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                <Button 
                  variant="outline" 
                  disabled={deletingMeeting}
                  onClick={() => handleDeleteMeeting(selectedMeeting.id)}
                  className="border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  {deletingMeeting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Delete
                </Button>
                {selectedMeeting.meet_link ? (
                  <Button 
                    onClick={() => window.open(selectedMeeting.meet_link, '_blank', 'noopener,noreferrer')}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Video className="w-4 h-4 mr-2" />
                    Join Now
                  </Button>
                ) : (
                  <Button disabled variant="secondary" className="opacity-50">
                    No Link
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
