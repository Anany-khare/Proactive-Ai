import React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';

export const Switch = ({ checked, onCheckedChange, className = '', ...props }) => (
  <SwitchPrimitives.Root
    checked={checked}
    onCheckedChange={onCheckedChange}
    className={`
      peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full 
      border-2 border-transparent transition-colors duration-200 ease-in-out
      focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 
      disabled:cursor-not-allowed disabled:opacity-50 
      ${checked 
        ? 'bg-primary-600 hover:bg-primary-700' 
        : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
      }
      ${className}
    `}
    {...props}
  >
    <SwitchPrimitives.Thumb 
      className={`
        pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg 
        ring-0 transition-transform duration-200 ease-in-out
        ${checked ? 'translate-x-5' : 'translate-x-0'}
      `} 
    />
  </SwitchPrimitives.Root>
);

