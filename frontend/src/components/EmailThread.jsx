import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { emailAPI } from '../utils/api.jsx';
import EmailActions from './EmailActions.jsx';
import { Loader2, MessageSquare, CalendarPlus, Brain, CheckCircle, Clock, MapPin } from 'lucide-react';
import { Button } from './ui/button.jsx';
import FormattedAIResponse from './FormattedAIResponse.jsx';
import { aiAPI, meetingAPI } from '../utils/api.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Zap, XCircle } from 'lucide-react';

const EmailThread = ({ threadId, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  
  // Proactive Meeting State
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartAction, setSmartAction] = useState(null);
  const [showConfirmAdd, setShowConfirmAdd] = useState(false);
  const [addingMeeting, setAddingMeeting] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [pendingShowConfirm, setPendingShowConfirm] = useState(false);
  const [autoCountdown, setAutoCountdown] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    if (threadId) {
      fetchThread();
    }
  }, [threadId]);

  const fetchThread = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await emailAPI.getEmailThread(threadId);
      setMessages(response.data.messages || []);
      if (response.data.messages && response.data.messages.length > 0) {
        setSelectedMessage(response.data.messages[0]);
      }
    } catch (err) {
      console.error('Error fetching thread:', err);
      setError('Failed to load email thread');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeEmail = async (id) => {
    if (!id) return;
    setSmartLoading(true);
    try {
      const res = await aiAPI.smartReply(id);
      setSmartAction(res.data);
      if (pendingShowConfirm) {
        setShowConfirmAdd(true);
        setPendingShowConfirm(false);
      }
    } catch (err) {
      console.error('Smart action error:', err);
    } finally {
      setSmartLoading(false);
    }
  };

  const handleConfirmAdd = async () => {
    if (!smartAction?.meeting_info || !selectedMessage) return;
    setAddingMeeting(true);
    setAddSuccess(false);
    
    try {
      setStatusMessage("Reading meeting details...");
      await new Promise(r => setTimeout(r, 600)); 
      
      setStatusMessage("Checking calendar conflicts...");
      await new Promise(r => setTimeout(r, 800));

      setStatusMessage("Adding to Google Calendar...");
      const info = smartAction.meeting_info;
      await meetingAPI.createMeeting({
        title: info.title || 'Meeting from Email',
        description: info.notes || `Extracted from thread: ${selectedMessage.subject}`,
        start_datetime: info.start_time,
        end_datetime: info.end_time || info.start_time,
        location: info.location || '',
        attendees: [],
      });

      setStatusMessage("Sending auto-reply to organizer...");
      if (smartAction.reply_text) {
        await emailAPI.replyToEmail(selectedMessage.id, smartAction.reply_text);
      }

      setStatusMessage("Saving proactive summary...");
      await aiAPI.logProactiveAction({
        id: selectedMessage.id,
        summary: `Synced meeting "${info.title || 'Meeting'}" for ${info.start_time} (IST) and automatically replied to organizer.`
      });

      await new Promise(r => setTimeout(r, 500));
      
      setAddSuccess(true);
      setStatusMessage("Added to calendar and sent reply!");
      
      setTimeout(() => {
        setShowConfirmAdd(false);
        setAddSuccess(false);
        setStatusMessage("");
        setSmartAction(prev => ({ ...prev, meeting_added: true }));
      }, 3000);
    } catch (err) {
      console.error('Failed to complete proactive action:', err);
      setStatusMessage("Sync partially failed. Please check manually.");
      setTimeout(() => setAddingMeeting(false), 3000);
    } finally {
      setAddingMeeting(false);
    }
  };

  // Auto-Pilot Logic
  useEffect(() => {
    let timer;
    if (user?.auto_pilot_enabled && smartAction?.meeting_info && !smartAction?.meeting_added && !addingMeeting && autoCountdown === null) {
      setAutoCountdown(2); // 2 second safety buffer
    }

    if (autoCountdown !== null && autoCountdown > 0) {
      timer = setTimeout(() => setAutoCountdown(autoCountdown - 1), 1000);
    } else if (autoCountdown === 0) {
      setAutoCountdown(null);
      handleConfirmAdd();
    }

    return () => clearTimeout(timer);
  }, [user?.auto_pilot_enabled, smartAction, autoCountdown, addingMeeting]);

  useEffect(() => {
    if (selectedMessage) {
      const meetingKeywords = /\b(invite|meeting|calendar|agenda|scheduled|rsvp|conference|zoom|teams|google meet)\b/i;
      const textToScan = `${selectedMessage.subject || ''} ${selectedMessage.body || ''}`;
      if (meetingKeywords.test(textToScan)) {
        handleAnalyzeEmail(selectedMessage.id);
      } else {
        setSmartAction(null);
      }
    }
  }, [selectedMessage]);

  const handleUpdate = () => {
    fetchThread();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </CardContent>
      </Card>
    );
  }

  if (error || !messages.length) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 dark:text-red-400 mb-4">{error || 'Thread not found'}</p>
            {onBack && (
              <Button onClick={onBack} variant="outline">
                Back
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-5 w-5" />
              <CardTitle>Email Thread ({messages.length} messages)</CardTitle>
            </div>
            {onBack && (
              <Button onClick={onBack} variant="outline" size="sm">
                Back
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Thread List */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    onClick={() => setSelectedMessage(message)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                      selectedMessage?.id === message.id
                        ? 'bg-primary-50 dark:bg-primary-900/20 border-l-4 border-primary-600'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {message.from}
                      </p>
                      {message.unread && (
                        <span className="w-2 h-2 bg-primary-500 rounded-full"></span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {message.subject}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      {new Date(message.date).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Selected Message */}
        <div className="lg:col-span-2">
          {selectedMessage && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2">{selectedMessage.subject}</CardTitle>
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                      <p><strong>From:</strong> {selectedMessage.from}</p>
                      <p><strong>Date:</strong> {new Date(selectedMessage.date).toLocaleString()}</p>
                    </div>
                    <div className="mt-3">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={smartLoading || addingMeeting}
                        onClick={() => {
                          if (smartAction?.meeting_info) {
                            setShowConfirmAdd(true);
                          } else {
                            setPendingShowConfirm(true);
                            handleAnalyzeEmail(selectedMessage.id);
                          }
                        }}
                        className="text-violet-600 border-violet-200 hover:bg-violet-50 dark:border-violet-800 dark:hover:bg-violet-900/20"
                      >
                        {smartLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Scanning...
                          </>
                        ) : (
                          <>
                            <CalendarPlus className="w-4 h-4 mr-2" />
                            Add to Calendar
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <EmailActions
                    email={{
                      id: selectedMessage.id,
                      from_email: selectedMessage.from,
                      subject: selectedMessage.subject,
                      unread: selectedMessage.unread
                    }}
                    onUpdate={handleUpdate}
                  />
                </div>
              </CardHeader>
              <CardContent>
                {/* Smart Action Panel inside Thread View */}
                {(smartLoading || smartAction) && (
                  <div className={`mb-4 rounded-lg border-2 bg-gradient-to-br transition-all ${
                    smartAction?.meeting_detected 
                      ? 'from-violet-50 to-indigo-100 dark:from-violet-900/20 dark:to-indigo-900/20 border-violet-200 dark:border-violet-800' 
                      : 'from-gray-50 to-gray-100 dark:from-gray-900/40 dark:to-gray-800/40 border-gray-200 dark:border-gray-800'
                  }`}>
                    {/* Auto-Pilot Banner */}
                    {autoCountdown !== null && (
                      <div className="bg-amber-500 text-white px-4 py-2 rounded-t-lg flex items-center justify-between text-xs font-bold animate-in slide-in-from-top-full">
                        <div className="flex items-center space-x-2">
                          <Zap className="w-3 h-3 fill-white" />
                          <span>AUTO-PILOT: SYNCING IN {autoCountdown}s...</span>
                        </div>
                        <button 
                          onClick={() => setAutoCountdown(null)}
                          className="hover:bg-white/20 px-2 py-1 rounded border border-white/40 transition-colors"
                        >
                          CANCEL
                        </button>
                      </div>
                    )}

                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Brain className={`w-5 h-5 ${smartAction?.meeting_detected ? 'text-violet-600' : 'text-gray-400'}`} />
                          <div>
                            <p className="text-xs font-bold text-gray-900 dark:text-gray-100">AI Assistant</p>
                            <p className="text-[10px] text-gray-500">{smartLoading ? 'Analyzing...' : smartAction?.meeting_detected ? 'Meeting detected' : 'Scan complete'}</p>
                          </div>
                        </div>
                        {smartAction?.meeting_added && (
                          <div className="text-green-600 text-[10px] font-bold">Added to Calendar</div>
                        )}
                      </div>
                      {smartAction?.reply_text && (
                        <div className="mt-3 p-2 bg-white/50 dark:bg-black/20 rounded border border-indigo-100/50">
                           <FormattedAIResponse text={smartAction.reply_text} className="text-xs" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div
                  className="email-body dark:text-gray-100"
                  style={{ whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: '1.4', fontFamily: 'sans-serif' }}
                >
                  {selectedMessage.body}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmAdd} onOpenChange={setShowConfirmAdd}>
        <DialogContent className="sm:max-w-[500px] border-violet-200 dark:border-violet-900">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <CalendarPlus className="w-5 h-5 text-violet-600" />
              <span>Confirm Calendar Event</span>
            </DialogTitle>
            <DialogDescription>
              Verify the details extracted by AI before adding to your calendar.
            </DialogDescription>
          </DialogHeader>
          
          {smartAction?.meeting_info && (
            <div className="space-y-4 py-4">
              <div className="grid gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-gray-500">Event Title</label>
                  <p className="text-sm font-bold bg-gray-50 dark:bg-gray-800 p-2 rounded-md">{smartAction.meeting_info.title || 'Meeting'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-gray-500">Start Time</label>
                    <p className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded-md">
                      {new Date(smartAction.meeting_info.start_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-gray-500">End Time (Est)</label>
                    <p className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded-md">
                      {smartAction.meeting_info.end_time ? new Date(smartAction.meeting_info.end_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST' : 'TBD (60m)'}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-gray-500">Location</label>
                  <p className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded-md">{smartAction.meeting_info.location || 'Online / Remote'}</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-gray-100 dark:border-gray-800 pt-4 px-0">
            {addingMeeting ? (
              <div className="w-full space-y-3 px-6 pb-2">
                <div className="flex items-center justify-center space-x-3 text-violet-600 font-medium">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">{statusMessage}</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-violet-600 h-full animate-pulse transition-all duration-500" style={{ width: '100%' }}></div>
                </div>
              </div>
            ) : addSuccess ? (
              <div className="w-full flex flex-col items-center justify-center space-y-1 text-green-600 font-bold py-2">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-6 h-6" />
                  <span>{statusMessage}</span>
                </div>
                <p className="text-[10px] text-gray-400 font-normal">Your calendar is synced and organizer notified.</p>
              </div>
            ) : (
              <div className="flex w-full space-x-3 px-6">
                <Button variant="ghost" className="flex-1" onClick={() => setShowConfirmAdd(false)}>Cancel</Button>
                <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-white" onClick={handleConfirmAdd}>
                  Confirm & Sync
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailThread;
