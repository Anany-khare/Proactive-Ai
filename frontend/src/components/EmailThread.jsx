import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { emailAPI } from '../utils/api.jsx';
import EmailActions from './EmailActions.jsx';
import { Loader2, MessageSquare } from 'lucide-react';
import { Button } from './ui/button.jsx';

const EmailThread = ({ threadId, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);

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
                {messages.map((message, index) => (
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
                <div
                  className="prose dark:prose-invert max-w-none whitespace-pre-wrap text-gray-900 dark:text-gray-100"
                  dangerouslySetInnerHTML={{ __html: selectedMessage.body.replace(/\n/g, '<br>') }}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailThread;
