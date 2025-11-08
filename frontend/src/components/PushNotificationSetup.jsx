import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { Button } from './ui/button.jsx';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { pushAPI } from '../utils/api.jsx';
import pushNotificationService from '../services/pushNotificationService.js';

const PushNotificationSetup = () => {
  const [permission, setPermission] = useState(Notification.permission);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    try {
      const subscription = await pushNotificationService.getSubscription();
      if (subscription) {
        setIsSubscribed(true);
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const handleEnableNotifications = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Request permission
      const hasPermission = await pushNotificationService.requestPermission();
      if (!hasPermission) {
        setError('Notification permission denied');
        setPermission(Notification.permission);
        setIsLoading(false);
        return;
      }

      setPermission(Notification.permission);

      // Register service worker
      await pushNotificationService.registerServiceWorker();

      // Subscribe to push notifications
      const subscription = await pushNotificationService.subscribe();
      if (!subscription) {
        setError('Failed to subscribe to push notifications');
        setIsLoading(false);
        return;
      }

      // Send subscription to backend
      const subscriptionObj = pushNotificationService.subscriptionToObject(subscription);
      await pushAPI.subscribe(subscriptionObj);

      setIsSubscribed(true);
    } catch (error) {
      console.error('Error enabling notifications:', error);
      setError('Failed to enable notifications. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableNotifications = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const subscription = await pushNotificationService.getSubscription();
      if (subscription) {
        // Unsubscribe from push notifications
        await pushNotificationService.unsubscribe();
        
        // Remove subscription from backend
        await pushAPI.unsubscribe(subscription.endpoint);
      }

      setIsSubscribed(false);
    } catch (error) {
      console.error('Error disabling notifications:', error);
      setError('Failed to disable notifications. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Push Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Your browser does not support push notifications.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Bell className="w-5 h-5" />
          <span>Push Notifications</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Get notified about high-priority emails and upcoming meetings even when the app is closed.
          </p>
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Status:
            </span>
            <span className={`text-sm ${
              isSubscribed
                ? 'text-green-600 dark:text-green-400'
                : permission === 'denied'
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-600 dark:text-gray-400'
            }`}>
              {isSubscribed
                ? 'Enabled'
                : permission === 'denied'
                ? 'Blocked'
                : permission === 'granted'
                ? 'Permission granted, not subscribed'
                : 'Disabled'}
            </span>
          </div>
        </div>

        <div className="flex space-x-2">
          {!isSubscribed ? (
            <Button
              onClick={handleEnableNotifications}
              disabled={isLoading || permission === 'denied'}
              className="bg-primary-600 hover:bg-primary-700 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enabling...
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4 mr-2" />
                  Enable Notifications
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleDisableNotifications}
              disabled={isLoading}
              variant="outline"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Disabling...
                </>
              ) : (
                <>
                  <BellOff className="h-4 w-4 mr-2" />
                  Disable Notifications
                </>
              )}
            </Button>
          )}
        </div>

        {permission === 'denied' && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Notifications are blocked. Please enable them in your browser settings to receive push notifications.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PushNotificationSetup;
