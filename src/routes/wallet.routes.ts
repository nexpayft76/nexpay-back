import { Router } from "express";
import * as walletController from "../controllers/wallet.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validateBody } from "../middlewares/validate.middleware";
import { depositSchema } from "../schemas/wallet.schema";

export const walletRouter = Router();

walletRouter.get("/", requireAuth, walletController.getMyWallet);
walletRouter.post("/deposits", requireAuth, validateBody(depositSchema), walletController.deposit);
