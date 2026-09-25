import { Router } from "express";
import * as walletController from "../controllers/wallet.controller";
import { requireAuth } from "../middlewares/auth.middleware";

export const walletRouter = Router();

walletRouter.get("/", requireAuth, walletController.getMyWallet);
