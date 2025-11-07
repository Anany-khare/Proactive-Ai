import { useEffect, useState } from 'react';
import { dashboardAPI } from '../utils/api.jsx';

// Hook for fetching contextual dashboard data
// This fetches real data from the backend API
export function useContextualData() {
  const [data, setData] = useState({
    dailyBrief: null,
    emails: [],
    meetings: [],
    todos: [],
    notifications: [],
    suggestions: [],
    isLoading: true,
    error: null,
  });

  const fetchContextualData = async () => {
    try {
      setData(prev => ({ ...prev, isLoading: true, error: null }));
      const response = await dashboardAPI.getContextualData();
      setData({
        dailyBrief: response.data.dailyBrief,
        emails: response.data.emails || [],
        meetings: response.data.meetings || [],
        todos: response.data.todos || [],
        notifications: response.data.notifications || [],
        suggestions: response.data.suggestions || [],
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error fetching contextual data:', error);
      setData(prev => ({
        ...prev,
        isLoading: false,
        error: error.response?.data?.detail || error.message || 'Failed to fetch data',
      }));
    }
  };

  useEffect(() => {
    fetchContextualData();
    
    // Set up polling to refresh data periodically (every 5 minutes)
    const interval = setInterval(fetchContextualData, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  return {
    ...data,
    refetch: fetchContextualData, // Allow manual refresh
  };
}

