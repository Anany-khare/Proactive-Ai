import React, { useState, useRef, useEffect } from 'react';
import { Bot, User, Loader2, Archive, Share, Zap, ArrowUp, ChevronDown, Activity, FileText } from 'lucide-react';
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
          setMessages([
            {
              role: 'assistant',
              content:
                "I have audited your current project dependencies and timeline. How can I optimize your workflow today?",
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
              "Welcome! I'm Orin. How can I assist with your focus and scheduling today?",
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
    e?.preventDefault();
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
          content: 'Sorry, I encountered an issue while processing your request.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      clearInterval(statusInterval);
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Archive all chat history? This cannot be undone.')) return;
    try {
      await aiAPI.clearChatHistory();
      setMessages([
        {
          role: 'assistant',
          content: 'Context archived. I am ready for a new task.',
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      console.error('Failed to clear chat:', err);
    }
  };

  const suggestions = [
    { title: 'Deep Focus', desc: 'Reschedule Q3 Review', icon: <Activity size={14} className="text-blue-400" />, color: 'border-blue-500/30' },
    { title: 'Draft Workflow', desc: 'Create API Mock', icon: <Zap size={14} className="text-amber-400" />, color: 'border-amber-500/30' },
    { title: 'Reference Docs', desc: 'Structural Analysis', icon: <FileText size={14} className="text-slate-400" />, color: 'border-white/10' },
  ];

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto px-4 py-2 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
          <h1 className="text-2xl font-medium text-gray-100 tracking-tight">AI Dialogue</h1>
        </div>
        <div className="flex gap-4">
          <button onClick={handleClearHistory} className="flex items-center gap-2 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors">
            <Archive size={14} /> Archive
          </button>
          <button className="flex items-center gap-2 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors">
            <Share size={14} /> Export
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto space-y-8 pb-6 px-2">
        {!historyLoaded ? (
          <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
            <Loader2 size={16} className="animate-spin mr-3 text-blue-500" />
            Synchronizing context…
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              
              {m.role === 'user' ? (
                <div className="flex flex-col items-end max-w-[75%]">
                  <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-2">
                    <span>
                      {m.timestamp instanceof Date ? m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                    <User size={12} />
                  </div>
                  <div className="bg-[#282a31] text-gray-200 px-5 py-4 rounded-2xl rounded-tr-sm text-[15px] leading-relaxed border border-white/5 shadow-lg">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-start max-w-[85%] mt-4">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-blue-500 tracking-widest uppercase mb-3">
                    <Bot size={14} />
                    <span>Orin Intelligence • Analyzing Request</span>
                  </div>
                  <div className="text-gray-200 text-[15px] leading-relaxed w-full">
                    <FormattedAIResponse text={m.content} />
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex flex-col items-start max-w-[85%] mt-4">
            <div className="flex items-center gap-2 text-[10px] font-bold text-blue-500 tracking-widest uppercase mb-3">
              <Bot size={14} />
              <span>Orin Intelligence • Processing</span>
            </div>
            
            {/* Thought Process Mock Accordion */}
            <div className="w-full max-w-lg mt-2 border border-white/10 bg-white/5 rounded-xl p-4">
              <div className="flex justify-between items-center text-sm font-medium text-gray-300">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-blue-400" />
                  Thought Process
                </div>
                <ChevronDown size={14} className="text-gray-500" />
              </div>
              <div className="mt-4 space-y-2 text-xs text-gray-400 pl-6 border-l border-white/10 ml-2">
                <p className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-gray-500"></span> {loadingStatus}
                </p>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Input Area */}
      <div className="mt-auto pt-4 flex-shrink-0">
        {/* Suggestions Row */}
        {!isLoading && messages.length < 3 && (
          <div className="flex gap-4 mb-4 overflow-x-auto scrollbar-hide pb-2">
            {suggestions.map((s, idx) => (
              <button key={idx} onClick={() => setInput(s.desc)} className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-[#1d1f26]/80 backdrop-blur-md rounded-xl border ${s.color} hover:bg-[#282a31] transition-all text-left min-w-[200px]`}>
                <div className="p-2 rounded-full bg-white/5">
                  {s.icon}
                </div>
                <div>
                  <p className="text-[11px] font-medium text-gray-300">{s.title}</p>
                  <p className="text-xs text-gray-500">{s.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <form onSubmit={handleSubmit} className="relative flex items-center w-full bg-[#1d1f26] border border-white/10 rounded-full shadow-2xl p-2 transition-colors focus-within:border-blue-500/50">
          <div className="pl-4 pr-2 text-gray-500">
            <Zap size={18} />
          </div>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Orin to optimize, draft, or analyze..."
            disabled={isLoading}
            className="flex-1 bg-transparent border-none text-sm text-gray-200 placeholder-gray-500 focus:ring-0 focus:outline-none disabled:opacity-50 py-3"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <button 
            type="submit" 
            disabled={isLoading || !input.trim()}
            className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-white transition-colors disabled:opacity-50 disabled:bg-gray-700 mx-1 flex-shrink-0 shadow-[0_0_15px_rgba(37,99,235,0.4)]"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
          </button>
        </form>

        <div className="text-center mt-4 mb-2">
          <span className="text-[9px] font-bold tracking-[0.15em] text-gray-500 uppercase">
            Orin 2.4 Active • Encrypted Context
          </span>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
