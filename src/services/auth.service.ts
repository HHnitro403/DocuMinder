
import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DataService } from './data.service';

interface UserData {
  username: string;
  role: string;
  id: string;
  email?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  dataService = inject(DataService);
  router = inject(Router);

  isLoggedIn = signal<boolean>(false);
  currentUser = signal<UserData | null>(null);
  isAdmin = signal<boolean>(false);

  constructor() {
    // Check session storage to persist login across reloads
    this.restoreSession();
  }

  private restoreSession() {
    const savedUserStr = this.getSessionItem('documinder_user');
    const savedToken = this.getSessionItem('documinder_token');

    if (savedUserStr) {
      try {
        const user: UserData = JSON.parse(savedUserStr);
        this.setInternalState(user, savedToken || '');
      } catch (e) {
        this.logout();
      }
    }
  }

  async login(user: string, pass: string): Promise<boolean> {
    const config = this.dataService.config();

    if (config.usePocketBase) {
      return await this.loginPocketBase(user, pass, config.pbUrl);
    } else {
      return this.loginLocal(user, pass);
    }
  }

  private async loginPocketBase(identity: string, pass: string, url: string): Promise<boolean> {
    try {
      const response = await fetch(`${url}/api/collections/users/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, password: pass })
      });

      if (!response.ok) return false;

      const data = await response.json();
      const record = data.record;
      
      const userData: UserData = {
        id: record.id,
        username: record.username || record.email,
        email: record.email,
        role: record.Role || 'user' // Mapping 'Role' field from PB (Case Sensitive!)
      };

      this.saveSession(userData, data.token);
      return true;
    } catch (e) {
      console.error('Login error', e);
      return false;
    }
  }

  private loginLocal(user: string, pass: string): boolean {
    if (user === 'docuser' && pass === 'docuser') {
      const userData: UserData = {
        id: 'local-admin',
        username: 'docuser',
        role: 'admin' // Local default user is always admin
      };
      this.saveSession(userData, '');
      return true;
    }
    return false;
  }

  logout() {
    this.isLoggedIn.set(false);
    this.currentUser.set(null);
    this.isAdmin.set(false);
    this.dataService.setRuntimeToken(''); // Clear token in data service
    
    this.removeSessionItem('documinder_user');
    this.removeSessionItem('documinder_token');
    
    this.router.navigate(['/login']);
  }

  // --- State & Storage Helpers ---

  private saveSession(user: UserData, token: string) {
    this.setInternalState(user, token);
    
    this.setSessionItem('documinder_user', JSON.stringify(user));
    if (token) {
      this.setSessionItem('documinder_token', token);
    }
    
    this.router.navigate(['/dashboard']);
  }

  private setInternalState(user: UserData, token: string) {
    this.isLoggedIn.set(true);
    this.currentUser.set(user);
    // Role check: supports 'admin' (lowercase) or 'Admin' just in case, but PB screenshot showed lowercase options
    this.isAdmin.set(user.role.toLowerCase() === 'admin');
    
    if (token) {
      this.dataService.setRuntimeToken(token);
    }
  }

  private getSessionItem(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  private setSessionItem(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch (e) { }
  }

  private removeSessionItem(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch (e) { }
  }
}
