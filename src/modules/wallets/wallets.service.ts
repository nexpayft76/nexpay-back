import { walletsRepository } from "./wallets.repository";

// Las wallets se crean solo en el registro (POST /api/auth/register), junto con sus balances.
export const walletsService = {
  listWallets: () => walletsRepository.findAll(),
  getWalletById: (id: string) => walletsRepository.findById(id),
  getWalletByUserId: (userId: string) => walletsRepository.findByUserId(userId),
};
