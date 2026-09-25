import { Router } from "express";

import { createUser, deleteUser, getUser, listUsers, updateUser } from "./users.controller";

export const usersRouter = Router();

usersRouter.get("/", listUsers);
usersRouter.get("/:id", getUser);
usersRouter.post("/", createUser);
usersRouter.patch("/:id", updateUser);
usersRouter.delete("/:id", deleteUser);
