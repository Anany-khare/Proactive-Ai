import { useEffect, useState } from 'react';

// Placeholder data source hook. Wire to your API later.
export function useDashboardData() {
  const [data, setData] = useState({
    meetings: [],
    messages: [],
    healthSummary: null,
    overviewPoints: [],
  });

  useEffect(() => {
    // TODO: fetch from backend and setData
  }, []);

  return data;
}

