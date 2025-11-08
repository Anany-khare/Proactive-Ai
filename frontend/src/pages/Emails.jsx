import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { emailAPI } from '../utils/api.jsx';
import EmailDetail from '../components/EmailDetail.jsx';
import EmailThread from '../components/EmailThread.jsx';
import EmailActions from '../components/EmailActions.jsx';
import { Mail, MessageSquare, Loader2, Search } from 'lucide-react';
import { Button } from '../components/ui/button.jsx';
import { useSearchParams, useParams } from 'react-router-dom';

const Emails = () => {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEmailId, setSelectedEmailId] = useState(id || searchParams.get('id') || null);
  const [selectedThreadId, setSelectedThreadId] = useState(searchParams.get('thread') || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState(id ? 'detail' : selectedThreadId ? 'thread' : 'list');

  useEffect(() => {
    fetchEmails();
  }, [searchQuery]);

  useEffect(() => {
    if (selectedEmailId) {
      setView('detail');
      setSelectedThreadId(null);
    } else if (selectedThreadId) {
      setView('thread');
      setSelectedEmailId(null);
    }
  }, [selectedEmailId, selectedThreadId]);

  const fetchEmails = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await emailAPI.getAllEmails(searchQuery, 50);
      setEmails(response.data || []);
    } catch (err) {
      console.error('Error fetching emails:', err);
      setError('Failed to load emails');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailClick = (emailId, threadId = null) => {
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
    fetchEmails();
  };

  const handleUpdate = () => {
    fetchEmails();
  };

  const handleDelete = (emailId) => {
    setEmails(emails.filter(e => e.id !== emailId));
    if (selectedEmailId === emailId) {
      handleBack();
    }
  };

  if (loading && emails.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
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
              onClick={fetchEmails}
              variant="outline"
              size="sm"
            >
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

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
            <span>All Emails ({emails.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {emails.map((email) => (
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
                  <div className="ml-4">
                    <EmailActions
                      email={email}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                    />
                    {email.thread_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEmailClick(email.id, email.thread_id)}
                        className="mt-2"
                        title="View thread"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {emails.length === 0 && !loading && (
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
