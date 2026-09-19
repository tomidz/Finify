"use client";

import * as React from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { uiScale } from "@/lib/ui-scale";
import { cn } from "@/lib/utils";

export interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Header buttons, left of the close button. */
  actions?: React.ReactNode;
  /** Pinned under the scrolling body. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Right-side sheet for a record's detail: full width on phones, 520px on desktop; Esc closes it. */
export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  actions,
  footer,
  children,
  className,
  bodyClassName,
}: DetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        // Radix warns about a missing description unless this is explicitly unset.
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn("w-full gap-0 sm:max-w-[520px] animate-none! transition-none", className)}
      >
        <SheetHeader className="flex-row items-start gap-2 border-b p-4">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <SheetTitle className="truncate text-sm">{title}</SheetTitle>
            {!description ? null : <SheetDescription className="text-xs">{description}</SheetDescription>}
          </div>
          {!actions ? null : <div className="flex shrink-0 items-center gap-1">{actions}</div>}
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" className={cn(uiScale.iconButton, "transition-none")} aria-label="Cerrar">
              <XIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className={cn("min-h-0 flex-1 overflow-y-auto p-4", bodyClassName)}>{children}</div>
        {!footer ? null : (
          <SheetFooter className="mt-0 flex-row items-center justify-end border-t p-4">{footer}</SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
