export class EventEmitter {
  private _listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  public on(event: string, listener: (...args: any[]) => void): this {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event)!.push(listener);
    return this;
  }

  public addListener(event: string, listener: (...args: any[]) => void): this {
    return this.on(event, listener);
  }

  public off(event: string, listener: (...args: any[]) => void): this {
    const list = this._listeners.get(event);
    if (list) {
      this._listeners.set(
        event,
        list.filter((l) => l !== listener)
      );
    }
    return this;
  }

  public removeListener(event: string, listener: (...args: any[]) => void): this {
    return this.off(event, listener);
  }

  public emit(event: string, ...args: any[]): boolean {
    const list = this._listeners.get(event);
    if (!list || list.length === 0) return false;
    for (const listener of list) {
      try {
        listener(...args);
      } catch (err) {
        console.error(`Error in event listener for "${event}":`, err);
      }
    }
    return true;
  }

  public removeAllListeners(event?: string): this {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }
}
