import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import clientsRouter from "./clients";
import jobsRouter from "./jobs";
import estimatesRouter from "./estimates";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(clientsRouter);
router.use(jobsRouter);
router.use(estimatesRouter);
router.use(dashboardRouter);

export default router;
