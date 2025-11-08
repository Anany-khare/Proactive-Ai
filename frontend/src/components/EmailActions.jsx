import React, { useState } from 'react';
import { Reply, Forward, Trash2, Mail, MailOpen, Loader2 } from 'lucide-react';
import { emailAPI } from '../utils/api.jsx';
import { Button } from './ui/button.jsx';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from './ui/dialog.jsx';

const EmailActions = ({ email, onUpdate, onDelete }) => {
  const [isReplying, setIsReplying] = useState(false);
  const [isForwarding, setIsForwarding] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [forwardText, setForwardText] = useState('');
  const [forwardEmails, setForwardEmails] = useState('');

  const handleReply = async () => {
    if (!replyText.trim()) return;
    
    setIsReplying(true);
    try {
      await emailAPI.replyToEmail(email.id, replyText);
      setReplyText('');
      setIsReplying(false);
      if (onUpdate) onUpdate();
      alert('Reply sent successfully!');
    } catch (error) {
      console.error('Error replying to email:', error);
      alert('Failed to send reply. Please try again.');
      setIsReplying(false);
    }
  };

  const handleForward = async () => {
    if (!forwardEmails.trim()) {
      alert('Please enter at least one email address');
      return;
    }
    
    setIsForwarding(true);
    try {
      const emails = forwardEmails.split(',').map(e => e.trim()).filter(e => e);
      await emailAPI.forwardEmail(email.id, emails, forwardText);
      setForwardText('');
      setForwardEmails('');
      setIsForwarding(false);
      if (onUpdate) onUpdate();
      alert('Email forwarded successfully!');
    } catch (error) {
      console.error('Error forwarding email:', error);
      alert('Failed to forward email. Please try again.');
      setIsForwarding(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this email?')) return;
    
    setIsDeleting(true);
    try {
      await emailAPI.deleteEmail(email.id);
      if (onDelete) onDelete(email.id);
      alert('Email deleted successfully!');
    } catch (error) {
      console.error('Error deleting email:', error);
      alert('Failed to delete email. Please try again.');
      setIsDeleting(false);
    }
  };

  const handleMarkRead = async () => {
    setIsMarking(true);
    try {
      await emailAPI.markEmailRead(email.id, !email.unread);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error marking email:', error);
      alert('Failed to update email status. Please try again.');
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      {/* Reply Dialog */}
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Reply"
          >
            <Reply className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reply to Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">To: {email.from_email}</label>
              <label className="block text-sm font-medium mb-2">Subject: {email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`}</label>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Your Reply</label>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                rows={6}
                placeholder="Type your reply..."
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                onClick={handleReply}
                disabled={isReplying || !replyText.trim()}
                className="bg-primary-600 hover:bg-primary-700 text-white"
              >
                {isReplying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Reply'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Forward Dialog */}
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Forward"
          >
            <Forward className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forward Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">To (comma-separated)</label>
              <input
                type="text"
                value={forwardEmails}
                onChange={(e) => setForwardEmails(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="email1@example.com, email2@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Message (optional)</label>
              <textarea
                value={forwardText}
                onChange={(e) => setForwardText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                rows={4}
                placeholder="Add a message..."
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                onClick={handleForward}
                disabled={isForwarding || !forwardEmails.trim()}
                className="bg-primary-600 hover:bg-primary-700 text-white"
              >
                {isForwarding ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Forwarding...
                  </>
                ) : (
                  'Forward'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark as Read/Unread */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={handleMarkRead}
        disabled={isMarking}
        title={email.unread ? "Mark as read" : "Mark as unread"}
      >
        {isMarking ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : email.unread ? (
          <MailOpen className="h-4 w-4" />
        ) : (
          <Mail className="h-4 w-4" />
        )}
      </Button>

      {/* Delete */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
        onClick={handleDelete}
        disabled={isDeleting}
        title="Delete"
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
};

export default EmailActions;
