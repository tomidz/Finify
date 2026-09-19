import { type VariantProps } from "class-variance-authority";

import { buttonVariants } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];

// On a solid button the muted key colors disappear; tint with the button's own text color.
const SOLID_TINT: Partial<Record<NonNullable<ButtonVariant>, string>> = {
  default: "border-transparent bg-primary-foreground/20 text-primary-foreground",
  destructive: "border-transparent bg-white/20 text-white",
};

/**
 * A shortcut shown inside a button, at its right edge. Display only: bind the
 * key with `useShortcut`. Hidden below `sm`, where there is no keyboard.
 */
export function ButtonKbdHint({
  keys,
  variant = "default",
  className,
}: {
  /** One key ("N") or a chord (["⌘", "K"]). */
  keys: string | readonly string[];
  /** The host Button's variant; omitted means "default", as on Button. */
  variant?: ButtonVariant;
  className?: string;
}) {
  const tint = SOLID_TINT[variant ?? "default"];
  const list = typeof keys === "string" ? [keys] : keys;
  return (
    <KbdGroup data-slot="button-kbd-hint" className={cn("ml-auto hidden sm:inline-flex", className)}>
      {list.map((key) => (
        <Kbd key={key} className={cn("h-4 min-w-4 px-1 text-[10px]", tint)}>
          {key}
        </Kbd>
      ))}
    </KbdGroup>
  );
}
