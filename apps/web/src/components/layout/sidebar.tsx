"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Send,
  Layers,
  Settings,
  Zap,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const NAV = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/wallets", icon: Wallet, label: "Wallets" },
  { href: "/swap", icon: ArrowLeftRight, label: "Swap" },
  { href: "/transfer", icon: Send, label: "Transfer" },
  { href: "/dlmm", icon: Layers, label: "DLMM Positions" },
  { href: "/logs", icon: ScrollText, label: "Logs" },
];

function NavItem({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <Tooltip>
      <TooltipTrigger render={
        <Link
          href={href}
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150",
            active
              ? "bg-primary text-primary-foreground glow-purple"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          )}
        >
          <Icon className="w-5 h-5" />
        </Link>
      } />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  return (
    <TooltipProvider delay={200}>
      <aside className="flex flex-col items-center w-[60px] min-h-screen bg-card border-r border-border py-4 gap-2 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center mb-4 glow-purple">
          <Zap className="w-5 h-5 text-white" />
        </div>

        <nav className="flex flex-col items-center gap-1 flex-1">
          {NAV.map(item => <NavItem key={item.href} {...item} />)}
        </nav>

        <Tooltip>
          <TooltipTrigger render={
            <Link
              href="/settings"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-150"
            >
              <Settings className="w-5 h-5" />
            </Link>
          } />
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </aside>
    </TooltipProvider>
  );
}
