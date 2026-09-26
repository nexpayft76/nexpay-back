import { usersRepository, type UpdateUserInput } from "./users.repository";

export const usersService = {
  listUsers: () => usersRepository.findAll(),
  getUserById: (id: string) => usersRepository.findById(id),
  updateUser: (id: string, input: UpdateUserInput) => usersRepository.update(id, input),
  deleteUser: (id: string) => usersRepository.remove(id),
};
