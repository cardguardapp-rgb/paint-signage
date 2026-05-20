import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import clientsRouter from "./clients";
import jobsRouter from "./jobs";
import estimatesRouter from "./estimates";
import quotesRouter from "./quotes";
import phasesRouter from "./phases";
import notificationsRouter from "./notifications";
import swmsRouter from "./swms";
import invoicesRouter from "./invoices";
import financialsRouter from "./financials";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(clientsRouter);
router.use(jobsRouter);
router.use(estimatesRouter);
router.use(quotesRouter);
router.use(phasesRouter);
router.use(notificationsRouter);
router.use(swmsRouter);
router.use(invoicesRouter);
router.use(financialsRouter);
router.use(dashboardRouter);

export default router;
