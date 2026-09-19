"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  title: React.ReactNode;
  /** What else happens, e.g. "Se borran también sus 12 transacciones". */
  description?: React.ReactNode;
  /** Defaults to "Borrar" when destructive, else "Confirmar". */
  confirmLabel?: string;
  /** Defaults to "Cancelar". */
  cancelLabel?: string;
  destructive?: boolean;
};

export type Confirm = (options: ConfirmOptions) => Promise<boolean>;

/**
 * The caller waiting on the open dialog. A newer request replaces it and its
 * caller gets `false`, as if cancelled: a question the user never answered
 * must not go ahead, and a queue would show dialogs for clicks long past.
 */
export function createConfirmSlot() {
  let pending: ((confirmed: boolean) => void) | null = null;
  return {
    open(resolve: (confirmed: boolean) => void) {
      pending?.(false);
      pending = resolve;
    },
    /** Answers the waiting caller, once; later calls do nothing. */
    settle(confirmed: boolean) {
      const resolve = pending;
      pending = null;
      resolve?.(confirmed);
    },
  };
}

const ConfirmContext = React.createContext<Confirm | null>(null);

/** Hosts the app's one confirm dialog. Mounted once, in the root layout. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [slot] = React.useState(createConfirmSlot);
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);

  const confirm = React.useCallback<Confirm>(
    (next) =>
      new Promise<boolean>((resolve) => {
        slot.open(resolve);
        setOptions(next);
      }),
    [slot],
  );

  const settle = (confirmed: boolean) => {
    slot.settle(confirmed);
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={options !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        {!options ? null : (
          <AlertDialogContent
            // Radix asks for a description; say there is none on purpose.
            {...(options.description == null ? { "aria-describedby": undefined } : {})}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{options.title}</AlertDialogTitle>
              {options.description == null ? null : (
                // A div, not the default p: callers pass lists and paragraphs.
                <AlertDialogDescription asChild>
                  <div>{options.description}</div>
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{options.cancelLabel ?? "Cancelar"}</AlertDialogCancel>
              <AlertDialogAction
                variant={options.destructive ? "destructive" : "default"}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ??
                  (options.destructive ? "Borrar" : "Confirmar")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/**
 * `confirm(options)` resolves true when the user confirms, false when they
 * cancel, dismiss, or another confirm replaces this one.
 */
export function useConfirm(): Confirm {
  const confirm = React.useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm needs a ConfirmProvider above it");
  return confirm;
}
