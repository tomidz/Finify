"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface TruncatedTextProps extends Omit<React.ComponentProps<"span">, "ref"> {
  /** Tooltip content. Default: the children. */
  tooltip?: React.ReactNode;
}

/** One line cut with an ellipsis; hovering shows the full text, only when it is actually cut. */
export function TruncatedText({ children, tooltip, className, ...props }: TruncatedTextProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [open, setOpen] = React.useState(false);

  // Measured when the tooltip asks to open, so a resize or new text needs no observer.
  const onOpenChange = (next: boolean) => {
    const element = ref.current;
    setOpen(next && element != null && element.scrollWidth > element.clientWidth);
  };

  return (
    <Tooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild>
        <span ref={ref} className={cn("block min-w-0 truncate", className)} {...props}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-80 break-words">{tooltip ?? children}</TooltipContent>
    </Tooltip>
  );
}
