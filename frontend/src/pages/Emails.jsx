import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { useEmails } from '../hooks/useEmails.jsx'; // Import the new hook
import { emailAPI } from '../utils/api.jsx';
import EmailDetail from '../components/EmailDetail.jsx';
import EmailThread from '../components/EmailThread.jsx';
import EmailActions from '../components/EmailActions.jsx';
import { Mail, MessageSquare, Loader2, Search, Calendar, AlertCircle, Filter } from 'lucide-react';
import { Button } from '../components/ui/button.jsx';
import { useSearchParams, useParams, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query'; // Import query client
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates.jsx'; // Import real-time hook

const Emails = () => {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // State for view management
  const queryClient = useQueryClient();
  const [selectedEmailId, setSelectedEmailId] = useState(id || searchParams.get('id') || null);
  const prevEmailId = React.useRef(selectedEmailId); // Track previous ID for navigation detection
  const [selectedThreadId, setSelectedThreadId] = useState(searchParams.get('thread') || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState(id ? 'detail' : selectedThreadId ? 'thread' : 'list');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'meetings' | 'important'

  // Use the custom hook for fetching data with caching
  // We pass searchQuery to the hook so it automatically refetches when query changes
  const { emails, isLoading, error, refetch, deleteEmail, hasNextPage, fetchNextPage, isFetchingNextPage } = useEmails(searchQuery);

  // Meeting keyword detection
  const MEETING_KEYWORDS = /\b(invite|meeting|calendar|agenda|scheduled|rsvp|conference|zoom|teams|google meet)\b/i;
  const isMeetingEmail = (email) => {
    const text = `${email.subject || ''} ${email.preview || ''}`;
    return MEETING_KEYWORDS.test(text);
  };

  const filteredEmails = useMemo(() => {
    if (activeFilter === 'meetings') return emails.filter(isMeetingEmail);
    if (activeFilter === 'important') return emails.filter(e => e.priority === 'high');
    return emails;
  }, [emails, activeFilter]);

  // Real-time updates integration
  const handleRealtimeEmailUpdate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['emails'] });
    // Also context
    queryClient.invalidateQueries({ queryKey: ['dashboard-contextual'] });
  }, [queryClient]);

  useRealtimeUpdates(handleRealtimeEmailUpdate); // Listen for updates

  // Sync URL params with state
  useEffect(() => {
    if (selectedEmailId) {
      setView('detail');
      setSelectedThreadId(null);
    } else if (selectedThreadId) {
      setView('thread');
      setSelectedEmailId(null);
    } else {
      setView('list');
    }
  }, [selectedEmailId, selectedThreadId]);

  // Handle URL updates or external navigation
  useEffect(() => {
    const paramId = searchParams.get('id');
    const paramThread = searchParams.get('thread');

    if (paramId && paramId !== selectedEmailId) {
      setSelectedEmailId(paramId);
    } else if (!paramId && selectedEmailId && view === 'detail') {
      // If URL param removed but state has ID, clear it (back button support)
      setSelectedEmailId(null);
    }

    if (paramThread && paramThread !== selectedThreadId) {
      setSelectedThreadId(paramThread);
    } else if (!paramThread && selectedThreadId && view === 'thread') {
      setSelectedThreadId(null);
    }
  }, [searchParams, selectedEmailId, selectedThreadId, view]);

  // Detect return to list view (from email detail) to refresh data
  useEffect(() => {
    // If we were viewing an email (prevEmailId.current was set)
    // and now we are not (selectedEmailId is null)
    if (prevEmailId.current && !selectedEmailId) {
      console.log("Returned to list view, refreshing emails...");
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-contextual'] });
    }
    prevEmailId.current = selectedEmailId;
  }, [selectedEmailId, queryClient]);


  const handleEmailClick = (emailId, threadId = null) => {
    // Optimistic Update: Mark email as read immediately in checking cache
    const queryKey = ['emails', searchQuery, 20];
    queryClient.setQueryData(queryKey, (oldData) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map(page => ({
          ...page,
          items: page.items.map(item =>
            item.id === emailId ? { ...item, unread: false } : item
          )
        }))
      };
    });

    // REMOVED: queryClient.invalidateQueries({ queryKey: ['emails'] }); 
    // We rely on the optimistic update while viewing the email.
    // The actual refetch happens in verify/handleBack when the DB update is guaranteed.

    if (threadId) {
      setSelectedThreadId(threadId);
      setSearchParams({ thread: threadId });
    } else {
      setSelectedEmailId(emailId);
      setSearchParams({ id: emailId });
    }
  };

  const handleBack = () => {
    setSelectedEmailId(null);
    setSelectedThreadId(null);
    setView('list');
    setSearchParams({});

    // Invalidate queries to ensure read status is updated
    queryClient.invalidateQueries({ queryKey: ['emails'] });
    // Also invalidate dashboard summary if needed
    queryClient.invalidateQueries({ queryKey: ['dashboard-contextual'] });
  };

  const handleUpdate = () => {
    refetch(); // Use refetch from hook
  };

  const handleDelete = (emailId) => {
    // Optimistic update is tricky without mutation hook fully integrated for UI,
    // but the hook provides deleteEmail which invalidates queries.
    // For now, let's just trigger the delete and let 'onSuccess' reload the list.
    deleteEmail(emailId);

    // For immediate UI feedback if we wanted, we'd need to manipulate cache directly, 
    // but invalidation (handled in hook) + refetch is safer for consistency.

    if (selectedEmailId === emailId) {
      handleBack();
    }
  };

  // Debounced search could be added here, but for now we rely on the state update triggering the hook
  const handleSearch = () => {
    refetch();
  }

  if (isLoading && emails.length === 0) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-48 animate-pulse"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-gray-200 dark:border-gray-800 rounded-lg animate-pulse border border-transparent"></div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'detail' && selectedEmailId) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Email</h1>
        </div>
        <EmailDetail messageId={selectedEmailId} onBack={handleBack} onUpdate={handleUpdate} />
      </div>
    );
  }

  if (view === 'thread' && selectedThreadId) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Email Thread</h1>
        </div>
        <EmailThread threadId={selectedThreadId} onBack={handleBack} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Emails</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Manage your emails</p>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <Search className="h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search emails..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <Button
              onClick={handleSearch}
              variant="outline"
              size="sm"
            >
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {[
          { key: 'all', label: 'All', icon: <Mail className="w-4 h-4" /> },
          { key: 'meetings', label: 'Meeting Invites', icon: <Calendar className="w-4 h-4" /> },
          { key: 'important', label: 'Important', icon: <AlertCircle className="w-4 h-4" /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeFilter === tab.key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.key === 'meetings' && (
              <span className="text-xs ml-1 opacity-60">({emails.filter(isMeetingEmail).length})</span>
            )}
            {tab.key === 'important' && (
              <span className="text-xs ml-1 opacity-60">({emails.filter(e => e.priority === 'high').length})</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
          {error}
        </div>
      )}

      {/* Email List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Mail className="w-5 h-5" />
            <span>{activeFilter === 'all' ? 'All Emails' : activeFilter === 'meetings' ? 'Meeting Invites' : 'Important Emails'} ({filteredEmails.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredEmails.map((email) => (
              <div
                key={email.id}
                className="p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => handleEmailClick(email.id, email.thread_id)}
                  >
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {email.from_email || 'Unknown'}
                      </span>
                      {email.unread && (
                        <span className="w-2 h-2 bg-primary-500 rounded-full"></span>
                      )}
                      {email.thread_id && (
                        <MessageSquare className="w-4 h-4 text-gray-400" title="Part of thread" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                      {email.subject}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                      {email.preview}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      {email.time}
                    </p>
                  </div>
                  <div className="ml-4 flex flex-col items-end space-y-2">
                    <EmailActions
                      email={email}
                      onUpdate={handleUpdate}
                      onDelete={() => handleDelete(email.id)}
                    />
                    {email.gmail_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(email.gmail_url, '_blank')}
                        className="text-gray-500 hover:text-primary-600 border-gray-200 dark:border-gray-700 h-8"
                        title="Open in Gmail"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    {email.thread_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEmailClick(email.id, email.thread_id)}
                        title="View thread"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Load More Button */}
            {hasNextPage && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading more...
                    </>
                  ) : (
                    'Load More Emails'
                  )}
                </Button>
              </div>
            )}

            {emails.length === 0 && !isLoading && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No emails found
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Emails;
