import { currenciesRepository, type CreateCurrencyInput, type UpdateCurrencyInput } from "./currencies.repository";

export const currenciesService = {
  listCurrencies: () => currenciesRepository.findAll(),
  getCurrencyByCode: (code: string) => currenciesRepository.findByCode(code),
  createCurrency: (input: CreateCurrencyInput) => currenciesRepository.create(input),
  updateCurrency: (code: string, input: UpdateCurrencyInput) => currenciesRepository.update(code, input),
  deleteCurrency: (code: string) => currenciesRepository.remove(code),
};
