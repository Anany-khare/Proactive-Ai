import React from 'react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';

export const DropdownMenu = Dropdown.Root;
export const DropdownMenuTrigger = Dropdown.Trigger;
export const DropdownMenuContent = ({ children, className }) => (
  <Dropdown.Portal>
    <Dropdown.Content sideOffset={8} className={`rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-md p-1 ${className || ''}`}>
      {children}
    </Dropdown.Content>
  </Dropdown.Portal>
);
export const DropdownMenuItem = ({ children, className, ...props }) => (
  <Dropdown.Item className={`px-3 py-2 rounded-md text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 outline-none ${className || ''}`} {...props}>
    {children}
  </Dropdown.Item>
);

