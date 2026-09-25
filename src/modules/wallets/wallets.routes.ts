import { Router } from "express";

import { createWallet, deleteWallet, getWallet, getWalletByUser, listWallets } from "./wallets.controller";

export const walletsRouter = Router();

walletsRouter.get("/", listWallets);
walletsRouter.get("/user/:userId", getWalletByUser);
walletsRouter.get("/:id", getWallet);
walletsRouter.post("/", createWallet);
walletsRouter.delete("/:id", deleteWallet);
