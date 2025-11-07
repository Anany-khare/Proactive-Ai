import React from 'react';
import { clsx } from 'clsx';

export const Button = ({ className, children, variant = 'default', ...props }) => {
  const base = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none h-9 px-4 py-2';
  const variants = {
    default: 'bg-primary-600 text-white hover:bg-primary-700',
    outline: 'border border-gray-200 dark:border-gray-800 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100',
    ghost: 'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100',
  };
  return (
    <button className={clsx(base, variants[variant], className)} {...props}>{children}</button>
  );
};

