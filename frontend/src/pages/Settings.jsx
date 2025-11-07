import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';

const Settings = () => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Profile & Settings</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Manage your account and preferences</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <input className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Name" />
            <input className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Email" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>AI Preferences</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <input className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Model" />
            <input className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Temperature" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;

