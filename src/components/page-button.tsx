import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";
import { Slot } from "radix-ui";

import { ButtonKbdHint } from "@/components/button-kbd-hint";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { uiScale } from "@/lib/ui-scale";
import { cn } from "@/lib/utils";

export type PageButtonProps = React.ComponentProps<"button"> &
  Pick<VariantProps<typeof buttonVariants>, "variant"> & {
    asChild?: boolean;
    icon?: LucideIcon;
    /** Shortcut shown at the right edge ("N" or ["⌘", "K"]). Display only: bind it with `useShortcut`. */
    kbd?: string | readonly string[];
    /** A Spinner in place of the icon, and disabled, while the action runs. */
    loading?: boolean;
  };

/**
 * A page or toolbar action at the toolbar scale: icon, short label, optional
 * shortcut hint. With no children it is a square icon button (give it an
 * `aria-label`). `asChild` renders into a Link, keeping the icon and hint.
 */
export function PageButton({
  className,
  variant = "default",
  asChild = false,
  icon: Icon,
  kbd,
  loading = false,
  disabled,
  children,
  ...props
}: PageButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  const iconOnly = !asChild && (children == null || children === false);
  return (
    <Comp
      data-slot="page-button"
      data-variant={variant}
      className={cn(
        buttonVariants({ variant, size: iconOnly ? "icon-sm" : "sm" }),
        iconOnly ? uiScale.iconButton : uiScale.button,
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner aria-hidden /> : !Icon ? null : <Icon aria-hidden />}
      <Slot.Slottable>{children}</Slot.Slottable>
      {!kbd || iconOnly ? null : <ButtonKbdHint keys={kbd} variant={variant} />}
    </Comp>
  );
}
