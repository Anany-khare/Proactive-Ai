import React from 'react';
import * as DialogPrimitives from '@radix-ui/react-dialog';

export const Dialog = DialogPrimitives.Root;
export const DialogTrigger = DialogPrimitives.Trigger;
export const DialogPortal = DialogPrimitives.Portal;
export const DialogClose = DialogPrimitives.Close;

export const DialogContent = ({ className, children }) => (
  <DialogPortal>
    <DialogPrimitives.Overlay className="fixed inset-0 bg-black/50" />
    <DialogPrimitives.Content className={`fixed left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-xl ${className || ''}`}>
      {children}
    </DialogPrimitives.Content>
  </DialogPortal>
);

export const DialogHeader = ({ children }) => (
  <div className="mb-4">{children}</div>
);

export const DialogTitle = ({ children }) => (
  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{children}</h3>
);

