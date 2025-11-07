import React, { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Send, Bot, User } from 'lucide-react';

const ChatPage = () => {
  const [messages, setMessages] = useState([
    { 
      role: 'assistant', 
      content: 'Welcome! I\'m your AI assistant. I can help you with custom requests, complex queries, and multi-step workflows. What would you like to do today?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    
    // Simulate AI response (in production, this would call your API)
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I understand your request. This is a placeholder response. In production, this would connect to your AI backend for intelligent responses.',
        timestamp: new Date()
      }]);
    }, 500);
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Chat</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Ask me anything or request complex workflows
        </p>
      </div>
      
      <Card className="flex-1 flex flex-col">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <CardTitle>Conversation</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex items-start space-x-3 ${
                  m.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                }`}
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  m.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}>
                  {m.role === 'user' ? (
                    <User size={16} />
                  ) : (
                    <Bot size={16} />
                  )}
                </div>
                <div className={`flex-1 ${
                  m.role === 'user' ? 'text-right' : ''
                }`}>
                  <div className={`inline-block max-w-[80%] px-4 py-3 rounded-lg ${
                    m.role === 'user'
                      ? 'bg-primary-600 text-white rounded-br-none'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-none'
                  }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 px-1">
                    {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          
          <form
            onSubmit={handleSubmit}
            className="border-t border-gray-200 dark:border-gray-800 p-4"
          >
            <div className="flex items-center space-x-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message or request..."
                className="flex-1 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <Button type="submit" className="px-4">
                <Send size={18} className="mr-2" />
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

