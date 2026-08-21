// Minimal async queue bridging a push-based producer (worker postMessage
// events) to a pull-based AsyncIterable consumer (`for await` in the chat
// hook). No external dependency needed for something this small.
export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly buffer: T[] = [];
  private waiting: ((result: IteratorResult<T>) => void) | null = null;
  private finished = false;
  private failure: unknown = null;

  push(value: T): void {
    if (this.finished) return;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value, done: false });
    } else {
      this.buffer.push(value);
    }
  }

  end(): void {
    this.finished = true;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: undefined as unknown as T, done: true });
    }
  }

  fail(error: unknown): void {
    this.failure = error;
    this.end();
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.buffer.length > 0) {
          return Promise.resolve({ value: this.buffer.shift() as T, done: false });
        }
        if (this.finished) {
          if (this.failure) return Promise.reject(this.failure);
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }
        return new Promise((resolve) => {
          this.waiting = resolve;
        });
      },
    };
  }
}
