import { getRateSnapshot } from "../rates/rates.service";
import { logger } from "../../utils/logger";
import { alertsService } from "./alerts.service";

export function startRateAlertMonitor(intervalMs = 60_000): () => void {
  let evaluating = false;

  const evaluate = async () => {
    if (evaluating) return;
    evaluating = true;
    try {
      const snapshot = await getRateSnapshot();
      await alertsService.evaluateRateRules(snapshot);
    } catch (error) {
      logger.error("No se pudieron revisar las alertas de tasas", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      evaluating = false;
    }
  };

  const timer = setInterval(() => void evaluate(), intervalMs);
  timer.unref();
  void evaluate();

  return () => clearInterval(timer);
}