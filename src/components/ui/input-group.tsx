"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * One bordered field made of an input and addons (a "US$" prefix, a trailing
 * clear button). Height and text size are set here and inherited by the input
 * and the addons, so `className={uiScale.field}` sizes the whole field.
 */
function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-transparent text-base shadow-xs md:text-sm dark:bg-input/30",
        "has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-[3px] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50",
        "has-[[data-slot=input-group-control][aria-invalid=true]]:border-destructive has-[[data-slot=input-group-control][aria-invalid=true]]:ring-destructive/20 dark:has-[[data-slot=input-group-control][aria-invalid=true]]:ring-destructive/40",
        "has-[[data-slot=input-group-control]:disabled]:cursor-not-allowed has-[[data-slot=input-group-control]:disabled]:opacity-50",
        // An addon brings its own edge padding, so the input needs less on that side.
        "has-[>[data-align=inline-start]]:[&>[data-slot=input-group-control]]:pl-1.5 has-[>[data-align=inline-end]]:[&>[data-slot=input-group-control]]:pr-1.5",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupAddon({
  className,
  align = "inline-start",
  onClick,
  ...props
}: React.ComponentProps<"div"> & { align?: "inline-start" | "inline-end" }) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "flex h-full shrink-0 cursor-text items-center gap-1 text-muted-foreground select-none [&>button]:cursor-default [&>svg:not([class*='size-'])]:size-4",
        align === "inline-start"
          ? "order-first pl-3 has-[>button]:pl-1"
          : "order-last pr-3 has-[>button]:pr-1",
        className,
      )}
      // Clicking a prefix or an icon lands in the input, as if it were part of it.
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if ((event.target as HTMLElement).closest("button")) return;
        event.currentTarget.parentElement
          ?.querySelector<HTMLInputElement>("[data-slot=input-group-control]")
          ?.focus();
      }}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="input-group-text"
      className={cn(
        "flex items-center gap-1 whitespace-nowrap text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-control"
      className={cn(
        "h-full w-full min-w-0 flex-1 bg-transparent px-3 outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "icon-xs",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size"> & {
  size?: "xs" | "icon-xs" | "sm" | "icon-sm";
}) {
  return (
    <Button
      data-slot="input-group-button"
      type={type}
      variant={variant}
      size={size}
      className={cn("text-muted-foreground shadow-none hover:text-foreground", className)}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
};
