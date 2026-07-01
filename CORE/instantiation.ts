/**
 * Simplified VS Code-style instantiation service.
 *
 * Inspired by VS Code's:
 * - src/vs/platform/instantiation/common/instantiation.ts
 * - src/vs/platform/instantiation/common/serviceCollection.ts
 * - src/vs/platform/instantiation/common/instantiationService.ts
 *
 * This project keeps only the small DI kernel needed by Galois instead of
 * vendoring the full VS Code platform.
 */
const DI_DEPENDENCIES = '$di$dependencies';

export type ServiceIdentifier<T> = {
  (...args: any[]): void;
  type: T;
};

export const serviceIds = new Map<string, ServiceIdentifier<any>>();

export function createDecorator<T>(serviceId: string): ServiceIdentifier<T> {
  if (serviceIds.has(serviceId)) {
    return serviceIds.get(serviceId)!;
  }

  const id = function (target: any, _key: string, index: number) {
    if (arguments.length !== 3) {
      throw new Error('@createDecorator can only be used as parameter decorator');
    }
    const dependencies = target[DI_DEPENDENCIES] || [];
    dependencies.push({ id, index });
    target[DI_DEPENDENCIES] = dependencies;
  } as any as ServiceIdentifier<T>;

  id.toString = () => serviceId;
  serviceIds.set(serviceId, id);
  return id;
}

export interface ServicesAccessor {
  get<T>(id: ServiceIdentifier<T>): T;
}

export class ServiceCollection {
  private _entries = new Map<ServiceIdentifier<any>, any>();

  constructor(...entries: [ServiceIdentifier<any>, any][]) {
    for (const [id, service] of entries) {
      this.set(id, service);
    }
  }

  set<T>(id: ServiceIdentifier<T>, instance: T): T {
    this._entries.set(id, instance);
    return instance;
  }

  has(id: ServiceIdentifier<any>): boolean {
    return this._entries.has(id);
  }

  get<T>(id: ServiceIdentifier<T>): T {
    return this._entries.get(id);
  }
}

export interface IInstantiationService {
  readonly _serviceBrand: undefined;
  createInstance<T>(ctor: new (...args: any[]) => T, ...args: any[]): T;
  invokeFunction<R, TS extends any[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R;
}

export const IInstantiationService = createDecorator<IInstantiationService>('instantiationService');

export class InstantiationService implements IInstantiationService {
  declare readonly _serviceBrand: undefined;

  constructor(private readonly _services: ServiceCollection = new ServiceCollection()) {
    this._services.set(IInstantiationService, this);
  }

  createInstance<T>(ctor: any, ...args: any[]): T {
    const dependencies = (ctor[DI_DEPENDENCIES] || [])
      .slice()
      .sort((a: any, b: any) => a.index - b.index);

    const serviceArgs: any[] = [];
    for (const dep of dependencies) {
      const service = this._services.get(dep.id);
      if (!service) {
        throw new Error(`[createInstance] Service '${dep.id.toString()}' is not registered!`);
      }
      serviceArgs.push(service);
    }

    const firstServiceArgPos = dependencies.length > 0 ? dependencies[0].index : args.length;
    let adjustedArgs = args;
    if (args.length > firstServiceArgPos) {
      adjustedArgs = args.slice(0, firstServiceArgPos);
    } else if (args.length < firstServiceArgPos) {
      adjustedArgs = args.concat(new Array(firstServiceArgPos - args.length));
    }

    return Reflect.construct(ctor, adjustedArgs.concat(serviceArgs));
  }

  invokeFunction<R, TS extends any[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R {
    const accessor: ServicesAccessor = {
      get: <T>(id: ServiceIdentifier<T>) => {
        const service = this._services.get(id);
        if (!service) {
          throw new Error(`[invokeFunction] Service '${id.toString()}' is not registered!`);
        }
        return service;
      }
    };
    return fn(accessor, ...args);
  }
}

import { createContext, useContext } from 'react';

export const InstantiationContext = createContext<IInstantiationService | null>(null);

export const InstantiationProvider = InstantiationContext.Provider;

export function useService<T>(id: ServiceIdentifier<T>): T {
  const instantiationService = useContext(InstantiationContext);
  if (!instantiationService) {
    throw new Error('useService must be used within an InstantiationProvider');
  }
  return instantiationService.invokeFunction(accessor => accessor.get(id));
}
