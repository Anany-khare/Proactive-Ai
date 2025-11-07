import React from 'react';
import { Button } from '../components/ui/button.jsx';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.jsx';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';

const Meetings = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Meetings</h1>
        <Dialog>
          <DialogTrigger asChild>
            <Button>New Meeting</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule a new meeting</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <input className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Title" />
              <input className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Date & Time" />
              <Button className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardHeader><CardTitle>Calendar (placeholder)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-80 bg-gray-50 dark:bg-gray-800 rounded-md flex items-center justify-center text-gray-500 dark:text-gray-400">Weekly/Monthly calendar placeholder</div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Meetings;

