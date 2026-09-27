import { withTransaction } from "../../config/db";
import {
  transactionsRepository,
  type CurrencyPurchaseInput,
  type CurrencyPurchaseResult,
} from "./transactions.repository";

export const transactionsService = {
  listTransactions: () => transactionsRepository.findAll(),
  getTransactionById: (id: string) => transactionsRepository.findById(id),
  buyCurrency: (input: CurrencyPurchaseInput): Promise<CurrencyPurchaseResult> =>
    withTransaction((client) => transactionsRepository.buyCurrency(client, input)),
};
