import { AsyncLocalStorage } from 'node:async_hooks';
export interface AuthContext {
  // request?: AuthRequest
  // response?: AuthResponse
  // storage?: AuthStorage
}
export class ContextManager {
  private storage = new AsyncLocalStorage<AuthContext>();

  run(ctx: AuthContext, fn: () => any) {
    return this.storage.run(ctx, fn);
  }

  get(): AuthContext {
    const ctx = this.storage.getStore();

    if (!ctx) {
      throw new Error('Auth context not found');
    }

    return ctx;
  }

  getOrNull(): AuthContext | undefined {
    return this.storage.getStore();
  }

  clear() {
    // Node 不需要手动 clear
  }
}
