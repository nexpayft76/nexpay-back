import { walletsRepository, type CreateWalletInput } from "./wallets.repository";

export const walletsService = {
  listWallets: () => walletsRepository.findAll(),
  getWalletById: (id: string) => walletsRepository.findById(id),
  getWalletByUserId: (userId: string) => walletsRepository.findByUserId(userId),
  createWallet: (input: CreateWalletInput) => walletsRepository.create(input),
};
