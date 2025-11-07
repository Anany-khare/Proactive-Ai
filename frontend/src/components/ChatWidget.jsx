import React from 'react';
import { Link } from 'react-router-dom';

const ChatWidget = () => {
  return (
    <Link
      to="/chat"
      className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary-600 hover:bg-primary-700 shadow-lg text-white text-xl flex items-center justify-center"
      aria-label="Open chat page"
    >
      💬
    </Link>
  );
};

export default ChatWidget;

