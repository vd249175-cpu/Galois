import { useState, useEffect, useCallback } from 'react';

type Listener = (changedKeys: Set<string>) => void;

class BloodClass {
  private state: Record<string, any> = {};
  private listeners: Set<Listener> = new Set();
  private isSyncing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const setup = () => this.initSync();
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setup();
      } else {
        window.addEventListener('DOMContentLoaded', setup);
      }
    }
  }

  private async initSync() {
    const api = (window as any).electronAPI;
    if (!api || !api.getBloodState) return;

    try {
      const initialState = await api.getBloodState();
      this.isSyncing = true;
      this.update(initialState, false); // update locally, do not sync back to main
      this.isSyncing = false;
    } catch (e) {
      console.error('[Blood] Failed to get initial state:', e);
    }

    api.onBloodStateChanged((values: Record<string, any>) => {
      this.isSyncing = true;
      this.update(values, false); // update locally, do not sync back to main
      this.isSyncing = false;
    });
  }

  public getValue<T>(key: string, defaultValue: T): T {
    return this.state[key] !== undefined ? (this.state[key] as T) : defaultValue;
  }

  public update(values: Record<string, any>, sync: boolean = true): void {
    const modified = new Set<string>();
    const changedValues: Record<string, any> = {};

    for (const [key, value] of Object.entries(values)) {
      if (this.state[key] !== value) {
        this.state[key] = value;
        modified.add(key);
        changedValues[key] = value;
      }
    }

    if (modified.size > 0) {
      this.listeners.forEach((listener) => listener(modified));

      if (sync && !this.isSyncing) {
        const api = (window as any).electronAPI;
        if (api && api.updateBloodState) {
          api.updateBloodState(changedValues).catch((err: any) => {
            console.error('[Blood] Failed to sync update:', err);
          });
        }
      }
    }
  }

  public updateKey(key: string, value: any): void {
    this.update({ [key]: value });
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const Blood = new BloodClass();

/**
 * **useBloodChannel** (器官抗体): React hook that observes specific state channels
 * and triggers a re-render of the host component only if observed channels are mutated.
 */
export function useBloodChannel<T>(channels: string[], getValueFn: () => T): T {
  const [value, setValue] = useState<T>(getValueFn);

  const checkUpdates = useCallback((changedChannels: Set<string>) => {
    const matches = channels.some((ch) => {
      // Support exact matches or prefix matches (e.g., layout.removeArea.)
      return (
        changedChannels.has(ch) ||
        Array.from(changedChannels).some((cc) => cc.startsWith(ch))
      );
    });
    if (matches) {
      setValue(getValueFn());
    }
  }, [channels, getValueFn]);

  useEffect(() => {
    const unsubscribe = Blood.subscribe(checkUpdates);
    return unsubscribe;
  }, [checkUpdates]);

  return value;
}
