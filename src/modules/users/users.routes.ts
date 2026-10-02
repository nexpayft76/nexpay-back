import { Router } from "express";

import {
  deleteUser,
  getMyPreferences,
  getMyTheme,
  getUser,
  listUsers,
  updateMyPreferences,
  updateMyTheme,
  updateUser,
} from "./users.controller";
import { validatePreferences, validateTheme, validateUpdateUser, validateUserId } from "./users.middlewares";
import { requireAdmin, requireAuth } from "../auth/auth.middlewares";

export const usersRouter = Router();

usersRouter.get("/me/theme", requireAuth, getMyTheme);
usersRouter.patch("/me/theme", requireAuth, validateTheme, updateMyTheme);
usersRouter.get("/me/preferences", requireAuth, getMyPreferences);
usersRouter.patch("/me/preferences", requireAuth, validatePreferences, updateMyPreferences);

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: Obtener todos los usuarios
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Lista de usuarios
 */
usersRouter.get("/", requireAdmin, listUsers);

/**
 * @openapi
 * /api/users/{id}:
 *   get:
 *     summary: Obtener un usuario por id
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: c8c5980c-3200-4510-ad59-039bc76f90e4
 *     responses:
 *       200:
 *         description: Usuario encontrado
 *       404:
 *         description: Usuario no encontrado
 */
usersRouter.get("/:id", requireAdmin, validateUserId, getUser);

/**
 * @openapi
 * /api/users/{id}:
 *   patch:
 *     summary: Actualizar un usuario
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: c8c5980c-3200-4510-ad59-039bc76f90e4
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *               email:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, suspended, closed]
 *     responses:
 *       200:
 *         description: Usuario actualizado
 *       404:
 *         description: Usuario no encontrado
 */
usersRouter.patch("/:id", requireAdmin, validateUserId, validateUpdateUser, updateUser);

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     summary: Eliminar un usuario
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: c8c5980c-3200-4510-ad59-039bc76f90e4
 *     responses:
 *       204:
 *         description: Usuario eliminado
 *       404:
 *         description: Usuario no encontrado
 */
usersRouter.delete("/:id", requireAdmin, validateUserId, deleteUser);
