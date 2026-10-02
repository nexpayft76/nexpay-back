import { usersRepository, type UpdateUserInput, type UserTheme } from "./users.repository";

export const usersService = {
  listUsers: () => usersRepository.findAll(),
  getUserById: (id: string) => usersRepository.findById(id),
  getThemeById: (id: string) => usersRepository.getThemeById(id),
  getPreferencesById: (id: string) => usersRepository.getPreferencesById(id),
  updateUser: (id: string, input: UpdateUserInput) => usersRepository.update(id, input),
  deleteUser: (id: string) => usersRepository.remove(id),
  updateTheme: (id: string, theme: UserTheme) => usersRepository.updateTheme(id, theme),
  updatePreferences: (id: string, input: Partial<{ theme: UserTheme; in_app_notifications: boolean; email_notifications: boolean }>) =>
    usersRepository.updatePreferences(id, input),
};
