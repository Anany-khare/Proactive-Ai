import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardAPI } from '../utils/api.jsx';

// Hook for fetching contextual dashboard data
// This fetches real data from the backend API
export function useContextualData() {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-contextual'],
    queryFn: async () => {
      console.log('Fetching dashboard context...');
      try {
        const response = await dashboardAPI.getContextualData();
        console.log('Dashboard context fetched:', response.data);
        return {
          dailyBrief: response.data.dailyBrief,
          emails: response.data.emails || [],
          meetings: response.data.meetings || [],
          todos: response.data.todos || [],
          notifications: response.data.notifications || [],
          suggestions: response.data.suggestions || [],
        };
      } catch (error) {
        console.error('Error fetching dashboard context:', error);
        throw error;
      }
    },
    // Use staleTime from global config (5 minutes) or override here
    staleTime: 5 * 60 * 1000,
    // Data remains in cache/memory
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });

  // Default empty state to prevent null crashes while loading
  const defaultData = {
    dailyBrief: null,
    emails: [],
    meetings: [],
    todos: [],
    notifications: [],
    suggestions: [],
  };

  return {
    ...(data || defaultData),
    isLoading,
    error: error?.response?.data?.detail || error?.message || null,
    refetch,
  };
}

