import React from 'react';
import * as DialogPrimitives from '@radix-ui/react-dialog';

export const Dialog = DialogPrimitives.Root;
export const DialogTrigger = DialogPrimitives.Trigger;
export const DialogPortal = DialogPrimitives.Portal;
export const DialogClose = DialogPrimitives.Close;

export const DialogContent = ({ className, children }) => (
  <DialogPortal>
    <DialogPrimitives.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
    <DialogPrimitives.Content className={`fixed left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-2xl z-50 focus:outline-none ${className || ''}`}>
      {children}
    </DialogPrimitives.Content>
  </DialogPortal>
);

export const DialogHeader = ({ children, className }) => (
  <div className={`flex flex-col space-y-1.5 text-center sm:text-left mb-4 ${className || ''}`}>
    {children}
  </div>
);

export const DialogTitle = ({ children, className }) => (
  <DialogPrimitives.Title className={`text-lg font-semibold leading-none tracking-tight text-gray-900 dark:text-gray-100 ${className || ''}`}>
    {children}
  </DialogPrimitives.Title>
);

export const DialogDescription = ({ children, className }) => (
  <DialogPrimitives.Description className={`text-sm text-gray-500 dark:text-gray-400 ${className || ''}`}>
    {children}
  </DialogPrimitives.Description>
);

export const DialogFooter = ({ children, className }) => (
  <div className={`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6 ${className || ''}`}>
    {children}
  </div>
);
