import { Router } from "express";

import { createUser, deleteUser, getUser, listUsers, updateUser } from "./users.controller";
import { validateCreateUser, validateUpdateUser, validateUserId } from "./users.middlewares";

export const usersRouter = Router();

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
usersRouter.get("/", listUsers);

/**
 * @openapi
 * /api/users:
 *   post:
 *     summary: Crear un usuario
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, email, password_hash]
 *             properties:
 *               full_name:
 *                 type: string
 *               email:
 *                 type: string
 *               password_hash:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive, closed]
 *     responses:
 *       201:
 *         description: Usuario creado
 */
usersRouter.post("/", validateCreateUser, createUser);

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
usersRouter.get("/:id", validateUserId, getUser);

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
 *               password_hash:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive, closed]
 *     responses:
 *       200:
 *         description: Usuario actualizado
 *       404:
 *         description: Usuario no encontrado
 */
usersRouter.patch("/:id", validateUserId, validateUpdateUser, updateUser);

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
usersRouter.delete("/:id", validateUserId, deleteUser);
