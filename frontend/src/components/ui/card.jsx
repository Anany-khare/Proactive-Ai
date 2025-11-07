import React from 'react';
import { clsx } from 'clsx';

export const Card = ({ className, children }) => (
  <div className={clsx(
    'rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm',
    className
  )}>{children}</div>
);

export const CardHeader = ({ className, children }) => (
  <div className={clsx('px-4 py-3 border-b border-gray-200 dark:border-gray-800', className)}>{children}</div>
);

export const CardTitle = ({ className, children }) => (
  <h3 className={clsx('text-sm font-semibold text-gray-900 dark:text-gray-100', className)}>{children}</h3>
);

export const CardContent = ({ className, children }) => (
  <div className={clsx('p-4', className)}>{children}</div>
);

