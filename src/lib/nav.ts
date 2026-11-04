import { Blocks, Boxes, Gift, HeartHandshake, LayoutDashboard, MapPinned, Palette, Trophy, Users, type LucideIcon } from "lucide-react";

// Fonte única de navegação da área /dale (admin): AppSidebar (desktop) e MobileNav
// (bottom bar) leem daqui. `to` presente = navega e marca ativo.
export type NavItem = {
  title: string;
  icon: LucideIcon;
  to?: string;
};

export const navItems: NavItem[] = [
  { title: "Dashboard", icon: LayoutDashboard, to: "/dale" },
  { title: "Edifícios de teste", icon: Blocks, to: "/dale/edificios-teste" },
  { title: "Personalizações", icon: Palette, to: "/dale/personalizacoes" },
  { title: "Passe", icon: Trophy, to: "/dale/passe" },
  { title: "Primeiros inscritos", icon: Gift, to: "/dale/primeiros-inscritos" },
  { title: "IBGE", icon: MapPinned, to: "/dale/ibge" },
  { title: "Usuários", icon: Users, to: "/dale/usuarios" },
  { title: "ONGs", icon: HeartHandshake, to: "/dale/ongs" },
  { title: "Cena 3D", icon: Boxes, to: "/" },
];

// Bottom bar mobile: nº máx. de tabs diretas; o resto (e a conta) vai no drawer "Menu".
export const MOBILE_PRIMARY_COUNT = 4;
