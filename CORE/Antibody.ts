import { useEffect, useRef } from 'react';
import { Blood } from './Blood';

export interface AntibodyListener {
  /** The specific Blood key to monitor (e.g. `actions.editor.save.${areaId}`) */
  key: string;
  /** Condition checking function (e.g. `val => val === true`) */
  condition: (val: any) => boolean;
  /** Callback triggered when the condition is met */
  action: (val: any) => void | Promise<void>;
  /** Optional value to reset the key to in Blood state after execution (e.g. `false`) */
  autoResetValue?: any;
}

/**
 * React Hook acting as the biomimetic antibody receptor for organs.
 * It observes Blood updates, matches registered triggers, executes actions, and resets keys.
 */
export function useOrganAntibody(listeners: AntibodyListener[]) {
  const listenersRef = useRef(listeners);
  listenersRef.current = listeners;

  useEffect(() => {
    const unsubscribe = Blood.subscribe((changedKeys) => {
      listenersRef.current.forEach((listener) => {
        if (changedKeys.has(listener.key)) {
          const value = Blood.getValue(listener.key, undefined);
          if (listener.condition(value)) {
            console.log(`[Antibody] Trigger matched for key: ${listener.key}. Executing action.`);
            const res = listener.action(value);
            
            if (listener.autoResetValue !== undefined) {
              if (res instanceof Promise) {
                res.then(() => {
                  Blood.updateKey(listener.key, listener.autoResetValue);
                }).catch((err) => {
                  console.error(`[Antibody] Action failed for key ${listener.key}:`, err);
                  Blood.updateKey(listener.key, listener.autoResetValue);
                });
              } else {
                Blood.updateKey(listener.key, listener.autoResetValue);
              }
            }
          }
        }
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);
}
