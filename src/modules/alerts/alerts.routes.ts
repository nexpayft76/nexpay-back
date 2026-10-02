import { Router } from "express";
import { createAlert, deleteAlert, listAlerts, updateAlert } from "./alerts.controller";
import { validateAlertId, validateCreateAlert, validateUpdateAlert } from "./alerts.middlewares";

export const alertsRouter = Router();

alertsRouter.get("/", listAlerts);
alertsRouter.post("/", validateCreateAlert, createAlert);
alertsRouter.patch("/:id", validateAlertId, validateUpdateAlert, updateAlert);
alertsRouter.delete("/:id", validateAlertId, deleteAlert);