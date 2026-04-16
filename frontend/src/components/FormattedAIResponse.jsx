import React from 'react';
import { ExternalLink } from 'lucide-react';

const FormattedAIResponse = ({ text, className = "" }) => {
  if (!text) return null;

  // 1. Sanitize text: collapse all multiple newlines (even with spaces) to just single \n
  const sanitized = text.replace(/\n\s*\n+/g, '\n').trim();

  // 2. Simple split into blocks (paragraphs, but here just lines/sections)
  const lines = sanitized.split('\n');

  return (
    <div className={`space-y-1 ${className}`}>
      {lines.map((line, idx) => {
        // Detect bullet points
        const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
        const cleanLine = isBullet ? line.trim().substring(2) : line;

        // Detect URLS
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = cleanLine.split(urlRegex);

        return (
          <div key={idx} className={`flex items-start ${isBullet ? 'ml-4' : ''}`}>
            {isBullet && <span className="mr-2 text-violet-500">•</span>}
            <p className="text-sm leading-snug m-0 p-0 dark:text-gray-200 break-words flex-1">
              {parts.map((part, pIdx) => {
                if (part.match(urlRegex)) {
                  return (
                    <a
                      key={pIdx}
                      href={part}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 dark:text-violet-400 font-medium hover:underline inline-flex items-center"
                    >
                      {part}
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  );
                }
                
                // Bold text handling
                const boldRegex = /\*\*(.*?)\*\*/g;
                const boldParts = part.split(boldRegex);
                
                if (boldParts.length > 1) {
                  return boldParts.map((bp, bIdx) => 
                    bIdx % 2 === 1 ? <strong key={bIdx} className="font-bold text-gray-900 dark:text-gray-100">{bp}</strong> : bp
                  );
                }

                return part;
              })}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default FormattedAIResponse;
