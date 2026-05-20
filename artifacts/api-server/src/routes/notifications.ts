import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";

const router: IRouter = Router();

function formatNotification(n: typeof notificationsTable.$inferSelect) {
  return {
    ...n,
    createdAt: n.createdAt.toISOString(),
  };
}

// List notifications — optionally filter by userId and/or unreadOnly
router.get("/notifications", async (req, res): Promise<void> => {
  const userId = req.query.userId ? Number(req.query.userId) : undefined;
  const unreadOnly = req.query.unreadOnly === "true";

  let query = db.select().from(notificationsTable);

  const conditions = [];
  if (userId !== undefined) conditions.push(eq(notificationsTable.userId, userId));
  if (unreadOnly) conditions.push(eq(notificationsTable.isRead, false));

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(conditions.length === 1 ? conditions[0] : conditions.length > 1 ? and(...conditions) : undefined)
    .orderBy(desc(notificationsTable.createdAt))
    .limit(100);

  res.json(notifications.map(formatNotification));
});

// Mark a single notification as read
router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [notification] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.id, id))
    .returning();

  if (!notification) { res.status(404).json({ error: "Notification not found" }); return; }

  res.json(formatNotification(notification));
});

// Mark all notifications as read (optionally scoped to userId)
router.post("/notifications/read-all", async (req, res): Promise<void> => {
  const userId = req.body?.userId ? Number(req.body.userId) : undefined;

  const condition = userId !== undefined
    ? and(eq(notificationsTable.isRead, false), eq(notificationsTable.userId, userId))
    : eq(notificationsTable.isRead, false);

  const updated = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(condition)
    .returning();

  res.json({ updated: updated.length });
});

export default router;
