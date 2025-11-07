import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { useHealthData } from '../hooks/useHealthData.jsx';

const Health = () => {
  const { stats, trend } = useHealthData();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Health</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent><div className="text-sm text-gray-500">Steps</div><div className="text-2xl font-semibold">{stats.steps ?? '-'}</div></CardContent></Card>
        <Card><CardContent><div className="text-sm text-gray-500">Sleep</div><div className="text-2xl font-semibold">{stats.sleep ?? '-'}{stats.sleep ? ' h' : ''}</div></CardContent></Card>
        <Card><CardContent><div className="text-sm text-gray-500">Water</div><div className="text-2xl font-semibold">{stats.water ?? '-'}{stats.water ? ' L' : ''}</div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Weekly Trends</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            {trend && trend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <XAxis dataKey="day" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip />
                  <Line type="monotone" dataKey="steps" stroke="#0ea5e9" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-gray-500">No trend data</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Health;

