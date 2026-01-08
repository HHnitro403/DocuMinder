
import { Injectable, signal } from '@angular/core';

export interface DocItem {
  id: string;
  title: string;        // Maps to 'Note' in PB
  details: string;      // Maps to 'NoteObservation' in PB OR 'Observations' collection
  category: string;     // Maps to 'Category' in PB
  expirationDate: string; // Maps to 'expiration_date' in PB
  created: string;
  notified?: boolean;
}

export interface AppConfig {
  usePocketBase: boolean;
  pbUrl: string;
  pbAuthToken: string; // Legacy/Fallback static token
}

@Injectable({
  providedIn: 'root'
})
export class DataService {
  // Hardcoded Schema Collections
  private readonly COL_NOTES = 'Notes';
  private readonly COL_OBSERVATIONS = 'Observations';

  // Signals
  documents = signal<DocItem[]>([]);
  config = signal<AppConfig>({
    usePocketBase: false,
    pbUrl: 'http://127.0.0.1:8090',
    pbAuthToken: ''
  });

  // Token obtained from active login session
  private runtimeToken = signal<string>('');

  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);

  // Timeout for fetch requests (10 seconds)
  private readonly FETCH_TIMEOUT = 10000;

  constructor() {
    this.loadConfig();
    this.loadDocuments();
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

  setRuntimeToken(token: string) {
    this.runtimeToken.set(token);
    // Reload data with new credentials if in PB mode
    if (this.config().usePocketBase) {
      this.loadDocuments();
    }
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
    } catch (e: unknown) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      this.error.set('Failed to load data: ' + errorMessage);
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
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      this.error.set('Failed to save: ' + errorMessage);
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
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      this.error.set('Failed to delete: ' + errorMessage);
    } finally {
      this.isLoading.set(false);
    }
  }

  // --- Connection Test ---
  async testConnection(url: string): Promise<{success: boolean, message: string}> {
    try {
      // PocketBase usually provides a health endpoint
      const response = await this.fetchWithTimeout(`${url}/api/health`);
      if (response.ok) {
        try {
          const data = await response.json();
          return { success: true, message: `Connected! Code: ${data.code}` };
        } catch {
          return { success: true, message: 'Connected (no JSON response)' };
        }
      }
      return { success: false, message: `Server responded with ${response.status}` };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      return { success: false, message: 'Unreachable: ' + message };
    }
  }

  // --- Local Storage Implementation ---

  private loadFromLocal() {
    const data = this.getSafeItem('documinder_data');
    if (data) {
      try {
        this.documents.set(JSON.parse(data));
      } catch (e) {
        console.error('Failed to parse documents from localStorage', e);
        this.documents.set([]);
      }
    } else {
      this.documents.set([]);
    }
  }

  private generateId(): string {
    try {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
      }
    } catch (e) {
      console.warn('crypto.randomUUID() not available, using fallback', e);
    }

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

  // --- PocketBase Implementation ---
  
  // Helper to get the best available token
  private getAuthToken(): string {
      return this.runtimeToken() || this.config().pbAuthToken;
  }

  private async loadFromPocketBase() {
    const { pbUrl } = this.config();
    const token = this.getAuthToken();
    
    // If no token (not logged in and no static token), we can't fetch private data
    if (!token) return;

    // Fetch Notes
    const response = await this.fetchWithTimeout(`${pbUrl}/api/collections/${this.COL_NOTES}/records?sort=-created`, {
      headers: { 'Authorization': token }
    });

    if (!response.ok) throw new Error(`PB Error: ${response.statusText}`);
    const result = await response.json();
    
    // Map PB schema to App schema
    const mappedDocs: DocItem[] = result.items.map((item: any) => ({
      id: item.id,
      title: item.Note || 'Untitled',
      details: item.NoteObservation || '', 
      category: item.Category || 'General',
      expirationDate: item.expiration_date || item.created,
      created: item.created
    }));

    this.documents.set(mappedDocs);
  }

  private async addToPocketBase(doc: Omit<DocItem, 'id' | 'created'>) {
    const { pbUrl } = this.config();
    const token = this.getAuthToken();

    // 1. Create the Note in 'Notes' collection
    const notePayload = {
      Note: doc.title,
      NoteObservation: doc.details,
      Category: doc.category,
      expiration_date: doc.expirationDate,
    };

    const response = await this.fetchWithTimeout(`${pbUrl}/api/collections/${this.COL_NOTES}/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token
      },
      body: JSON.stringify(notePayload)
    });

    if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
            const err = await response.json();
            errorMessage = JSON.stringify(err);
        } catch {
            // Response is not JSON, use status text
        }
        throw new Error(errorMessage);
    }

    const newNote = await response.json();

    // 2. Create the Observation in 'Observations' collection (Linking tables)
    // We attempt to create a record in the Observations table that links back to the Note
    // This ensures all 3 tables (users, Notes, Observations) are utilized.
    try {
        const obsPayload = {
            note_id: newNote.id,
            details: doc.details,
            // Assuming the schema might simply default these or they are optional
        };

        const obsResponse = await this.fetchWithTimeout(`${pbUrl}/api/collections/${this.COL_OBSERVATIONS}/records`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify(obsPayload)
        });

        if (!obsResponse.ok) {
            let errorDetails = `HTTP ${obsResponse.status}`;
            try {
                const errData = await obsResponse.json();
                errorDetails = JSON.stringify(errData);
            } catch {
                // Not JSON, use status
            }
            console.error('Failed to write to Observations table. Schema verification needed.', errorDetails);
        }
        // We don't fail the whole operation if this secondary write fails (e.g. if schema differs slightly)
    } catch (obsErr) {
        console.error('Could not write to Observations table. Network or configuration error.', obsErr);
    }
  }

  private async deleteFromPocketBase(id: string) {
    const { pbUrl } = this.config();
    const token = this.getAuthToken();
    
    const response = await this.fetchWithTimeout(`${pbUrl}/api/collections/${this.COL_NOTES}/records/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': token
      }
    });

    if (!response.ok) throw new Error('Failed to delete from PB');
  }
}
