import type { ComponentType } from "react";
import { BellIcon, BriefcaseIcon, CalendarIcon, ClipboardIcon, HomeIcon, ShieldCheckIcon } from "./icons";
import type { Role } from "./use-auth-guard";

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

// Single source of truth for the sidebar: add a role's nav item here and it
// shows up everywhere that role's sidebar is rendered, nothing else to edit.
export const NAV_CONFIG: Record<Role, NavItem[]> = {
  client: [
    { label: "Home", href: "/dashboard", icon: HomeIcon },
    { label: "Request a Service", href: "/request", icon: ClipboardIcon },
    { label: "My Bookings", href: "/dashboard/bookings", icon: CalendarIcon },
    { label: "Notifications", href: "/notifications", icon: BellIcon },
  ],
  provider: [
    { label: "Home", href: "/provider/dashboard", icon: HomeIcon },
    { label: "Incoming Requests", href: "/provider/dashboard/jobs", icon: BriefcaseIcon },
    { label: "Availability", href: "/provider/availability", icon: CalendarIcon },
    { label: "Notifications", href: "/notifications", icon: BellIcon },
  ],
  admin: [
    { label: "Home", href: "/admin/dashboard", icon: HomeIcon },
    { label: "Provider Verification", href: "/admin/verify-providers", icon: ShieldCheckIcon },
    { label: "Notifications", href: "/notifications", icon: BellIcon },
  ],
};
