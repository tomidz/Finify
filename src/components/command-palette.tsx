"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { ButtonKbdHint } from "@/components/button-kbd-hint";
import { filterIgnoringAccents } from "@/components/command-filter";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useModKeyLabel, useShortcut } from "@/lib/keyboard";
import { NAV_SECTIONS } from "@/lib/nav";
import { uiScale } from "@/lib/ui-scale";
import { cn } from "@/lib/utils";

const PAGES = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ ...item, section: section.label })),
);

/**
 * ⌘K / Ctrl+K: go to any page or run an action. Renders its own trigger
 * button, for the header.
 */
/** On the transactions page, keeps its month and filters. */
function newTransactionHref(): string {
  const params = new URLSearchParams(window.location.pathname === "/transactions" ? window.location.search : "");
  params.set("new", "1");
  return `/transactions?${params}`;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const mod = useModKeyLabel();

  // While open, the palette is the dialog the shortcut would otherwise yield to.
  useShortcut("k", () => setOpen((wasOpen) => !wasOpen), { mod: true, inDialogs: open });

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label="Buscar"
        className={cn(uiScale.button, "text-muted-foreground")}
        onClick={() => setOpen(true)}
      >
        <Search />
        <span className="hidden sm:inline">Buscar</span>
        <ButtonKbdHint keys={[mod, "K"]} variant="outline" />
      </Button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
          {/* Pinned from the top so the box does not move as results filter. */}
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed top-[15vh] left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 overflow-hidden rounded-lg border bg-popover shadow-lg outline-none sm:max-w-lg"
          >
            <DialogPrimitive.Title className="sr-only">Buscar</DialogPrimitive.Title>
            <Command filter={filterIgnoringAccents}>
              <CommandInput placeholder="Ir a una página o acción…" />
              <CommandList className="max-h-[min(360px,60vh)]">
                <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
                  Sin resultados
                </CommandEmpty>
                <CommandGroup heading="Ir a">
                  {PAGES.map((page) => {
                    const Icon = page.icon;
                    return (
                      <CommandItem
                        key={page.href}
                        value={page.label}
                        keywords={[page.section]}
                        onSelect={() => go(page.href)}
                      >
                        <Icon />
                        {page.label}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <CommandGroup heading="Acciones">
                  <CommandItem value="Nueva transacción" onSelect={() => go(newTransactionHref())}>
                    <Plus />
                    Nueva transacción
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
