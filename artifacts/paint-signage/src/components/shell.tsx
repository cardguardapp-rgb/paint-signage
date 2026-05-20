import { Link, useLocation } from "wouter";
import { LayoutDashboard, Briefcase, Users, Building2, Paintbrush, CalendarDays } from "lucide-react";
import { NotificationBell } from "./notification-bell";

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Jobs", href: "/jobs", icon: Briefcase },
    { name: "Schedule", href: "/schedule", icon: CalendarDays },
    { name: "Clients", href: "/clients", icon: Building2 },
    { name: "Users", href: "/users", icon: Users },
  ];

  return (
    <div className="flex min-h-screen w-full bg-muted/30">
      <div className="hidden border-r bg-card w-64 md:block">
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Paintbrush className="h-6 w-6 text-primary" />
              <span>ProSignage</span>
            </Link>
          </div>
          <div className="flex-1 overflow-auto py-2">
            <nav className="grid items-start px-2 text-sm font-medium lg:px-4 space-y-1">
              {navigation.map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href));
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                      isActive
                        ? "bg-primary/10 text-primary hover:bg-primary/20"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar with notification bell */}
        <header className="flex h-14 items-center justify-end border-b bg-card px-4 lg:px-6 shrink-0">
          <NotificationBell />
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
