
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
  pbAuthToken: string;
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
    try {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
      }
    } catch { }

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

  private async loadFromPocketBase() {
    const { pbUrl, pbAuthToken } = this.config();
    
    // Fetch Notes (Main Collection)
    // We attempt to expand 'Observations' if a relation exists, but will also rely on flat fields
    // Assuming 'Notes' collection has fields: Note, NoteObservation, Category, expiration_date
    const response = await fetch(`${pbUrl}/api/collections/${this.COL_NOTES}/records?sort=-created`, {
      headers: {
        'Authorization': pbAuthToken
      }
    });

    if (!response.ok) throw new Error(`PB Error: ${response.statusText}`);

    const result = await response.json();
    
    // Map PB schema to App schema
    const mappedDocs: DocItem[] = result.items.map((item: any) => ({
      id: item.id,
      title: item.Note || 'Untitled',
      // Priority: Check if there is an expanded observation, otherwise use the text field in the Note itself
      details: item.NoteObservation || '', 
      category: item.Category || 'General',
      expirationDate: item.expiration_date || item.created,
      created: item.created
    }));

    this.documents.set(mappedDocs);
  }

  private async addToPocketBase(doc: Omit<DocItem, 'id' | 'created'>) {
    const { pbUrl, pbAuthToken } = this.config();

    // 1. Create the Note in 'Notes' collection
    const notePayload = {
      Note: doc.title,
      NoteObservation: doc.details, // Storing in Notes table for now as per schema image
      Category: doc.category,
      expiration_date: doc.expirationDate,
    };

    const response = await fetch(`${pbUrl}/api/collections/${this.COL_NOTES}/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': pbAuthToken
      },
      body: JSON.stringify(notePayload)
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(JSON.stringify(err));
    }

    // Optional: If we were fully using the 'Observations' collection as a separate entity:
    // We would take the response.id (new note ID) and create a record in 'Observations'
    // pointing to it. For now, we respect the image schema which has 'NoteObservation' in 'Notes'.
  }

  private async deleteFromPocketBase(id: string) {
    const { pbUrl, pbAuthToken } = this.config();
    
    // Delete from Notes
    const response = await fetch(`${pbUrl}/api/collections/${this.COL_NOTES}/records/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': pbAuthToken
      }
    });

    if (!response.ok) throw new Error('Failed to delete from PB');
  }
}
