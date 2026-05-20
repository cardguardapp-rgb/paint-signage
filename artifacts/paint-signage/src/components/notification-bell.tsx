import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import type { Notification } from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, Calendar, LinkIcon, AlertTriangle } from "lucide-react";

const TYPE_ICON: Record<string, React.ReactNode> = {
  quote_approved: <LinkIcon className="h-3.5 w-3.5 text-green-600" />,
  job_assigned: <Calendar className="h-3.5 w-3.5 text-blue-600" />,
  job_scheduled: <Calendar className="h-3.5 w-3.5 text-blue-600" />,
  safety_flagged: <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />,
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: (id: number) => void;
}) {
  return (
    <button
      onClick={() => !notification.isRead && onRead(notification.id)}
      className={`w-full text-left flex gap-3 p-3 rounded-lg transition-colors ${
        notification.isRead
          ? "opacity-60 cursor-default"
          : "hover:bg-muted/60 cursor-pointer"
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {TYPE_ICON[notification.type] ?? <Bell className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${notification.isRead ? "" : "font-medium"}`}>
          {notification.message}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(notification.createdAt)}</p>
      </div>
      {!notification.isRead && (
        <div className="mt-1.5 shrink-0 h-2 w-2 rounded-full bg-primary" />
      )}
    </button>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // Always poll for unread count
  const { data: unread = [] } = useListNotifications(
    { unreadOnly: true },
    { query: { refetchInterval: 30_000 } }
  );

  // Only fetch full list when popover is open
  const { data: recent = [], isLoading } = useListNotifications(
    {},
    { query: { enabled: open, staleTime: 10_000 } }
  );

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
  };

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id }, { onSuccess: invalidate });
  };

  const handleMarkAll = () => {
    markAllRead.mutate({}, { onSuccess: invalidate });
  };

  const unreadCount = unread.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Notifications">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 h-4 min-w-4 px-0.5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs h-5 px-1.5">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleMarkAll}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto p-1">
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="py-8 text-center">
              <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {recent.map((n) => (
                <NotificationItem key={n.id} notification={n} onRead={handleMarkRead} />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
