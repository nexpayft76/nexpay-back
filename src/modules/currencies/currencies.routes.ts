import { Router } from "express";

import { createCurrency, deleteCurrency, getCurrency, listCurrencies, updateCurrency } from "./currencies.controller";

export const currenciesRouter = Router();

currenciesRouter.get("/", listCurrencies);
currenciesRouter.get("/:code", getCurrency);
currenciesRouter.post("/", createCurrency);
currenciesRouter.patch("/:code", updateCurrency);
currenciesRouter.delete("/:code", deleteCurrency);
