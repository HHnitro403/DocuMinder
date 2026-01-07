
import { Injectable, signal, computed } from '@angular/core';

export interface DocItem {
  id: string;
  title: string; // Maps to 'Note' in PB Schema
  details: string; // Maps to 'NoteObservation' in PB Schema
  expirationDate: string; // ISO Date String. Needs 'expiration_date' column in PB
  created: string;
  notified?: boolean;
}

export interface AppConfig {
  usePocketBase: boolean;
  pbUrl: string;
  pbCollection: string;
  pbAuthToken: string; // Simplified for this demo (usually stored securely)
}

@Injectable({
  providedIn: 'root'
})
export class DataService {
  // Signals
  documents = signal<DocItem[]>([]);
  config = signal<AppConfig>({
    usePocketBase: false,
    pbUrl: 'http://127.0.0.1:8090',
    pbCollection: 'notes',
    pbAuthToken: ''
  });

  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);

  constructor() {
    this.loadConfig();
    this.loadDocuments();
  }

  // --- Safe Storage Wrappers ---

  private getSafeItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn(`Storage access blocked for ${key}. App will run in volatile mode.`, e);
      return null;
    }
  }

  private setSafeItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`Storage write blocked for ${key}.`, e);
    }
  }

  // --- Configuration Management ---
  private loadConfig() {
    const savedConfig = this.getSafeItem('documinder_config');
    if (savedConfig) {
      try {
        this.config.set(JSON.parse(savedConfig));
      } catch (e) {
        console.error('Config parse error', e);
      }
    }
  }

  saveConfig(newConfig: AppConfig) {
    this.config.set(newConfig);
    this.setSafeItem('documinder_config', JSON.stringify(newConfig));
    this.loadDocuments(); // Reload data based on new config
  }

  // --- Data Operations ---

  async loadDocuments() {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      if (this.config().usePocketBase) {
        await this.loadFromPocketBase();
      } else {
        this.loadFromLocal();
      }
    } catch (e: any) {
      console.error(e);
      this.error.set('Failed to load data: ' + (e.message || 'Unknown error'));
      // Fallback to empty if failed
      if (this.documents().length === 0) this.documents.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async addDocument(doc: Omit<DocItem, 'id' | 'created'>) {
    this.isLoading.set(true);
    try {
      if (this.config().usePocketBase) {
        await this.addToPocketBase(doc);
      } else {
        this.addToLocal(doc);
      }
      await this.loadDocuments(); // Refresh
    } catch (e: any) {
      this.error.set('Failed to save: ' + e.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteDocument(id: string) {
    this.isLoading.set(true);
    try {
      if (this.config().usePocketBase) {
        await this.deleteFromPocketBase(id);
      } else {
        this.deleteFromLocal(id);
      }
      await this.loadDocuments();
    } catch (e: any) {
      this.error.set('Failed to delete: ' + e.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  // --- Local Storage Implementation ---

  private loadFromLocal() {
    const data = this.getSafeItem('documinder_data');
    if (data) {
      try {
        this.documents.set(JSON.parse(data));
      } catch {
        this.documents.set([]);
      }
    } else {
      this.documents.set([]);
    }
  }

  private generateId(): string {
    // Try secure UUID first, fall back to random string if environment is insecure
    try {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
      }
    } catch {
      // Ignore SecurityError
    }

    // Fallback UUID v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private addToLocal(doc: Omit<DocItem, 'id' | 'created'>) {
    const newDoc: DocItem = {
      ...doc,
      id: this.generateId(),
      created: new Date().toISOString()
    };
    const current = this.documents();
    const updated = [newDoc, ...current];
    this.documents.set(updated);
    this.setSafeItem('documinder_data', JSON.stringify(updated));
  }

  private deleteFromLocal(id: string) {
    const updated = this.documents().filter(d => d.id !== id);
    this.documents.set(updated);
    this.setSafeItem('documinder_data', JSON.stringify(updated));
  }

  // --- PocketBase Implementation (Fetch wrapper) ---

  private async loadFromPocketBase() {
    const { pbUrl, pbCollection, pbAuthToken } = this.config();
    // Using standard fetch to avoid dependencies. 
    // Assumes 'notes' collection has 'Note' (title), 'NoteObservation' (details), and 'expiration_date' (date)
    
    const response = await fetch(`${pbUrl}/api/collections/${pbCollection}/records?sort=-created`, {
      headers: {
        'Authorization': pbAuthToken
      }
    });

    if (!response.ok) throw new Error(`PB Error: ${response.statusText}`);

    const result = await response.json();
    
    // Map PB schema to App schema
    const mappedDocs: DocItem[] = result.items.map((item: any) => ({
      id: item.id,
      title: item.Note || 'Untitled', // Mapping from user schema
      details: item.NoteObservation || '', // Mapping from user schema
      expirationDate: item.expiration_date || item.created, // Fallback if schema doesn't match
      created: item.created
    }));

    this.documents.set(mappedDocs);
  }

  private async addToPocketBase(doc: Omit<DocItem, 'id' | 'created'>) {
    const { pbUrl, pbCollection, pbAuthToken } = this.config();

    // Mapping App schema to PB schema
    const payload = {
      Note: doc.title,
      NoteObservation: doc.details,
      expiration_date: doc.expirationDate,
      // UserID would be handled by PB auth context usually, or we pass it if we have it
    };

    const response = await fetch(`${pbUrl}/api/collections/${pbCollection}/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': pbAuthToken
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(JSON.stringify(err));
    }
  }

  private async deleteFromPocketBase(id: string) {
    const { pbUrl, pbCollection, pbAuthToken } = this.config();
    const response = await fetch(`${pbUrl}/api/collections/${pbCollection}/records/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': pbAuthToken
      }
    });

    if (!response.ok) throw new Error('Failed to delete from PB');
  }
}
