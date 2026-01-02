import { useEffect, useState, useRef } from 'react';
import { realtimeAPI } from '../utils/api.jsx';

export const useRealtimeUpdates = (onEmailUpdate, onMeetingUpdate) => {
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      return;
    }

    const controller = new AbortController();

    // Use fetchEventSource to support headers
    import('@microsoft/fetch-event-source').then(({ fetchEventSource }) => {
      fetchEventSource(realtimeAPI.getStreamUrl(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
        onopen(response) {
          if (response.ok) {
            setConnected(true);
            setError(null);
            return; // everything is good
          } else {
            setConnected(false);
            // if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            //     // client-side errors are usually fatal retry will not help
            //     throw new FatalError();
            // } 
            throw new Error(`Connection failed: ${response.statusText}`);
          }
        },
        onmessage(msg) {
          try {
            const data = JSON.parse(msg.data);

            switch (data.type) {
              case 'status':
                setConnectionStatus(data.status); // 'connected' or 'degraded'
                if (data.status === 'degraded') {
                  console.warn(data.message);
                }
                break;
              case 'connected': // Fallback legacy
                setConnectionStatus('connected');
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
        },
        onclose() {
          setConnected(false);
          setConnectionStatus('disconnected');
        },
        onerror(err) {
          console.error('SSE connection error:', err);
          setError('Connection error');
          setConnected(false);
          setConnectionStatus('disconnected');
          throw err;
        }
      }).catch(err => {
        console.error('Failed to initialize SSE:', err);
        setError('Failed to connect');
      });
    });

    return () => {
      controller.abort();
      setConnected(false);
    };
  }, [onEmailUpdate, onMeetingUpdate]);

  return { connected, connectionStatus, error };
};

export default useRealtimeUpdates;
