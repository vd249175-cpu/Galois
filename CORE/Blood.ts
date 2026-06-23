import { useState, useEffect, useRef } from 'react';

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

  public getRawState(): Record<string, any> {
    return this.state;
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
 *
 * Safety guarantees:
 * - No setState during render phase (React 19 compliant)
 * - All mutable references via useRef to avoid stale closures
 * - isMounted guard prevents updates on unmounted components
 */
export function useBloodChannel<T>(channels: string[], getValueFn: () => T): T {
  // Always keep refs up to date during render (safe; refs are NOT state)
  const channelsRef = useRef(channels);
  const getValueFnRef = useRef(getValueFn);
  channelsRef.current = channels;
  getValueFnRef.current = getValueFn;

  const channelsKey = channels.join(',');
  const [value, setValue] = useState<T>(() => getValueFn());

  // Re-read value when channel list itself changes
  useEffect(() => {
    setValue(getValueFnRef.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelsKey]);

  // Subscribe to Blood broadcast for channel-specific updates
  useEffect(() => {
    let isMounted = true;

    const checkUpdates = (changedChannels: Set<string>) => {
      if (!isMounted) return;
      const relevant = channelsRef.current.some(
        (ch) =>
          changedChannels.has(ch) ||
          Array.from(changedChannels).some((cc) => cc.startsWith(ch))
      );
      if (relevant) {
        setValue(getValueFnRef.current());
      }
    };

    const unsubscribe = Blood.subscribe(checkUpdates);
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []); // intentionally stable — all dynamic access via refs

  return value;
}
