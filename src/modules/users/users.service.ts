import { usersRepository, type UpdateUserInput, type UserTheme } from "./users.repository";

export const usersService = {
  listUsers: () => usersRepository.findAll(),
  getUserById: (id: string) => usersRepository.findById(id),
  updateUser: (id: string, input: UpdateUserInput) => usersRepository.update(id, input),
  deleteUser: (id: string) => usersRepository.remove(id),
  updateTheme: (id: string, theme: UserTheme) => usersRepository.updateTheme(id, theme),
};
