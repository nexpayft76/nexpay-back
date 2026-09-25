import { balancesRepository, type CreateBalanceInput, type UpdateBalanceInput } from "./balances.repository";

export const balancesService = {
  listBalances: () => balancesRepository.findAll(),
  getBalanceById: (id: string) => balancesRepository.findById(id),
  getBalanceByWalletAndCurrency: (walletId: string, currencyCode: string) =>
    balancesRepository.findByWalletAndCurrency(walletId, currencyCode),
  createBalance: (input: CreateBalanceInput) => balancesRepository.create(input),
  updateBalance: (id: string, input: UpdateBalanceInput) => balancesRepository.update(id, input),
  deleteBalance: (id: string) => balancesRepository.remove(id),
};
