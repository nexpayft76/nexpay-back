import { usersRepository, type CreateUserInput, type UpdateUserInput } from "./users.repository";

export const usersService = {
  listUsers: () => usersRepository.findAll(),
  getUserById: (id: string) => usersRepository.findById(id),
  createUser: (input: CreateUserInput) => usersRepository.create(input),
  updateUser: (id: string, input: UpdateUserInput) => usersRepository.update(id, input),
  deleteUser: (id: string) => usersRepository.remove(id),
};
