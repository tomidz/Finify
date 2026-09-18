/**
 * The one size for toolbar controls (page actions, filters, search, month
 * pickers): a row of mixed controls only lines up when all of them share the
 * height. Class names stay literal so Tailwind finds them.
 */
export const uiScale = {
  /** A button with a label, optionally led by an icon. Pair with Button `size="sm"`. */
  button:
    "h-8 gap-1.5 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
  /** A square icon-only button. Needs an `aria-label`. */
  iconButton: "size-8 p-0 has-[>svg]:p-0 [&_svg:not([class*='size-'])]:size-3.5",
  /** A select, popover or combobox trigger. The data-size rule outranks SelectTrigger's own height. */
  trigger:
    "h-8 data-[size=default]:h-8 gap-1.5 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
  /** A text field (Input or InputGroup). 16px below md: iOS zooms into smaller fields on focus. */
  field: "h-8 text-base md:text-xs",
  /** An icon placed by hand beside the controls. */
  icon: "size-3.5",
  /** The 11px caption above a control or a group of them. */
  label: "text-[11px] font-medium text-muted-foreground",
} as const;
