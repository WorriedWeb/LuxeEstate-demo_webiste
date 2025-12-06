import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole, AgentStatus } from '../types';
import { MOCK_USERS, MOCK_AGENTS } from '../constants';
import { mockService } from './mockService';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check local storage for persistent auth
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        // Verify if user is still allowed to login (re-check status on refresh)
        checkUserStatus(parsedUser).then(validUser => {
            if (validUser) setUser(validUser);
            else {
                localStorage.removeItem('user');
                setUser(null);
            }
        });
      } catch (e) {
        localStorage.removeItem('user');
      }
    }
    setIsLoading(false);
  }, []);

  const checkUserStatus = async (user: User): Promise<User | null> => {
      // Logic to re-validate user from "DB"
      const agents = await mockService.getAgents(true);
      const foundAgent = agents.find(a => a.id === user.id);
      
      if (foundAgent && foundAgent.status === AgentStatus.BLOCKED) {
          return null;
      }
      return user;
  };

  const login = async (email: string, password: string): Promise<User> => {
    // Simulate API call
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        const allAgents = await mockService.getAgents(true);
        const users = await mockService.getUsers();
        
        // 1. Check Admin
        if (email.toLowerCase() === 'admin@example.com' && password === 'Admin123') {
           const admin = MOCK_USERS.find(u => u.role === UserRole.ADMIN) || MOCK_USERS[0];
           setUser(admin);
           localStorage.setItem('user', JSON.stringify(admin));
           resolve(admin);
           return;
        }

        // 2. Check Agents (Dynamic from Service)
        const foundAgent = allAgents.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (foundAgent) {
            if (foundAgent.status === AgentStatus.BLOCKED) {
                reject(new Error('Your account has been suspended. Please contact administration.'));
                return;
            }
            
            // Check provided password or fallback to default for legacy mock agents
            const validPassword = foundAgent.password || 'Agent123';
            
            if (password === validPassword) { 
                setUser(foundAgent);
                localStorage.setItem('user', JSON.stringify(foundAgent));
                resolve(foundAgent);
                return;
            }
        }

        // 3. Check Users
        const foundUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (foundUser) {
          setUser(foundUser);
          localStorage.setItem('user', JSON.stringify(foundUser));
          resolve(foundUser);
        } else {
          reject(new Error('Invalid credentials'));
        }
      }, 600);
    });
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};