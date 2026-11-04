import { Router, type IRouter } from "express";
import archonRouter from "./archon";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(archonRouter);

export default router;
