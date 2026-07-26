type VaultState = 
    | { status: 'idle'; lastError: null }
    | { status: 'authenticating'; sessionId: string }
    | { status: 'authenticated'; token: string; expiresAt: number }
    | { status: 'failed'; lastError: string };

type VaultAction =
    | { type: 'INITIATE_AUTH'; sessionId: string }
    | { type: 'AUTH_SUCCESS'; token: string; expiresAt: number }
    | { type: 'AUTH_FAILURE'; error: string }
    | { type: 'SESSION_EXPIRED' };

interface VaultConfig {
    readonly endpoint: string;
    readonly timeoutMs: number;
    readonly retryPolicy: {
        maxRetries: number;
        backoffMultiplier: number;
    };
}

class VaultStateMachine {
    #state: VaultState;
    #config: VaultConfig;
    #listeners: Set<(state: VaultState) => void> = new Set();

    constructor(config: VaultConfig) {
        this.#config = config;
        this.#state = { status: 'idle', lastError: null };
    }

    get currentState(): Readonly<VaultState> {
        return this.#state;
    }

    dispatch(action: VaultAction): void {
        const nextState = this.#reduce(this.#state, action);
        if (nextState !== this.#state) {
            this.#state = nextState;
            this.#notify();
        }
    }

    subscribe(listener: (state: VaultState) => void): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    #reduce(current: VaultState, action: VaultAction): VaultState {
        switch (current.status) {
            case 'idle':
            case 'failed':
                if (action.type === 'INITIATE_AUTH') {
                    return { status: 'authenticating', sessionId: action.sessionId };
                }
                break;
                
            case 'authenticating':
                if (action.type === 'AUTH_SUCCESS') {
                    return { 
                        status: 'authenticated', 
                        token: action.token, 
                        expiresAt: action.expiresAt 
                    };
                }
                if (action.type === 'AUTH_FAILURE') {
                    return { status: 'failed', lastError: action.error };
                }
                break;

            case 'authenticated':
                if (action.type === 'SESSION_EXPIRED') {
                    return { status: 'idle', lastError: null };
                }
                break;
        }
        return current;
    }

    #notify(): void {
        const snapshot = this.#state;
        this.#listeners.forEach(listener => listener(snapshot));
    }
}

interface ApiResponse<T> {
    readonly data: T;
    readonly meta: {
        readonly requestId: string;
        readonly latencyMs: number;
    };
}

async function fetchVaultStatus<T>(
    config: VaultConfig,
    token: string
): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
        const response = await fetch(config.endpoint, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json() as T;
        return {
            data,
            meta: {
                requestId: crypto.randomUUID(),
                latencyMs: performance.now() 
            }
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

const config: VaultConfig = {
    endpoint: 'https://api.obsidian.internal/v1/status',
    timeoutMs: 5000,
    retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 1.5
    }
};

const machine = new VaultStateMachine(config);

machine.subscribe((state) => {
    if (state.status === 'authenticated') {
        console.log(`Session established. Token expires at ${new Date(state.expiresAt).toISOString()}`);
    }
});
