import { useEffect, useState } from 'react';

// Placeholder health data hook. Replace with API calls later.
export function useHealthData() {
  const [stats, setStats] = useState({ steps: null, sleep: null, water: null });
  const [trend, setTrend] = useState([]);

  useEffect(() => {
    // TODO: fetch from backend and update setStats/setTrend
  }, []);

  return { stats, trend };
}

