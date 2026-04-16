import React, { useState, useEffect } from 'react';
import CalendarView from '../components/CalendarView.jsx';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog.jsx';
import { Button } from '../components/ui/button.jsx';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  Trash2, 
  AlertTriangle, 
  Loader2, 
  Zap, 
  CheckCircle, 
  Video, 
  ChevronLeft, 
  RefreshCw, 
  Settings as SettingsIcon 
} from 'lucide-react';
import { meetingAPI, aiAPI } from '../utils/api.jsx';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

const Meetings = () => {
  const [view, setView] = useState('week'); // 'week' or 'month'
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [showMeetingDialog, setShowMeetingDialog] = useState(false);
  const [meetingActionView, setMeetingActionView] = useState('info'); // 'info', 'manage', 'reschedule', 'cancel'
  const [newTime, setNewTime] = useState({ start: null, end: null });
  const [actionLoading, setActionLoading] = useState(false);
  const queryClient = useQueryClient();
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
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    } catch (err) {
      console.error('Auto-reschedule failed:', err);
      setRescheduleResult({ error: 'Failed to auto-reschedule. Please try again.' });
    } finally {
      setRescheduleLoading(false);
    }
  };

  // Reset view when dialog opens/closes
  useEffect(() => {
    if (showMeetingDialog && selectedMeeting) {
      setMeetingActionView('info');
      setNewTime({
        start: selectedMeeting.start_datetime ? new Date(selectedMeeting.start_datetime) : null,
        end: selectedMeeting.end_datetime ? new Date(selectedMeeting.end_datetime) : null
      });
    }
  }, [showMeetingDialog, selectedMeeting]);

  const handleMeetingClick = (meeting) => {
    setSelectedMeeting(meeting);
    setShowMeetingDialog(true);
  };

  const handleManualReschedule = async () => {
    if (!selectedMeeting || !newTime.start || !newTime.end) return;
    try {
      setActionLoading(true);
      
      await meetingAPI.rescheduleMeetingManual(selectedMeeting.id, {
        start_datetime: newTime.start.toISOString(),
        end_datetime: newTime.end.toISOString()
      });
      
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      setShowMeetingDialog(false);
      alert('Meeting rescheduled and attendees notified.');
    } catch (error) {
      console.error('Error rescheduling meeting:', error);
      alert('Failed to reschedule meeting. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelMeeting = async () => {
    if (!selectedMeeting) return;
    try {
      setActionLoading(true);
      await meetingAPI.deleteMeeting(selectedMeeting.id);
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      setShowMeetingDialog(false);
      setSelectedMeeting(null);
      alert('Meeting canceled and attendees notified.');
    } catch (error) {
      console.error('Error canceling meeting:', error);
      alert('Failed to cancel meeting.');
    } finally {
      setActionLoading(false);
    }
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
                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg"
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
        onCreateMeeting={() => queryClient.invalidateQueries({ queryKey: ['calendar-events'] })}
        onViewChange={setView}
      />

      {/* Meeting Detail Dialog */}
      <Dialog open={showMeetingDialog} onOpenChange={setShowMeetingDialog}>
        <DialogContent className="max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl rounded-2xl p-0 overflow-hidden">
          {selectedMeeting && (
            <div className="flex flex-col">
              {/* Header with Background */}
              <div className="p-6 bg-gradient-to-br from-violet-600 to-indigo-700 text-white relative">
                 {meetingActionView !== 'info' && (
                   <Button 
                     variant="ghost" 
                     size="icon" 
                     onClick={() => setMeetingActionView('info')}
                     className="absolute left-4 top-4 text-white hover:bg-white/20"
                   >
                     <ChevronLeft className="h-4 w-4" />
                   </Button>
                 )}
                 <div className="mt-4">
                   <h2 className="text-2xl font-bold leading-tight">{selectedMeeting.title}</h2>
                   <div className="flex items-center mt-2 text-violet-100/80 text-sm space-x-4">
                     <span className="flex items-center"><Clock className="w-3.5 h-3.5 mr-1" /> {selectedMeeting.duration}</span>
                     {selectedMeeting.location && <span className="flex items-center"><MapPin className="w-3.5 h-3.5 mr-1" /> {selectedMeeting.location}</span>}
                   </div>
                 </div>
              </div>

              <div className="p-6">
                {meetingActionView === 'info' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {/* Time Detail */}
                    <div className="flex items-start space-x-3">
                      <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg text-violet-600 dark:text-violet-400">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold dark:text-gray-200">{selectedMeeting.time}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{selectedMeeting.date}</p>
                      </div>
                    </div>

                    {/* Attendees */}
                    {selectedMeeting.attendees?.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2 text-sm font-semibold dark:text-gray-200">
                          <Users className="w-4 h-4 text-gray-400" />
                          <span>Attendees ({selectedMeeting.attendees.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedMeeting.attendees.map((a, i) => (
                            <span key={i} className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 shadow-sm transition-colors hover:border-violet-400/50">
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Description */}
                    {selectedMeeting.description && (
                      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50">
                        <p className="text-xs font-bold uppercase text-gray-400 mb-1">Agenda</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{selectedMeeting.description}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-4">
                      <Button 
                        variant="outline" 
                        onClick={() => setMeetingActionView('manage')}
                        className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl font-semibold"
                      >
                        <SettingsIcon className="w-4 h-4 mr-2" />
                        Manage
                      </Button>
                      {selectedMeeting.meet_link ? (
                        <Button 
                          onClick={() => window.open(selectedMeeting.meet_link, '_blank')}
                          className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold shadow-lg shadow-violet-500/20"
                        >
                          <Video className="w-4 h-4 mr-2" />
                          Join Meet
                        </Button>
                      ) : (
                        <Button disabled variant="secondary" className="rounded-xl opacity-50">No Link</Button>
                      )}
                    </div>
                  </div>
                )}

                {meetingActionView === 'manage' && (
                  <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 text-center">What would you like to do with this meeting?</p>
                    <Button 
                      variant="outline" 
                      onClick={() => setMeetingActionView('reschedule')}
                      className="w-full h-14 justify-start px-6 border-violet-100 dark:border-violet-900/30 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-xl group"
                    >
                      <RefreshCw className="w-5 h-5 mr-4 text-violet-500 group-hover:rotate-180 transition-transform duration-500" />
                      <div className="text-left">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">Reschedule Meeting</p>
                        <p className="text-[10px] text-gray-500">Pick new time & notify attendees</p>
                      </div>
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setMeetingActionView('cancel')}
                      className="w-full h-14 justify-start px-6 border-red-100 dark:border-red-900/30 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl group"
                    >
                      <Trash2 className="w-5 h-5 mr-4 text-red-500 group-hover:scale-110 transition-transform" />
                      <div className="text-left">
                        <p className="font-semibold text-red-600 dark:text-red-400">Cancel Meeting</p>
                        <p className="text-[10px] text-gray-500">Remove from calendar & notify</p>
                      </div>
                    </Button>
                  </div>
                )}

                {meetingActionView === 'reschedule' && (
                  <div className="space-y-5 animate-in slide-in-from-right-4 duration-300">
                      <div className="grid grid-cols-1 gap-4">
                        <div className="bg-gray-50/50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                          <label className="block text-xs font-bold uppercase text-gray-400 mb-2">New Start Time</label>
                          <DatePicker
                            selected={newTime.start}
                            onChange={(date) => setNewTime({...newTime, start: date})}
                            showTimeSelect
                            timeIntervals={15}
                            dateFormat="MMMM d, yyyy h:mm aa"
                            minDate={new Date()}
                            className="w-full px-0 bg-transparent border-none text-gray-900 dark:text-gray-100 font-semibold focus:ring-0"
                            calendarClassName="premium-calendar"
                          />
                        </div>
                        <div className="bg-gray-50/50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                          <label className="block text-xs font-bold uppercase text-gray-400 mb-2">New End Time</label>
                          <DatePicker
                            selected={newTime.end}
                            onChange={(date) => setNewTime({...newTime, end: date})}
                            showTimeSelect
                            timeIntervals={15}
                            dateFormat="MMMM d, yyyy h:mm aa"
                            minDate={newTime.start || new Date()}
                            className="w-full px-0 bg-transparent border-none text-gray-900 dark:text-gray-100 font-semibold focus:ring-0"
                            calendarClassName="premium-calendar"
                          />
                        </div>
                      </div>
                    <Button 
                      onClick={handleManualReschedule}
                      disabled={actionLoading}
                      className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold shadow-lg shadow-violet-500/20"
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm & Send Updates'}
                    </Button>
                  </div>
                )}

                {meetingActionView === 'cancel' && (
                  <div className="space-y-6 text-center animate-in slide-in-from-right-4 duration-300">
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-900/30">
                      <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                      <h3 className="text-lg font-bold text-red-700 dark:text-red-400">Confirm Cancellation</h3>
                      <p className="text-sm text-red-600/80 dark:text-red-400/80 mt-1">
                        Choosing to cancel will remove this meeting from your calendar and send a cancellation email to all attendees.
                      </p>
                    </div>
                    <div className="flex space-x-3">
                      <Button 
                        variant="outline" 
                        onClick={() => setMeetingActionView('manage')}
                        className="flex-1 h-12 rounded-xl border-gray-200"
                      >
                        Go Back
                      </Button>
                      <Button 
                        onClick={handleCancelMeeting}
                        disabled={actionLoading}
                        className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-500/20"
                      >
                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancel Meeting'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Meetings;
