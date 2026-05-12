import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'theme-preference';

const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });

export const ThemeProvider = ({ children }) => {
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    document.documentElement.classList.add('dark');
  }, []);

  const value = useMemo(() => ({ theme: 'dark', toggleTheme: () => {} }), []);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);

