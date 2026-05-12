import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { emailAPI, aiAPI, meetingAPI } from '../utils/api.jsx';
import EmailActions from './EmailActions.jsx';
import FormattedAIResponse from './FormattedAIResponse.jsx';
import { Loader2, ArrowLeft, Calendar, Brain, CheckCircle, AlertCircle, X, ExternalLink, CalendarPlus, Clock, MapPin } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Zap, XCircle } from 'lucide-react';

const EmailDetail = ({ messageId, onBack, onUpdate }) => {
  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Proactive Meeting State
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartAction, setSmartAction] = useState(null);
  const [showConfirmAdd, setShowConfirmAdd] = useState(false);
  const [addingMeeting, setAddingMeeting] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [pendingShowConfirm, setPendingShowConfirm] = useState(false);
  const [autoCountdown, setAutoCountdown] = useState(null);
  const [rsvpStatus, setRsvpStatus] = useState('yes');
  const { user } = useAuth();

  useEffect(() => {
    if (messageId) {
      fetchEmail();
    }
  }, [messageId]);

  const fetchEmail = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await emailAPI.getEmail(messageId);
      const emailData = response.data;
      setEmail(emailData);

      /* 
      // Trigger Smart Action logic if meeting keywords found
      const meetingKeywords = /\b(invite|meeting|calendar|agenda|scheduled|rsvp|conference|zoom|teams|google meet)\b/i;
      const textToScan = `${emailData.subject || ''} ${emailData.preview || ''} ${emailData.body || ''}`;
      if (meetingKeywords.test(textToScan)) {
        handleAnalyzeEmail(messageId);
      } else {
        // Clear previous smart actions if not a meeting
        setSmartAction(null);
      }
      */

    } catch (err) {
      console.error('Error fetching email:', err);
      setError('Failed to load email');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeEmail = async (id, shouldShowConfirm = false) => {
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

  const handleConfirmAdd = async (rsvp = 'yes') => {
    if (!smartAction?.meeting_info) return;
    setAddingMeeting(true);
    setAddSuccess(false);
    
    try {
      setStatusMessage("Reading meeting details...");
      await new Promise(r => setTimeout(r, 600)); 
      
      if (rsvp === 'no') {
        if (smartAction.auto_added_event_id) {
          setStatusMessage("Removing from Google Calendar...");
          try {
            await meetingAPI.deleteMeeting(smartAction.auto_added_event_id);
          } catch (e) {
            console.error("Failed to remove auto-added event:", e);
          }
        }
      }
      let eventId = smartAction.auto_added_event_id;
      let nativeRsvpHandled = false;
      if (rsvp !== 'no') {
        setStatusMessage("Checking calendar conflicts...");
        await new Promise(r => setTimeout(r, 800));

        setStatusMessage("Executing proactive sync...");
        const info = smartAction.meeting_info;
        const plan = smartAction.proactive_plan;
        
        const syncRes = await aiAPI.executeProactiveSync(email.id, info, plan, smartAction.auto_added_event_id);

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
          // Native RSVP via Calendar handles the notification. 
          // We avoid creating a new 'Re:' email thread in the inbox.
        }
      } else {
          setStatusMessage("RSVP sent via Calendar...");
          replyMessage = "[Accepted via Google Calendar]";
      }
      
      setStatusMessage("Updating AI insight...");
      await aiAPI.updateInsight(email.id, rsvp, replyMessage, eventId);

      setStatusMessage("Saving proactive summary...");
      await aiAPI.logProactiveAction({
        id: email.id,
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
        handleUpdate();
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

  const handleUpdate = () => {
    fetchEmail();
    if (onUpdate) onUpdate();
  };

  const handleDelete = (id) => {
    if (onBack) onBack();
    if (onUpdate) onUpdate();
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

  if (error || !email) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 dark:text-red-400 mb-4">{error || 'Email not found'}</p>
            <Button onClick={onBack} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Smart Action Panel */}
      { (smartLoading || smartAction) && (
        <Card className={`border-2 transition-all duration-500 bg-gradient-to-br ${
          smartAction?.meeting_detected 
            ? 'from-violet-50 to-indigo-100 dark:from-violet-900/20 dark:to-indigo-900/20 border-violet-200 dark:border-violet-800' 
            : 'from-gray-50 to-gray-100 dark:from-gray-900/40 dark:to-gray-800/40 border-gray-200 dark:border-gray-800'
        }`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${smartAction?.meeting_detected ? 'bg-violet-600' : 'bg-gray-500'}`}>
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center">
                    AI Smart Assistant
                    {smartLoading && <Loader2 className="w-3 h-3 ml-2 animate-spin opacity-50" />}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {smartLoading ? 'Analyzing meeting details...' : smartAction?.meeting_detected ? 'Meeting detected in this email' : 'Context analysis complete'}
                  </p>
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
                  className="flex items-center space-x-1 text-green-600 dark:text-green-400 text-sm font-bold bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/40" 
                  onClick={() => setShowConfirmAdd(true)}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Auto-Added. Click to RSVP</span>
                </div>
              ) : smartAction?.meeting_detected && !smartAction?.meeting_added && (
                 <Button 
                   size="sm" 
                   onClick={() => setShowConfirmAdd(true)}
                   className="bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/20"
                 >
                   <CalendarPlus className="w-4 h-4 mr-2" />
                   Add to Calendar
                 </Button>
              )}
            </div>

            {smartAction && (
              <div className="mt-4 space-y-3">
                 <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 border border-indigo-100/50 dark:border-indigo-900/30">
                    <p className="text-xs font-bold text-gray-400 mb-2 uppercase">{smartAction.rsvp_status ? 'Sent Reply' : 'AI Drafted Reply'}</p>
                    <FormattedAIResponse text={smartAction.is_meeting ? "I have accepted the meeting invitation and added it to my calendar. See you then!" : smartAction.reply_text} className="text-gray-800 dark:text-gray-200" />
                 </div>
                 
                 {smartAction.is_meeting && smartAction.meeting_info && (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                        <Clock className="w-4 h-4 text-violet-500" />
                        <span><strong>Proposed:</strong> {new Date(smartAction.meeting_info.start_time).toLocaleString()}</span>
                      </div>
                      {smartAction.meeting_info.location && (
                        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                          <MapPin className="w-4 h-4 text-violet-500" />
                          <span><strong>Location:</strong> {smartAction.meeting_info.location}</span>
                        </div>
                      )}
                   </div>
                 )}

                 {smartAction.proactive_plan?.has_conflict && (
                   <div className="flex items-center space-x-2 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 w-fit px-2 py-1 rounded border border-amber-100 dark:border-amber-800/40">
                      <AlertCircle className="w-3 h-3" />
                      <span>Conflict: {smartAction.proactive_plan.conflict_with}</span>
                   </div>
                 )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                {onBack && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onBack}
                    className="mr-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <CardTitle className="text-lg">{email.subject}</CardTitle>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <p><strong>From:</strong> {email.from_email || email.sender}</p>
                <p><strong>To:</strong> {email.to || 'Me'}</p>
                <p><strong>Date:</strong> {new Date(email.date || email.timestamp).toLocaleString()}</p>
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
                      handleAnalyzeEmail(messageId, true);
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
                  ) : (
                    <>
                      <CalendarPlus className="w-4 h-4 mr-2" />
                      Add to Calendar
                    </>
                  )}
                </Button>
              </div>
            </div>
            <EmailActions email={email} onUpdate={handleUpdate} onDelete={handleDelete} />
          </div>
        </CardHeader>
        <CardContent>
          {/* Smart Action Result */}
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
                {smartAction?.proactive_plan?.message && (
                  <div className="mt-3 p-3 bg-white/60 dark:bg-black/40 rounded-lg border border-violet-100 flex items-start space-x-3">
                    <Zap className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs font-medium text-violet-900 dark:text-violet-300 leading-relaxed">
                      {smartAction.proactive_plan.message}
                    </p>
                  </div>
                )}
                
                {smartAction?.gmail_link && (
                  <div className="mt-3">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full text-[10px] h-8 border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-400"
                      onClick={() => window.open(smartAction.gmail_link, '_blank')}
                    >
                      <ExternalLink className="w-3 h-3 mr-2" />
                      Open in Gmail for RSVP
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div 
            className="email-body dark:text-gray-100" 
            style={{ 
              whiteSpace: 'pre-wrap', 
              fontSize: '14px', 
              lineHeight: '1.4',
              fontFamily: 'sans-serif' 
            }}
          >
            {email.body || email.preview || ''}
          </div>
        </CardContent>
      </Card>

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

              {smartAction.proactive_plan?.has_conflict && (
                <div className={`p-4 rounded-lg flex items-start space-x-3 border-2 ${
                  smartAction.proactive_plan.priority_comparison === 'higher'
                    ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400'
                    : 'bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-400'
                }`}>
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold">Proactive Action Required</h4>
                    <p className="text-xs mt-1 leading-relaxed">
                      {smartAction.proactive_plan.message}
                    </p>
                  </div>
                </div>
              )}

              {addSuccess && (
                <div className="bg-green-50 dark:bg-green-900/40 p-3 rounded-lg flex items-center space-x-2 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 animate-in zoom-in-95 fill-mode-both">
                  <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">Successfully added to calendar!</span>
                </div>
              )}
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
                <p className="text-[10px] text-gray-400 font-normal">Opening Gmail for you to finish the RSVP...</p>
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
                  <div className="flex-1 flex space-x-2">
                    <Button 
                      variant="outline"
                      className="flex-1 border-violet-200"
                      onClick={() => window.open(smartAction.gmail_link, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Gmail
                    </Button>
                    <Button className="flex-[2] bg-violet-600 hover:bg-violet-700 text-white" onClick={() => handleConfirmAdd(rsvpStatus)}>
                      {rsvpStatus === 'no' ? 'Send Decline' : 'Confirm & Sync'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailDetail;
