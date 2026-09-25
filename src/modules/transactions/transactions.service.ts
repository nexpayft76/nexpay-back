import { transactionsRepository, type CreateTransactionInput } from "./transactions.repository";

export const transactionsService = {
  listTransactions: () => transactionsRepository.findAll(),
  getTransactionById: (id: string) => transactionsRepository.findById(id),
  createTransaction: (input: CreateTransactionInput) => transactionsRepository.create(input),
  deleteTransaction: (id: string) => transactionsRepository.remove(id),
};
