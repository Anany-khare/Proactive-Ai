import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { emailAPI } from '../utils/api.jsx';
import EmailActions from './EmailActions.jsx';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button.jsx';

const EmailDetail = ({ messageId, onBack, onUpdate }) => {
  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      setEmail(response.data);
    } catch (err) {
      console.error('Error fetching email:', err);
      setError('Failed to load email');
    } finally {
      setLoading(false);
    }
  };

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
              <p><strong>From:</strong> {email.from_email}</p>
              <p><strong>To:</strong> {email.to}</p>
              <p><strong>Date:</strong> {new Date(email.date).toLocaleString()}</p>
            </div>
          </div>
          <EmailActions email={email} onUpdate={handleUpdate} onDelete={handleDelete} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="prose dark:prose-invert max-w-none">
          <div
            className="email-body whitespace-pre-wrap text-gray-900 dark:text-gray-100"
            dangerouslySetInnerHTML={{ __html: email.body.replace(/\n/g, '<br>') }}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default EmailDetail;
