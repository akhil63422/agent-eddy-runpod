import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ConfirmDialogContext = createContext(null);

export const ConfirmDialogProvider = ({ children }) => {
  const [dialogState, setDialogState] = useState({
    open: false,
    title: 'Confirm action',
    description: 'Are you sure you want to continue?',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    variant: 'default',
  });
  const [resolver, setResolver] = useState(null);

  const confirm = useCallback((options = {}) => {
    setDialogState({
      open: true,
      title: options.title || 'Confirm action',
      description: options.description || 'Are you sure you want to continue?',
      confirmLabel: options.confirmLabel || 'Confirm',
      cancelLabel: options.cancelLabel || 'Cancel',
      variant: options.variant || 'default',
    });
    return new Promise((resolve) => setResolver(() => resolve));
  }, []);

  const close = useCallback(
    (result) => {
      setDialogState((prev) => ({ ...prev, open: false }));
      if (resolver) {
        resolver(result);
        setResolver(null);
      }
    },
    [resolver],
  );

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      <AlertDialog open={dialogState.open} onOpenChange={(open) => !open && close(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogState.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialogState.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dialogState.cancelLabel}</AlertDialogCancel>
            <AlertDialogAction
              className={dialogState.variant === 'destructive' ? 'border border-[var(--status-error)] text-[var(--status-error-text)] bg-transparent hover:text-[var(--text-primary)]' : ''}
              onClick={() => close(true)}
            >
              {dialogState.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmDialogContext.Provider>
  );
};

export const useConfirmDialog = () => {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error('useConfirmDialog must be used inside ConfirmDialogProvider');
  }
  return context;
};
