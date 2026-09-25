import type { Request, Response } from "express";
import { pool } from "../config/db";

export async function getHealth(_req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM currencies");
    res.status(200).json({
      status: "ok",
      database: "connected",
      currencies: Number(rows[0]?.count ?? 0),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Health check falló:", err instanceof Error ? err.message : err);
    res.status(503).json({ status: "error", database: "disconnected" });
  }
}
