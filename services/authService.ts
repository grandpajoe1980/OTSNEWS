import { User } from '../types';
import { MOCK_USERS } from '../constants';

export const login = (roleId: string): User | undefined => {
  return MOCK_USERS.find(u => u.id === roleId);
};
