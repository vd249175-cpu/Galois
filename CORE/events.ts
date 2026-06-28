export interface IDisposable {
  dispose(): void;
}

export type Event<T> = (listener: (e: T) => any, thisArgs?: any) => IDisposable;

export class Emitter<T> {
  private _listeners: Set<[(e: T) => any, any]> = new Set();
  private _event?: Event<T>;

  get event(): Event<T> {
    if (!this._event) {
      this._event = (listener: (e: T) => any, thisArgs?: any) => {
        const item: [(e: T) => any, any] = [listener, thisArgs];
        this._listeners.add(item);
        return {
          dispose: () => {
            this._listeners.delete(item);
          }
        };
      };
    }
    return this._event;
  }

  fire(event: T): void {
    for (const [listener, thisArgs] of this._listeners) {
      try {
        if (thisArgs) {
          listener.call(thisArgs, event);
        } else {
          listener(event);
        }
      } catch (err) {
        console.error('Error during event notification:', err);
      }
    }
  }

  dispose(): void {
    this._listeners.clear();
  }
}

export class DisposableStore implements IDisposable {
  private _toDispose = new Set<IDisposable>();
  private _isDisposed = false;

  add<T extends IDisposable>(t: T): T {
    if (this._isDisposed) {
      t.dispose();
    } else {
      this._toDispose.add(t);
    }
    return t;
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    for (const disposable of this._toDispose) {
      try {
        disposable.dispose();
      } catch (e) {
        console.error('Error during disposable cleanup:', e);
      }
    }
    this._toDispose.clear();
  }
}
