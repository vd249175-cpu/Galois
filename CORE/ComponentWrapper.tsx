import React, { useEffect, useMemo, useRef } from 'react';
import { Blood, useBloodChannel } from './Blood';
import { ActionRegistry } from './ActionRegistry';

export function ComponentWrapper({
  areaId,
  currentComponent,
}: {
  areaId: string;
  currentComponent: any;
}) {
  const dataChannels: string[] = useMemo(() => {
    const channels = typeof currentComponent.bloodChannels === 'function'
      ? currentComponent.bloodChannels(areaId)
      : (currentComponent.bloodChannels || []);
    return channels;
  }, [currentComponent.bloodChannels, areaId]);

  const stateValues = useBloodChannel(dataChannels, () => {
    const val: Record<string, any> = {};
    const allState = Blood.getRawState() || {};
    dataChannels.forEach(ch => {
      if (ch.endsWith('.') || ch.endsWith(':')) {
        const subMap: Record<string, any> = {};
        Object.keys(allState).forEach(key => {
          if (key.startsWith(ch)) {
            subMap[key] = allState[key];
            val[key] = allState[key];
          }
        });
        val[ch] = subMap;
      } else {
        val[ch] = Blood.getValue(ch, undefined);
      }
    });
    return val;
  });

  const [lastAction, setLastAction] = React.useState<{ id: string; timestamp: number } | null>(null);
  const areaIdRef = useRef(areaId);
  areaIdRef.current = areaId;
  const componentActionsRef = useRef(currentComponent.actions);
  componentActionsRef.current = currentComponent.actions;

  useEffect(() => {
    const unsubscribe = Blood.subscribe((changedKeys) => {
      const myActions: string[] = (componentActionsRef.current || []).map(
        (act: any) => `actions.${act.id}.${areaIdRef.current}`
      );
      changedKeys.forEach(key => {
        if (!key.startsWith('actions.')) return;
        const withoutPrefix = key.slice('actions.'.length);
        if (!withoutPrefix.endsWith(`.${areaIdRef.current}`)) return;
        const actionId = withoutPrefix.slice(0, -(`.${areaIdRef.current}`.length));
        const isStaticAction = myActions.includes(key);
        const isDynamicAction = (currentComponent.dynamicActionPrefixes || []).some(
          (prefix: string) => actionId.startsWith(prefix)
        );
        if (!isStaticAction && !isDynamicAction) return;
        const ts = Blood.getValue<number | undefined>(key, undefined);
        if (ts === undefined || ts === null) return;
        Blood.updateKey(key, undefined);
        setLastAction({ id: actionId, timestamp: ts });
        setTimeout(() => setLastAction(null), 50);
      });
    });
    return unsubscribe;
  }, []);

  const shortcutAPI = {
    getAllActions: () => ActionRegistry.getAllActions(),
    getShortcutForAction: (actionId: string) => ActionRegistry.getShortcutForAction(actionId),
    registerShortcut: (actionId: string, combo: string) => ActionRegistry.registerShortcut(combo, actionId),
    removeShortcutForAction: (actionId: string) => ActionRegistry.removeShortcutForAction(actionId),
    serializeShortcuts: () => ActionRegistry.serializeShortcuts(),
  };

  return (
    <currentComponent.component
      areaId={areaId}
      state={stateValues}
      updateBloodState={(values: Record<string, any>) => Blood.update(values)}
      updateBloodKey={(key: string, value: any) => Blood.updateKey(key, value)}
      lastAction={lastAction}
      shortcutAPI={shortcutAPI}
    />
  );
}
