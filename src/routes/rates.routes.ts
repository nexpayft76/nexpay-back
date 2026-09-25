import { Router } from "express";
import * as ratesController from "../controllers/rates.controller";

export const ratesRouter = Router();

ratesRouter.get("/", ratesController.getRates);
ratesRouter.get("/convert", ratesController.convert);
