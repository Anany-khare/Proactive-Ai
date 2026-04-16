import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { meetingAPI } from '../utils/api.jsx';
import { Button } from './ui/button.jsx';
import { ChevronLeft, ChevronRight, Plus, Calendar, Clock, MapPin, Users } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from './ui/dialog.jsx';
import { Loader2 } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

// Standalone helper (used in useMemo before component methods are defined)
function getWeekStartStatic(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

const CalendarView = ({ view = 'week', onMeetingClick, onCreateMeeting, onViewChange }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newMeeting, setNewMeeting] = useState({
    title: '',
    start_datetime: null,
    end_datetime: null,
    location: '',
    description: '',
    attendees: ''
  });
  const [isCreating, setIsCreating] = useState(false);

  // Build a stable query key based on view + date
  const queryKey = useMemo(() => {
    if (view === 'week') {
      const weekStart = getWeekStartStatic(currentDate).toISOString();
      return ['calendar-events', 'week', weekStart];
    } else if (view === 'month') {
      const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      return ['calendar-events', 'month', month];
    } else {
      const dayStr = currentDate.toISOString().split('T')[0];
      return ['calendar-events', 'day', dayStr];
    }
  }, [view, currentDate]);

  const { data: events = [], isLoading: loading, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      let response;
      if (view === 'week') {
        const weekStart = getWeekStartStatic(currentDate).toISOString();
        response = await meetingAPI.getWeeklyEvents(weekStart);
      } else if (view === 'month') {
        const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        response = await meetingAPI.getMonthlyEvents(month);
      } else if (view === 'day') {
        const start = new Date(currentDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(currentDate);
        end.setHours(23, 59, 59, 999);
        response = await meetingAPI.getEventsByRange(start.toISOString(), end.toISOString());
      }
      return response.data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData, // Show old data while new data loads
    retry: 1,
  });

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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
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
        start_datetime: newMeeting.start_datetime.toISOString(),
        end_datetime: newMeeting.end_datetime.toISOString(),
        attendees
      });

      setShowCreateDialog(false);
      setNewMeeting({
        title: '',
        start_datetime: null,
        end_datetime: null,
        location: '',
        description: '',
        attendees: ''
      });
      refetch();
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
    } else if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    } else if (view === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    }
    setCurrentDate(newDate);
  };

  const today = () => setCurrentDate(new Date());

  if (loading && events.length === 0) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-7 gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-48 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
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
                <DialogContent className="max-w-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl rounded-2xl p-6 sm:p-8">
                  <DialogHeader className="mb-4">
                    <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-white">Schedule Meeting</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Title <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={newMeeting.title}
                        onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                        className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all shadow-sm"
                        placeholder="e.g. Product Sync"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div className="bg-gray-50/50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                        <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Start Date & Time <span className="text-red-500">*</span></label>
                        <DatePicker
                          selected={newMeeting.start_datetime}
                          onChange={(date) => setNewMeeting({...newMeeting, start_datetime: date})}
                          showTimeSelect
                          timeIntervals={15}
                          dateFormat="MMMM d, yyyy h:mm aa"
                          minDate={new Date()}
                          className="w-full px-0 bg-transparent border-none text-gray-900 dark:text-gray-100 font-semibold focus:ring-0 text-sm"
                          placeholderText="Select start time"
                        />
                      </div>
                      <div className="bg-gray-50/50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                        <label className="block text-xs font-bold uppercase text-gray-400 mb-2">End Date & Time <span className="text-red-500">*</span></label>
                        <DatePicker
                          selected={newMeeting.end_datetime}
                          onChange={(date) => setNewMeeting({...newMeeting, end_datetime: date})}
                          showTimeSelect
                          timeIntervals={15}
                          dateFormat="MMMM d, yyyy h:mm aa"
                          minDate={newMeeting.start_datetime || new Date()}
                          className="w-full px-0 bg-transparent border-none text-gray-900 dark:text-gray-100 font-semibold focus:ring-0 text-sm"
                          placeholderText="Select end time"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Location</label>
                      <input
                        type="text"
                        value={newMeeting.location}
                        onChange={(e) => setNewMeeting({ ...newMeeting, location: e.target.value })}
                        className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all shadow-sm"
                        placeholder="Google Meet or Conference Room"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Description</label>
                      <textarea
                        value={newMeeting.description}
                        onChange={(e) => setNewMeeting({ ...newMeeting, description: e.target.value })}
                        className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all shadow-sm resize-none"
                        rows={3}
                        placeholder="Agenda or context for the meeting..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Attendees</label>
                      <input
                        type="text"
                        value={newMeeting.attendees}
                        onChange={(e) => setNewMeeting({ ...newMeeting, attendees: e.target.value })}
                        className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all shadow-sm"
                        placeholder="Separated by commas (e.g. john@company.com)"
                      />
                    </div>
                    <div className="flex justify-end space-x-3 pt-3">
                      <Button
                        variant="outline"
                        onClick={() => setShowCreateDialog(false)}
                        className="px-6 rounded-xl font-medium"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreateMeeting}
                        disabled={isCreating}
                        className="px-6 rounded-xl font-medium bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 text-white shadow-md border-0"
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          'Schedule Meeting'
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
          {view === 'week' && <WeekView days={getWeekDays()} events={events} onMeetingClick={onMeetingClick} onViewChange={onViewChange} onDateChange={setCurrentDate} />}
          {view === 'month' && <MonthView days={getMonthDays()} events={events} onMeetingClick={onMeetingClick} />}
          {view === 'day' && <DayView date={currentDate} events={events} onMeetingClick={onMeetingClick} />}
        </CardContent>
      </Card>
    </div>
  );
};

