import React, { useState, useEffect } from 'react';
import CalendarView from '../components/CalendarView.jsx';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.jsx';
import { Button } from '../components/ui/button.jsx';
import { Calendar, Clock, MapPin, Users, Edit, Trash2, AlertTriangle, Loader2, Zap, CheckCircle } from 'lucide-react';
import { meetingAPI, aiAPI } from '../utils/api.jsx';
import { useNavigate } from 'react-router-dom';

const Meetings = () => {
  const [view, setView] = useState('week'); // 'week' or 'month'
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [showMeetingDialog, setShowMeetingDialog] = useState(false);
  const navigate = useNavigate();

  // Conflict state
  const [conflicts, setConflicts] = useState([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleResult, setRescheduleResult] = useState(null);

  // Fetch conflicts on mount
  useEffect(() => {
    const fetchConflicts = async () => {
      try {
        setConflictsLoading(true);
        const res = await aiAPI.getConflicts();
        setConflicts(res.data.conflicts || []);
      } catch (err) {
        console.error('Failed to fetch conflicts:', err);
      } finally {
        setConflictsLoading(false);
      }
    };
    fetchConflicts();
  }, []);

  const handleAutoReschedule = async () => {
    try {
      setRescheduleLoading(true);
      setRescheduleResult(null);
      const res = await aiAPI.autoReschedule();
      setRescheduleResult(res.data);
      // Refresh conflicts after rescheduling
      const conflictsRes = await aiAPI.getConflicts();
      setConflicts(conflictsRes.data.conflicts || []);
    } catch (err) {
      console.error('Auto-reschedule failed:', err);
      setRescheduleResult({ error: 'Failed to auto-reschedule. Please try again.' });
    } finally {
      setRescheduleLoading(false);
    }
  };

  const handleMeetingClick = (meeting) => {
    setSelectedMeeting(meeting);
    setShowMeetingDialog(true);
  };

  const handleEditMeeting = () => {
    if (selectedMeeting) {
      alert('Edit meeting functionality - to be implemented');
    }
  };

  const handleDeleteMeeting = async () => {
    if (!selectedMeeting) return;
    if (!confirm('Are you sure you want to delete this meeting?')) return;
    try {
      await meetingAPI.deleteMeeting(selectedMeeting.id);
      setShowMeetingDialog(false);
      setSelectedMeeting(null);
      window.location.reload();
    } catch (error) {
      console.error('Error deleting meeting:', error);
      alert('Failed to delete meeting. Please try again.');
    }
  };

  const handleCreateMeeting = () => {
    setShowMeetingDialog(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Meetings</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Manage your calendar and meetings</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant={view === 'day' ? 'default' : 'outline'}
            onClick={() => setView('day')}
            size="sm"
          >
            Day
          </Button>
          <Button
            variant={view === 'week' ? 'default' : 'outline'}
            onClick={() => setView('week')}
            size="sm"
          >
            Week
          </Button>
          <Button
            variant={view === 'month' ? 'default' : 'outline'}
            onClick={() => setView('month')}
            size="sm"
          >
            Month
          </Button>
        </div>
      </div>

      {/* Conflict Detection Panel */}
      {conflictsLoading ? (
        <div className="h-20 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-xl animate-pulse flex items-center px-4 space-x-2 text-yellow-700 dark:text-yellow-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-medium">Analyzing your calendar for conflicts…</span>
        </div>
      ) : conflicts.length > 0 ? (
        <Card className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
                <span>{conflicts.length} Scheduling Conflict{conflicts.length !== 1 ? 's' : ''} Detected</span>
              </div>
              <Button
                onClick={handleAutoReschedule}
                disabled={rescheduleLoading}
                size="sm"
                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
              >
                {rescheduleLoading ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Rescheduling…</>
                ) : (
                  <><Zap className="w-4 h-4 mr-1" /> Auto-Reschedule All</>
                )}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {conflicts.map((c, i) => (
                <div key={i} className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-gray-800 dark:text-gray-200">
                    <span className="font-medium">⚠ "{c.meeting_a?.title}"</span>
                    {' '}overlaps with{' '}
                    <span className="font-medium">"{c.meeting_b?.title}"</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Overlap: {c.overlap_start?.split('T')[1]?.substring(0, 5)} – {c.overlap_end?.split('T')[1]?.substring(0, 5)}
                  </p>
                </div>
              ))}
            </div>

            {/* Reschedule result */}
            {rescheduleResult && !rescheduleResult.error && (
              <div className="mt-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <p className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center space-x-1">
                  <CheckCircle className="w-4 h-4" />
                  <span>{rescheduleResult.total} meeting{rescheduleResult.total !== 1 ? 's' : ''} rescheduled successfully!</span>
                </p>
                {rescheduleResult.actions?.map((a, i) => (
                  <p key={i} className="text-xs text-green-600 dark:text-green-400 mt-1">
                    ✓ "{a.moved?.title}" → {a.new_start?.split('T')[0]} at {a.new_start?.split('T')[1]?.substring(0, 5)}
                    {a.notified && ' (attendees notified)'}
                  </p>
                ))}
              </div>
            )}
            {rescheduleResult?.error && (
              <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{rescheduleResult.error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : !conflictsLoading && (
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-4 flex items-center space-x-2 text-green-600 dark:text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">No scheduling conflicts — your calendar looks great!</span>
          </CardContent>
        </Card>
      )}

      <CalendarView
        view={view}
        onMeetingClick={handleMeetingClick}
        onCreateMeeting={handleCreateMeeting}
        onViewChange={setView}
      />

      {/* Meeting Detail Dialog */}
      <Dialog open={showMeetingDialog} onOpenChange={setShowMeetingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedMeeting?.title}</DialogTitle>
          </DialogHeader>
          {selectedMeeting && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
                <Clock className="h-4 w-4" />
                <span>{selectedMeeting.time} ({selectedMeeting.duration})</span>
              </div>
              {selectedMeeting.location && (
                <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
                  <MapPin className="h-4 w-4" />
                  <span>{selectedMeeting.location}</span>
                </div>
              )}
              {selectedMeeting.attendees && selectedMeeting.attendees.length > 0 && (
                <div className="flex items-start space-x-2 text-gray-600 dark:text-gray-400">
                  <Users className="h-4 w-4 mt-1" />
                  <div>
                    <p className="font-medium mb-1">Attendees:</p>
                    <ul className="list-disc list-inside">
                      {selectedMeeting.attendees.map((attendee, index) => (
                        <li key={index}>{attendee}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {selectedMeeting.description && (
                <div className="text-gray-600 dark:text-gray-400">
                  <p className="font-medium mb-1">Description:</p>
                  <p className="whitespace-pre-wrap">{selectedMeeting.description}</p>
                </div>
              )}
              {/* Removed Delete Button as requested */}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Meetings;

