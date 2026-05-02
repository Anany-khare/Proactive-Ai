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

  const handleAnalyzeEmail = async (id, shouldShowConfirm = false) => {
    if (!id) return;
    setSmartLoading(true);
    try {
      const res = await aiAPI.smartReply(id);
      setSmartAction(res.data);
      if (pendingShowConfirm || shouldShowConfirm) {
        setShowConfirmAdd(true);
        setPendingShowConfirm(false);
      }
    } catch (err) {
      console.error('Smart action error:', err);
    } finally {
      setSmartLoading(false);
    }
  };

  const [rsvpStatus, setRsvpStatus] = useState('yes');

  const handleConfirmAdd = async (rsvp = 'yes') => {
    if (!smartAction?.meeting_info || !selectedMessage) return;
    setAddingMeeting(true);
    setAddSuccess(false);
    
    try {
      setStatusMessage("Reading meeting details...");
      await new Promise(r => setTimeout(r, 600)); 
      
      let eventId = smartAction.auto_added_event_id;
      let nativeRsvpHandled = false;
      
      if (rsvp === 'no') {
        if (smartAction.auto_added_event_id) {
          setStatusMessage("Removing from Google Calendar...");
          try {
            await meetingAPI.deleteMeeting(smartAction.auto_added_event_id);
          } catch (e) {
            console.error("Failed to remove auto-added event:", e);
          }
        }
      } else {
        setStatusMessage("Checking calendar conflicts...");
        await new Promise(r => setTimeout(r, 800));

        setStatusMessage("Executing proactive sync...");
        const info = smartAction.meeting_info;
        const plan = smartAction.proactive_plan;
        
        const syncRes = await aiAPI.executeProactiveSync(selectedMessage.id, info, plan, smartAction.auto_added_event_id);

        if (!syncRes.data.success) {
          throw new Error(syncRes.data.message || "Sync failed");
        }
        if (syncRes.data.event_id) {
          eventId = syncRes.data.event_id;
        }
        if (syncRes.data.native_rsvp) {
          nativeRsvpHandled = true;
        }
      }

      let replyMessage = smartAction.reply_text;
      if (!nativeRsvpHandled) {
        setStatusMessage("Sending auto-reply to organizer...");
        if (rsvp === 'no') {
            replyMessage = "Thank you for the invitation, but I won't be able to make it to this meeting as I have a meeting with others.";
        } else if (rsvp === 'maybe') {
            replyMessage = "Thanks for the invite. I've added it to my calendar, but my attendance is tentative right now. " + (smartAction.reply_text || "");
        } else if (rsvp === 'yes') {
            replyMessage = "I have accepted the meeting invitation and added it to my calendar. See you then!";
        }
        
        if (replyMessage) {
          await emailAPI.replyToEmail(selectedMessage.id, replyMessage);
        }
      } else {
          setStatusMessage("RSVP sent via Calendar...");
          replyMessage = "[Accepted via Google Calendar]";
      }
      
      setStatusMessage("Updating AI insight...");
      await aiAPI.updateInsight(selectedMessage.id, rsvp, replyMessage, eventId);

      setStatusMessage("Saving proactive summary...");
      await aiAPI.logProactiveAction({
        id: selectedMessage.id,
        summary: rsvp === 'no' 
          ? `Declined meeting "${smartAction.meeting_info.title || 'Meeting'}" and replied.` 
          : nativeRsvpHandled 
            ? `Accepted invitation for "${smartAction.meeting_info.title || 'Meeting'}" via Google Calendar.`
            : `Synced meeting "${smartAction.meeting_info.title || 'Meeting'}" (${rsvp.toUpperCase()}) and replied.`
      });

      await new Promise(r => setTimeout(r, 500));
      
      setAddSuccess(true);
      setStatusMessage(rsvp === 'no' ? "Declined and sent reply!" : nativeRsvpHandled ? "Accepted via Calendar!" : "Added to calendar and sent reply!");
      
      setTimeout(() => {
        setShowConfirmAdd(false);
        setAddSuccess(false);
        setStatusMessage("");
        setSmartAction(prev => ({ 
           ...prev, 
           meeting_added: rsvp !== 'no',
           rsvp_status: rsvp,
           reply_text: replyMessage,
           auto_added_event_id: eventId
        }));
        handleUpdate(); // Refetch the thread so the sent email appears
      }, 3000);
    } catch (err) {
      console.error('Failed to complete proactive action:', err);
      setStatusMessage("Sync partially failed. Please check manually.");
      setTimeout(() => setAddingMeeting(false), 3000);
    } finally {
      setAddingMeeting(false);
    }
  };

  // Removed old Auto-Pilot logic as the backend handles it now.

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
                        disabled={smartLoading || addingMeeting || !!smartAction?.rsvp_status}
                        onClick={() => {
                          if (smartAction?.meeting_info) {
                            setShowConfirmAdd(true);
                          } else {
                            handleAnalyzeEmail(selectedMessage.id, true);
                          }
                        }}
                        className={`border-violet-200 dark:border-violet-800 ${
                          smartAction?.rsvp_status === 'yes' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                          smartAction?.rsvp_status === 'no' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
                          'text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20'
                        }`}
                      >
                        {smartLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Scanning...
                          </>
                        ) : smartAction?.rsvp_status ? (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {smartAction.rsvp_status === 'yes' ? 'Accepted' : smartAction.rsvp_status === 'no' ? 'Declined' : 'Tentative'}
                          </>
                        ) : smartAction?.meeting_added ? (
                          <>
                            <CalendarPlus className="w-4 h-4 mr-2" />
                            Review RSVP
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
                          <Brain className={`w-5 h-5 ${smartAction?.is_meeting ? 'text-violet-600' : 'text-gray-400'}`} />
                          <div>
                            <p className="text-xs font-bold text-gray-900 dark:text-gray-100">AI Assistant</p>
                            <p className="text-[10px] text-gray-500">{smartLoading ? 'Analyzing...' : smartAction?.is_meeting ? 'Meeting detected' : 'Scan complete'}</p>
                          </div>
                        </div>
                        {smartAction?.rsvp_status ? (
                          <div className={`text-[10px] font-bold px-3 py-1 rounded-full ${
                            smartAction.rsvp_status === 'yes' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            smartAction.rsvp_status === 'no' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}>
                            RSVP: {smartAction.rsvp_status.toUpperCase()}
                          </div>
                        ) : smartAction?.meeting_added ? (
                          <div 
                            className="text-green-600 text-[10px] font-bold cursor-pointer hover:underline"
                            onClick={() => setShowConfirmAdd(true)}
                          >
                            Auto-Added. Click to RSVP
                          </div>
                        ) : null}
                      </div>
                        {smartAction?.reply_text && (
                          <div className="mt-3 p-2 bg-white/50 dark:bg-black/20 rounded border border-indigo-100/50">
                             <p className="text-[10px] font-bold text-gray-400 mb-1 uppercase">{smartAction.rsvp_status ? 'Sent Reply' : 'AI Drafted Reply'}</p>
                             <FormattedAIResponse text={smartAction.is_meeting ? "I have accepted the meeting invitation and added it to my calendar. See you then!" : smartAction.reply_text} className="text-xs" />
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

          <DialogFooter className="border-t border-gray-100 dark:border-gray-800 pt-4 px-0 flex flex-col space-y-4">
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
              <div className="w-full">
                <div className="flex justify-center space-x-4 mb-4 px-6 w-full">
                  <Button variant={rsvpStatus === 'yes' ? 'default' : 'outline'} className={rsvpStatus === 'yes' ? 'bg-green-600 hover:bg-green-700 text-white' : ''} onClick={() => setRsvpStatus('yes')}>Yes</Button>
                  <Button variant={rsvpStatus === 'maybe' ? 'default' : 'outline'} className={rsvpStatus === 'maybe' ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : ''} onClick={() => setRsvpStatus('maybe')}>Maybe</Button>
                  <Button variant={rsvpStatus === 'no' ? 'default' : 'outline'} className={rsvpStatus === 'no' ? 'bg-red-600 hover:bg-red-700 text-white' : ''} onClick={() => setRsvpStatus('no')}>No</Button>
                </div>
                <div className="flex w-full space-x-3 px-6">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowConfirmAdd(false)}>Cancel</Button>
                  <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => handleConfirmAdd(rsvpStatus)}>
                    {rsvpStatus === 'no' ? 'Send Decline' : 'Confirm & Sync'}
                  </Button>
                </div>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailThread;