const WeekView = ({ days, events, onMeetingClick, onViewChange, onDateChange }) => {
  const getEventsForDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    return (events || []).filter(event => event.date === dateStr);
  };

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day, index) => {
        const dayEvents = getEventsForDate(day);
        const isToday = day.toDateString() === new Date().toDateString();
        const displayEvents = dayEvents.slice(0, 2);
        const remainingEvents = dayEvents.length - 2;

        return (
          <div
            key={index}
            className={`border rounded-lg p-2 min-h-[200px] ${isToday
              ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-500 dark:border-blue-400 shadow-sm'
              : 'border-gray-200 dark:border-gray-800'
              }`}
          >
            <div className={`font-semibold text-sm mb-2 flex justify-between items-center ${isToday ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'
              }`}>
              <span>
                {day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                {isToday && <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-400">(Today)</span>}
              </span>
            </div>
            <div className="space-y-1">
              {displayEvents.map((event) => (
                <div
                  key={event.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMeetingClick && onMeetingClick(event);
                  }}
                  className="p-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded text-xs cursor-pointer hover:border-primary-500 transition-colors shadow-sm"
                >
                  <p className="font-medium truncate text-gray-900 dark:text-gray-100">{event.title}</p>
                  <p className="text-gray-500 dark:text-gray-400">{event.time}</p>
                </div>
              ))}
              {remainingEvents > 0 && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onDateChange && onDateChange(day);
                    onViewChange && onViewChange('day');
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer font-medium p-1"
                >
                  +{remainingEvents} more
                </div>
              )}
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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
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
          const isToday = dayObj.date.toDateString() === new Date().toDateString();

          return (
            <div
              key={index}
              className={`border rounded-lg p-2 min-h-[100px] ${!dayObj.isCurrentMonth ? 'opacity-50' : ''
                } ${isToday
                  ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-500 dark:border-blue-400 shadow-sm'
                  : 'border-gray-200 dark:border-gray-800'
                }`}
            >
              <div className={`text-sm font-medium mb-1 flex justify-between items-center ${isToday
                ? 'text-blue-700 dark:text-blue-300 font-bold'
                : 'text-gray-900 dark:text-gray-100'
                }`}>
                <span>{dayObj.date.getDate()}</span>
                {isToday && <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">Today</span>}
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

const DayView = ({ date, events, onMeetingClick }) => {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const dayEvents = (events || []).filter(event => event.date === dateStr);

  const isToday = date.toDateString() === new Date().toDateString();

  return (
    <div className="flex flex-col h-full border rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className={`p-4 text-center border-b border-gray-200 dark:border-gray-800 ${isToday ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
        }`}>
        <h2 className={`text-2xl font-bold ${isToday ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </h2>
        {isToday && <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Today</span>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {dayEvents.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-10">
            No meetings scheduled for this day
          </div>
        ) : (
          dayEvents.map((event) => (
            <div
              key={event.id}
              onClick={() => onMeetingClick && onMeetingClick(event)}
              className="flex items-start p-4 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 hover:border-primary-500 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="w-24 text-sm font-semibold text-gray-500 dark:text-gray-400 shrink-0">
                {event.time}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg mb-1">{event.title}</h3>
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 space-x-3">
                  {event.duration && <span>{event.duration}</span>}
                  {event.location && (
                    <span className="flex items-center">
                      <span className="w-1 h-1 bg-gray-400 rounded-full mr-2"></span>
                      {event.location}
                    </span>
                  )}
                </div>
                {event.description && <p className="text-sm text-gray-500 mt-2 line-clamp-2">{event.description}</p>}
                {event.attendees && event.attendees.length > 0 && (
                  <div className="mt-2 text-xs text-gray-400">
                    {event.attendees.length} attendees
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CalendarView;
