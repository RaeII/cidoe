import { useState } from "react";
import { LogOut, Menu, Palette } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { MOBILE_PRIMARY_COUNT, navItems, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CidoeLogo } from "@/components/ui/pixel-icon";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// Linha de item dentro do drawer. ▸ (menu-cursor) marca hover e a página atual (aria-current).
const rowClass =
  "menu-cursor flex w-full items-center gap-3 py-2.5 pr-3 pl-6 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

// Tab da bottom bar. Bloco verde-claro marca o ativo; sem `to` fica inerte (placeholder).
function NavTab({ item }: { item: NavItem }) {
  const Icon = item.icon;
  const inner = (active: boolean) => (
    <>
      <span
        className={cn(
          "flex items-center justify-center px-4 py-1 transition-colors",
          active && "bg-secondary",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="text-[10px] font-semibold">{item.title}</span>
    </>
  );

  if (!item.to) {
    return (
      <button
        type="button"
        className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-muted-foreground"
      >
        {inner(false)}
      </button>
    );
  }

  return (
    <NavLink
      to={item.to}
      end
      className={({ isActive }) =>
        cn(
          "flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors",
          isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )
      }
    >
      {({ isActive }) => inner(isActive)}
    </NavLink>
  );
}

// Drawer "Menu": nav completa + conta (tema, sair). Abre da direita.
function MoreSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user, logout } = useAdminAuth();
  const { pathname } = useLocation();
  const name = user?.username ?? "—";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-3/4 flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="flex-row items-center gap-2 border-b">
          <CidoeLogo className="size-8" />
          <div className="grid text-left leading-tight">
            <SheetTitle>Cidoe</SheetTitle>
            <SheetDescription className="mono-label">Admin</SheetDescription>
          </div>
        </SheetHeader>

        <nav className="flex-1 overflow-auto p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const content = (
              <>
                <Icon className="size-4" />
                <span>{item.title}</span>
              </>
            );
            if (!item.to) {
              return (
                <button key={item.title} type="button" className={rowClass}>
                  {content}
                </button>
              );
            }
            return (
              <SheetClose asChild key={item.title}>
                <NavLink
                  to={item.to}
                  end
                  className={cn(rowClass, item.to === pathname && "bg-secondary font-semibold text-secondary-foreground")}
                >
                  {content}
                </NavLink>
              </SheetClose>
            );
          })}
        </nav>

        <div className="border-t p-2">
          <div className="flex items-center gap-3 py-2 pr-3 pl-6">
            <Avatar size="sm">
              {user?.profile_image && <AvatarImage src={user.profile_image} alt="" />}
              <AvatarFallback>
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate text-sm font-semibold">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{user?.email ?? "Sem e-mail"}</span>
            </div>
          </div>
          <div className="flex w-full items-center justify-between gap-3 py-2.5 pr-3 pl-6 text-sm text-foreground">
            <span className="flex items-center gap-3">
              <Palette className="size-4" />
              Tema
            </span>
            <ThemeToggle />
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className={cn(rowClass, "text-destructive hover:bg-destructive/10 hover:text-destructive")}
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Navegação mobile: bottom bar fixa (só < md). Últ. slot abre o drawer com o menu completo.
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const primary = navItems.slice(0, MOBILE_PRIMARY_COUNT);

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-50 flex border-t-3 border-(--pixel-ink) bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {primary.map((item) => (
          <NavTab key={item.title} item={item} />
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="flex items-center justify-center px-4 py-1">
            <Menu className="size-5" />
          </span>
          <span className="text-[10px] font-semibold">Menu</span>
        </button>
      </nav>

      <MoreSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
