import { useEffect, useState, useRef } from 'react';
import { realtimeAPI } from '../utils/api.jsx';

export const useRealtimeUpdates = (onEmailUpdate, onMeetingUpdate) => {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      return;
    }

    // Create EventSource for SSE with token in query parameter
    // EventSource doesn't support custom headers, so we pass token as query param
    const eventSource = new EventSource(
      `${realtimeAPI.getStreamUrl()}?token=${encodeURIComponent(token)}`,
      { withCredentials: true }
    );

    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'connected':
            console.log('Real-time updates connected');
            break;
          case 'emails':
            if (onEmailUpdate && data.data) {
              onEmailUpdate(data.data);
            }
            break;
          case 'meetings':
            if (onMeetingUpdate && data.data) {
              onMeetingUpdate(data.data);
            }
            break;
          case 'heartbeat':
            // Keep connection alive
            break;
          case 'error':
            console.error('Real-time update error:', data.message);
            setError(data.message);
            break;
          default:
            console.log('Unknown event type:', data.type);
        }
      } catch (err) {
        console.error('Error parsing SSE message:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
      setError('Connection error');
      setConnected(false);
      
      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        if (eventSourceRef.current && eventSourceRef.current.readyState === EventSource.CLOSED) {
          // Reconnect logic would go here if needed
        }
      }, 5000);
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [onEmailUpdate, onMeetingUpdate]);

  return { connected, error };
};

export default useRealtimeUpdates;
