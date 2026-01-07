
import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  isLoggedIn = signal<boolean>(false);
  currentUser = signal<string | null>(null);

  constructor(private router: Router) {
    // Check session storage to persist login across reloads if desired
    const savedUser = this.getSessionItem('documinder_user');
    if (savedUser) {
      this.isLoggedIn.set(true);
      this.currentUser.set(savedUser);
    }
  }

  login(user: string, pass: string): boolean {
    // Hardcoded credentials as requested
    if (user === 'docuser' && pass === 'docuser') {
      this.isLoggedIn.set(true);
      this.currentUser.set(user);
      this.setSessionItem('documinder_user', user);
      this.router.navigate(['/dashboard']);
      return true;
    }
    return false;
  }

  logout() {
    this.isLoggedIn.set(false);
    this.currentUser.set(null);
    this.removeSessionItem('documinder_user');
    this.router.navigate(['/login']);
  }

  // --- Safe Storage Wrappers ---

  private getSessionItem(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      console.warn('SessionStorage access blocked. Session will be volatile.', e);
      return null;
    }
  }

  private setSessionItem(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch (e) {
      console.warn('SessionStorage write blocked.', e);
    }
  }

  private removeSessionItem(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch (e) {
      console.warn('SessionStorage remove blocked.', e);
    }
  }
}
