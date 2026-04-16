import { useEffect, useState, useRef } from 'react';
import { realtimeAPI } from '../utils/api.jsx';
import { fetchEventSource } from '@microsoft/fetch-event-source';

export const useRealtimeUpdates = (onEmailUpdate, onMeetingUpdate) => {
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  const connectingRef = useRef(false);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const controller = new AbortController();
    connectingRef.current = true;

    const connect = async () => {
      try {
        await fetchEventSource(realtimeAPI.getStreamUrl(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
          onopen(response) {
            if (response.ok) {
              setConnected(true);
              setError(null);
              connectingRef.current = false;
              return;
            } else {
              setConnected(false);
              throw new Error(`Connection failed: ${response.statusText}`);
            }
          },
          onmessage(msg) {
            try {
              const data = JSON.parse(msg.data);
              switch (data.type) {
                case 'status':
                  setConnectionStatus(data.status);
                  break;
                case 'emails':
                  if (onEmailUpdate && data.data) onEmailUpdate(data.data);
                  break;
                case 'meetings':
                  if (onMeetingUpdate && data.data) onMeetingUpdate(data.data);
                  break;
                case 'heartbeat':
                  break;
                case 'error':
                  console.error('Real-time update error:', data.message);
                  setError(data.message);
                  break;
              }
            } catch (err) {
              console.error('Error parsing SSE message:', err);
            }
          },
          onclose() {
            setConnected(false);
            setConnectionStatus('disconnected');
            connectingRef.current = false;
          },
          onerror(err) {
            // Suppress AbortError logs as they are expected on unmount/navigation
            if (err.name === 'AbortError' || controller.signal.aborted) {
              return;
            }
            console.error('SSE connection error:', err);
            setError('Connection error');
            setConnected(false);
            setConnectionStatus('disconnected');
            throw err; // Stop retrying
          }
        });
      } catch (err) {
        if (err.name === 'AbortError' || controller.signal.aborted) {
          return;
        }
        console.error('Failed to initialize SSE:', err);
        setError('Failed to connect');
        connectingRef.current = false;
      }
    };

    connect();

    return () => {
      controller.abort();
      setConnected(false);
      connectingRef.current = false;
    };
  }, [onEmailUpdate, onMeetingUpdate]);

  return { connected, connectionStatus, error };
};

export default useRealtimeUpdates;
