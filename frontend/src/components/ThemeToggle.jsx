import React from 'react';
import { Switch } from './ui/switch.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <div className="flex items-center space-x-2">
      <span className="text-xs text-gray-600 dark:text-gray-300">Light</span>
      <Switch checked={isDark} onCheckedChange={toggleTheme} />
      <span className="text-xs text-gray-600 dark:text-gray-300">Dark</span>
    </div>
  );
};

export default ThemeToggle;

