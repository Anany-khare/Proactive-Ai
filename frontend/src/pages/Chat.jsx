import React, { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Send, Bot, User, Loader2, Trash2 } from 'lucide-react';
import { aiAPI } from '../utils/api.jsx';
import FormattedAIResponse from '../components/FormattedAIResponse.jsx';

const ChatPage = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Thinking…');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  
  const statusMessages = [
    'Analyzing your request…',
    'Fetching calendar context…',
    'Checking for scheduling conflicts…',
    'Resolving logistical details…',
    'Processing your data…',
    'Finalizing response…'
  ];

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await aiAPI.getChatHistory(50);
        const history = res.data.messages || [];
        if (history.length > 0) {
          setMessages(
            history.map((m) => ({
              role: m.role,
              content: m.content,
              timestamp: new Date(m.timestamp),
            }))
          );
        } else {
          // Show welcome message if no history
          setMessages([
            {
              role: 'assistant',
              content:
                "Welcome! I'm your AI assistant powered by Ollama. I can help you with custom requests, complex queries, and multi-step workflows. What would you like to do today?",
              timestamp: new Date(),
            },
          ]);
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
        setMessages([
          {
            role: 'assistant',
            content:
              "Welcome! I'm your AI assistant. What would you like to do today?",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setHistoryLoaded(true);
      }
    };
    loadHistory();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);
    setLoadingStatus(statusMessages[0]);

    // Start status cycle
    let statusIndex = 0;
    const statusInterval = setInterval(() => {
      statusIndex++;
      if (statusIndex < statusMessages.length) {
        setLoadingStatus(statusMessages[statusIndex]);
      }
    }, 2500);

    try {
      const res = await aiAPI.chat(currentInput);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.data.response,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again later.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      clearInterval(statusInterval);
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Clear all chat history? This cannot be undone.')) return;
    try {
      await aiAPI.clearChatHistory();
      setMessages([
        {
          role: 'assistant',
          content: 'Chat history cleared. How can I help you?',
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      console.error('Failed to clear chat:', err);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-4xl mx-auto">
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Chat</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Ask me anything or request complex workflows
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearHistory}
          className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <Trash2 size={14} className="mr-1" />
          Clear History
        </Button>
      </div>

      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <CardTitle>Conversation</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-0 min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {!historyLoaded ? (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <Loader2 size={20} className="animate-spin mr-2" />
                Loading chat history…
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex items-start space-x-3 ${
                    m.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      m.role === 'user'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className={`flex-1 ${m.role === 'user' ? 'text-right' : ''}`}>
                    <div
                      className={`inline-block max-w-[80%] px-4 py-3 rounded-lg ${
                        m.role === 'user'
                          ? 'bg-primary-600 text-white rounded-br-none'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-none'
                      }`}
                    >
                      <FormattedAIResponse text={m.content} />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 px-1">
                      {m.timestamp instanceof Date
                        ? m.timestamp.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </p>
                  </div>
                </div>
              ))
            )}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  <Bot size={16} />
                </div>
                <div className="inline-block px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800 rounded-bl-none">
                  <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                    <Loader2 size={14} className="animate-spin" />
                    <span>{loadingStatus}</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-gray-200 dark:border-gray-800 p-4 flex-shrink-0"
          >
            <div className="flex items-center space-x-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message or request..."
                disabled={isLoading}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <Button type="submit" className="px-4" disabled={isLoading || !input.trim()}>
                {isLoading ? (
                  <Loader2 size={18} className="mr-2 animate-spin" />
                ) : (
                  <Send size={18} className="mr-2" />
                )}
                Send
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 px-1">
              Press Enter to send, Shift+Enter for new line
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatPage;
