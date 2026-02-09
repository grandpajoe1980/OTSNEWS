import { User } from '../types';
import * as api from './api';

export const login = async (email: string, password: string): Promise<User> => {
  return api.loginUser(email, password);
};
