import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { meetingAPI } from '../utils/api.jsx';
import { Button } from './ui/button.jsx';
import { ChevronLeft, ChevronRight, Plus, Calendar, Clock, MapPin, Users } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from './ui/dialog.jsx';
import { Loader2 } from 'lucide-react';

const CalendarView = ({ view = 'week', onMeetingClick, onCreateMeeting }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newMeeting, setNewMeeting] = useState({
    title: '',
    start_datetime: '',
    end_datetime: '',
    location: '',
    description: '',
    attendees: []
  });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, [currentDate, view]);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      let response;
      if (view === 'week') {
        const weekStart = getWeekStart(currentDate).toISOString();
        response = await meetingAPI.getWeeklyEvents(weekStart);
      } else {
        const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        response = await meetingAPI.getMonthlyEvents(month);
      }
      setEvents(response.data || []);
    } catch (err) {
      console.error('Error fetching events:', err);
      setError('Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const getWeekStart = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    return new Date(d.setDate(diff));
  };

  const getWeekDays = () => {
    const start = getWeekStart(currentDate);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const getMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];

    // Add days from previous month to fill first week
    const startDay = firstDay.getDay();
    for (let i = startDay - 1; i >= 0; i--) {
      const date = new Date(firstDay);
      date.setDate(firstDay.getDate() - i - 1);
      days.push({ date, isCurrentMonth: false });
    }

    // Add days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const date = new Date(year, month, i);
      days.push({ date, isCurrentMonth: true });
    }

    // Add days from next month to fill last week
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      days.push({ date, isCurrentMonth: false });
    }

    return days;
  };

  const getEventsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return events.filter(event => event.date === dateStr);
  };

  const handleCreateMeeting = async () => {
    if (!newMeeting.title || !newMeeting.start_datetime || !newMeeting.end_datetime) {
      alert('Please fill in all required fields');
      return;
    }

    setIsCreating(true);
    try {
      const attendees = newMeeting.attendees
        ? newMeeting.attendees.split(',').map(e => e.trim()).filter(e => e)
        : [];
      
      await meetingAPI.createMeeting({
        ...newMeeting,
        attendees
      });
      
      setShowCreateDialog(false);
      setNewMeeting({
        title: '',
        start_datetime: '',
        end_datetime: '',
        location: '',
        description: '',
        attendees: []
      });
      fetchEvents();
      if (onCreateMeeting) onCreateMeeting();
    } catch (err) {
      console.error('Error creating meeting:', err);
      alert('Failed to create meeting. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const navigateDate = (direction) => {
    const newDate = new Date(currentDate);
    if (view === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    }
    setCurrentDate(newDate);
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateDate('prev')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle>
                {view === 'week'
                  ? `Week of ${getWeekStart(currentDate).toLocaleDateString()}`
                  : currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateDate('next')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(new Date())}
              >
                Today
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-primary-600 hover:bg-primary-700 text-white">
                    <Plus className="h-4 w-4 mr-2" />
                    New Meeting
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New Meeting</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Title *</label>
                      <input
                        type="text"
                        value={newMeeting.title}
                        onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        placeholder="Meeting title"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Start Date & Time *</label>
                        <input
                          type="datetime-local"
                          value={newMeeting.start_datetime}
                          onChange={(e) => setNewMeeting({ ...newMeeting, start_datetime: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">End Date & Time *</label>
                        <input
                          type="datetime-local"
                          value={newMeeting.end_datetime}
                          onChange={(e) => setNewMeeting({ ...newMeeting, end_datetime: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Location</label>
                      <input
                        type="text"
                        value={newMeeting.location}
                        onChange={(e) => setNewMeeting({ ...newMeeting, location: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        placeholder="Meeting location"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Description</label>
                      <textarea
                        value={newMeeting.description}
                        onChange={(e) => setNewMeeting({ ...newMeeting, description: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        rows={4}
                        placeholder="Meeting description"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Attendees (comma-separated emails)</label>
                      <input
                        type="text"
                        value={newMeeting.attendees}
                        onChange={(e) => setNewMeeting({ ...newMeeting, attendees: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        placeholder="email1@example.com, email2@example.com"
                      />
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => setShowCreateDialog(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreateMeeting}
                        disabled={isCreating}
                        className="bg-primary-600 hover:bg-primary-700 text-white"
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          'Create Meeting'
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-red-600 dark:text-red-400 mb-4">{error}</div>
          )}
          {view === 'week' ? (
            <WeekView days={getWeekDays()} events={events} onMeetingClick={onMeetingClick} />
          ) : (
            <MonthView days={getMonthDays()} events={events} onMeetingClick={onMeetingClick} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const WeekView = ({ days, events, onMeetingClick }) => {
  const getEventsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return (events || []).filter(event => event.date === dateStr);
  };

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day, index) => {
        const dayEvents = getEventsForDate(day);
        return (
          <div key={index} className="border border-gray-200 dark:border-gray-800 rounded-lg p-2 min-h-[200px]">
            <div className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-100">
              {day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
            </div>
            <div className="space-y-1">
              {dayEvents.map((event) => (
                <div
                  key={event.id}
                  onClick={() => onMeetingClick && onMeetingClick(event)}
                  className="p-2 bg-primary-50 dark:bg-primary-900/20 rounded text-xs cursor-pointer hover:bg-primary-100 dark:hover:bg-primary-900/30"
                >
                  <p className="font-medium truncate">{event.title}</p>
                  <p className="text-gray-600 dark:text-gray-400">{event.time}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const MonthView = ({ days, events, onMeetingClick }) => {
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  const getEventsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return (events || []).filter(event => event.date === dateStr);
  };
  
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div key={day} className="text-center font-semibold text-sm text-gray-600 dark:text-gray-400 p-2">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((dayObj, index) => {
          const dayEvents = getEventsForDate(dayObj.date);
          return (
            <div
              key={index}
              className={`border border-gray-200 dark:border-gray-800 rounded-lg p-2 min-h-[100px] ${
                !dayObj.isCurrentMonth ? 'opacity-50' : ''
              }`}
            >
              <div className={`text-sm font-medium mb-1 ${
                dayObj.date.toDateString() === new Date().toDateString()
                  ? 'text-primary-600 dark:text-primary-400 font-bold'
                  : 'text-gray-900 dark:text-gray-100'
              }`}>
                {dayObj.date.getDate()}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    onClick={() => onMeetingClick && onMeetingClick(event)}
                    className="p-1 bg-primary-50 dark:bg-primary-900/20 rounded text-xs cursor-pointer hover:bg-primary-100 dark:hover:bg-primary-900/30 truncate"
                    title={event.title}
                  >
                    {event.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarView;
