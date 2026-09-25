import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validateBody } from "../middlewares/validate.middleware";
import { googleLoginSchema, loginSchema, registerSchema } from "../schemas/auth.schema";

export const authRouter = Router();

authRouter.post("/register", validateBody(registerSchema), authController.register);
authRouter.post("/login", validateBody(loginSchema), authController.login);
authRouter.post("/google", validateBody(googleLoginSchema), authController.loginWithGoogle);
authRouter.post("/logout", requireAuth, authController.logout);
authRouter.get("/me", requireAuth, authController.me);
