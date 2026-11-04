import { ChevronsUpDown, LogOut, Palette } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { navItems } from "@/lib/nav";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CidoeLogo } from "@/components/ui/pixel-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export function AppSidebar() {
  const { user, logout } = useAdminAuth();
  const { isMobile } = useSidebar();
  const { pathname } = useLocation();
  const name = user?.username ?? "—";

  return (
    <Sidebar variant="inset" collapsible="icon">
      {/* Topo: nome + ícone do projeto */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex flex-col gap-2">
            {/* Logo — sempre visível; texto some ao recolher. */}
            <div className="flex w-full items-center gap-2 overflow-hidden group-data-[collapsible=icon]:justify-center">
              <CidoeLogo className="size-8" />
              <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">Cidoe</span>
                <span className="truncate mono-label text-muted-foreground">Admin</span>
              </div>
            </div>
            {/* Linha do trigger: "Menu" à esquerda (aberto), botão à direita; texto some ao recolher. */}
            <div className="flex w-full items-center justify-between group-data-[collapsible=icon]:justify-center">
              <span className="px-2 mono-label text-muted-foreground group-data-[collapsible=icon]:hidden">
                Menu
              </span>
              <SidebarTrigger className="size-8 shrink-0" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title} isActive={item.to === pathname}>
                  <NavLink to={item.to ?? "#"} end>
                    <item.icon />
                    <span>{item.title}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Rodapé: usuário + menu de configurações (tema, sair) */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar size="sm">
                    {user?.profile_image && <AvatarImage src={user.profile_image} alt="" />}
                    <AvatarFallback>
                      {initials(name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user?.email ?? "Sem e-mail"}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left">
                    <Avatar size="sm">
                      {user?.profile_image && <AvatarImage src={user.profile_image} alt="" />}
                      <AvatarFallback>
                        {initials(name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-semibold">{name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user?.email ?? "Sem e-mail"}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* Tema: linha que não fecha o menu ao interagir. */}
                <div
                  className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="flex items-center gap-2">
                    <Palette className="size-4" />
                    Tema
                  </span>
                  <ThemeToggle />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
                  <LogOut />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
