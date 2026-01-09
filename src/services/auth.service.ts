
import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DataService } from './data.service';

interface UserData {
  username: string;
  role: string;
  id: string;
  email?: string;
  name?: string;
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

  // Timeout for fetch requests (10 seconds)
  private readonly FETCH_TIMEOUT = 10000;

  constructor() {
    // Check session storage to persist login across reloads
    this.restoreSession();
  }

  // Helper to add timeout to fetch requests
  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout: Server did not respond in time');
      }
      throw error;
    }
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

  async login(email: string, pass: string): Promise<boolean> {
    const config = this.dataService.config();

    if (config.usePocketBase) {
      return await this.loginPocketBase(email, pass, config.pbUrl);
    } else {
      return this.loginLocal(email, pass);
    }
  }

  private async loginPocketBase(identity: string, pass: string, url: string): Promise<boolean> {
    try {
      // In PocketBase, the 'identity' field for auth-with-password can be the email
      const response = await this.fetchWithTimeout(`${url}/api/collections/users/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, password: pass })
      });

      if (!response.ok) return false;

      const data = await response.json();

      // Validate response structure
      if (!data || !data.record || !data.record.id) {
        console.error('Invalid PocketBase auth response structure', data);
        return false;
      }

      const record = data.record;

      const userData: UserData = {
        id: record.id,
        // Fallback: If username field is empty/missing, use name or email
        username: record.username || record.name || record.email || 'Unknown User',
        email: record.email || '',
        name: record.name || '',
        role: record.Role || record.role || 'user' // Try both 'Role' and 'role' fields
      };

      this.saveSession(userData, data.token || '');
      return true;
    } catch (e) {
      console.error('Login error', e);
      return false;
    }
  }

  private loginLocal(email: string, pass: string): boolean {
    // Local fallback for offline/demo mode
    if (email === 'docuser@docuser.com' && pass === 'docuser') {
      const userData: UserData = {
        id: 'local-admin',
        username: 'Local Admin',
        email: email,
        role: 'admin'
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
    } catch (e) {
      console.warn(`Failed to save session item: ${key}`, e);
    }
  }

  private removeSessionItem(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch (e) {
      console.warn(`Failed to remove session item: ${key}`, e);
    }
  }
}
