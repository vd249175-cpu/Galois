import { useState, useEffect, useCallback } from 'react';

type Listener = (changedKeys: Set<string>) => void;

class BloodClass {
  private state: Record<string, any> = {};
  private listeners: Set<Listener> = new Set();

  public getValue<T>(key: string, defaultValue: T): T {
    return this.state[key] !== undefined ? (this.state[key] as T) : defaultValue;
  }

  public update(values: Record<string, any>): void {
    const modified = new Set<string>();
    for (const [key, value] of Object.entries(values)) {
      this.state[key] = value;
      modified.add(key);
    }
    if (modified.size > 0) {
      this.listeners.forEach((listener) => listener(modified));
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
