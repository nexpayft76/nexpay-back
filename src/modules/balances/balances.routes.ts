import { Router } from "express";

import { createBalance, deleteBalance, getBalance, getBalanceByWalletCurrency, listBalances, updateBalance } from "./balances.controller";

export const balancesRouter = Router();

balancesRouter.get("/", listBalances);
balancesRouter.get("/wallet/:walletId/currency/:currencyCode", getBalanceByWalletCurrency);
balancesRouter.get("/:id", getBalance);
balancesRouter.post("/", createBalance);
balancesRouter.patch("/:id", updateBalance);
balancesRouter.delete("/:id", deleteBalance);
