import { useEffect, useState } from 'react';
import { Blood } from './Blood';
import { BC } from './BloodChannels';
import { ComponentRegistry } from './ComponentRegistry';

interface PoppedAreaTypeOptions {
  areaId: string;
  initialType: string;
  isPopped: boolean;
}

export function usePoppedAreaType({ areaId, initialType, isPopped }: PoppedAreaTypeOptions) {
  const [componentType, setComponentType] = useState(initialType);

  useEffect(() => {
    setComponentType(initialType);
  }, [areaId, initialType]);

  useEffect(() => {
    if (!isPopped || !areaId) return;
    const changeChannel = BC.layout.changeAreaType(areaId);

    const applyRequestedType = () => {
      const requestedType = Blood.getValue<string>(changeChannel, '');
      if (!requestedType || !ComponentRegistry.getComponent(requestedType)) return;
      setComponentType(requestedType);
      Blood.updateKey(BC.layout.poppedAreas(areaId), requestedType);
    };

    applyRequestedType();
    return Blood.subscribe((changedKeys) => {
      if (changedKeys.has(changeChannel) || changedKeys.has(BC.events.registryChanged)) {
        applyRequestedType();
      }
    });
  }, [areaId, isPopped]);

  return componentType;
}
