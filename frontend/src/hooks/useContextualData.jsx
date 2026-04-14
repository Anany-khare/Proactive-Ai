import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardAPI } from '../utils/api.jsx';

// Hook for fetching contextual dashboard data
// This fetches real data from the backend API
export function useContextualData() {
  const queryClient = useQueryClient();

  const defaultData = {
    dailyBrief: null,
    emails: [],
    meetings: [],
    todos: [],
    notifications: [],
    suggestions: [],
    health: null,
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-contextual'],
    queryFn: async () => {
      try {
        const response = await dashboardAPI.getContextualData();
        return {
          dailyBrief: response.data.dailyBrief,
          emails: response.data.emails || [],
          meetings: response.data.meetings || [],
          todos: response.data.todos || [],
          notifications: response.data.notifications || [],
          suggestions: response.data.suggestions || [],
          health: response.data.health || null,
        };
      } catch (error) {
        throw error;
      }
    },
    // Data remains fresh for 5 minutes (instant page switching)
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });


  return {
    ...(data || defaultData),
    isLoading,
    error: error?.response?.data?.detail || error?.message || null,
    refetch,
  };
}

