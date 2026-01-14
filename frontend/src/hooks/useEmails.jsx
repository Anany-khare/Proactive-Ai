import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { emailAPI } from '../utils/api.jsx';

// Hook for fetching and managing emails with caching and infinite scroll
export function useEmails(searchQuery = '', maxResults = 20, enabled = true) {
    const queryClient = useQueryClient();
    const queryKey = ['emails', searchQuery, maxResults];

    const {
        data,
        isLoading,
        error,
        refetch,
        isFetching,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage,
    } = useInfiniteQuery({
        queryKey: queryKey,
        queryFn: async ({ pageParam = null }) => {
            console.log('Fetching emails page...', pageParam);
            try {
                const response = await emailAPI.getAllEmails(searchQuery, maxResults, pageParam);
                // Backend now returns { items: [], next_page_token: "..." }
                return response.data;
            } catch (error) {
                console.error('Error fetching emails:', error);
                throw error;
            }
        },
        getNextPageParam: (lastPage) => lastPage.next_page_token || undefined,
        // Keep data fresh for 5 minutes
        staleTime: 5 * 60 * 1000,
        // Keep in cache for 10 minutes
        gcTime: 10 * 60 * 1000,
        retry: 1,
        enabled: enabled,
        initialPageParam: null,
    });

    // Example mutation for deleting (to invalidate cache)
    const deleteEmailMutation = useMutation({
        mutationFn: (emailId) => emailAPI.deleteEmail(emailId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['emails'] });
            // Also potentially invalidate dashboard context if it shows email counts
            queryClient.invalidateQueries({ queryKey: ['dashboard-contextual'] });
        },
    });

    // Flatten emails from all pages
    const emails = data?.pages.flatMap((page) => page.items) || [];

    return {
        emails,
        isLoading,
        isFetching,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage,
        error: error?.message || null,
        refetch,
        deleteEmail: deleteEmailMutation.mutate,
    };
}
