import React, { useState } from 'react';
import CalendarView from '../components/CalendarView.jsx';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.jsx';
import { Button } from '../components/ui/button.jsx';
import { Calendar, Clock, MapPin, Users, Edit, Trash2 } from 'lucide-react';
import { meetingAPI } from '../utils/api.jsx';
import { useNavigate } from 'react-router-dom';

const Meetings = () => {
  const [view, setView] = useState('week'); // 'week' or 'month'
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [showMeetingDialog, setShowMeetingDialog] = useState(false);
  const navigate = useNavigate();

  const handleMeetingClick = (meeting) => {
    setSelectedMeeting(meeting);
    setShowMeetingDialog(true);
  };

  const handleEditMeeting = () => {
    // Navigate to edit page or open edit dialog
    if (selectedMeeting) {
      // You can implement edit functionality here
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
      // Refresh calendar view
      window.location.reload();
    } catch (error) {
      console.error('Error deleting meeting:', error);
      alert('Failed to delete meeting. Please try again.');
    }
  };

  const handleCreateMeeting = () => {
    // Refresh calendar after creating meeting
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

      <CalendarView
        view={view}
        onMeetingClick={handleMeetingClick}
        onCreateMeeting={handleCreateMeeting}
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
              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handleEditMeeting}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDeleteMeeting}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Meetings;

