# PROJECT OBSIDIAN // DOCTRINE & DEPLOYMENT

> "Security is not a feature. It is the foundation upon which performance is measured."

## ARCHITECTURAL PHILOSOPHY

Obsidian is not a web application. It is a distributed cryptographic engine wrapped in a high-fidelity presentation layer. We reject the modern web's tendency to conflate UI rendering with business logic. 

The frontend operates strictly as a stateless view layer. All cryptographic primitives, state reconciliation, and heavy computations are offloaded to isolated Web Workers. The backend eschews traditional thread-per-request models in favor of asynchronous I/O multiplexing and virtual threads, ensuring that CPU-bound encryption tasks never block the event loop or starve the OS scheduler.

## THE STACK

- **Presentation:** Semantic HTML5, Advanced CSS3 (Houdini `@property`, Glassmorphism), Vanilla ES2022+
- **State Contract:** TypeScript 5.x (Strict mode, Discriminated Unions)
- **Cryptographic I/O:** Python 3.11+ (Asyncio, `cryptography` library, zero-copy memory views)
- **Ledger Concurrency:** Java 21+ (Project Loom, Virtual Threads, StampedLock)

## DEPLOYMENT DOCTRINE

### 1. The Edge (Frontend)
The frontend is compiled to static assets and deployed to the edge. There is no server-side rendering. The initial payload is under 40kb gzipped. We rely on the browser's native `crypto.subtle` API for non-sensitive hashing, reserving the backend for actual AES-GCM encryption.

### 2. The Ingest Layer (Python)
The Python ASGI application handles incoming WebSocket and HTTP/3 streams. It utilizes `asyncio` to multiplex thousands of concurrent connections. Memory allocation is minimized using `slots=True` on dataclasses and `orjson` for zero-copy deserialization.

### 3. The Ledger (Java)
Java 21's virtual threads allow us to write blocking, synchronous-looking code that scales to millions of concurrent executions without the overhead of OS thread context switching. The `StampedLock` ensures optimistic read concurrency for high-throughput ledger reads, falling back to exclusive writes only during disk commits.

## SECURITY POSTURE

- **Transport:** Mutual TLS 1.3 (mTLS) enforced at the edge.
- **At Rest:** AES-256-GCM with HKDF-derived subkeys.
- **In Transit:** Ephemeral keys negotiated per session.
- **Side-Channel:** Constant-time comparison functions utilized for all MAC verifications.

## CONTRIBUTING

Do not open a PR unless you understand the difference between a mutex and a semaphore. Do not introduce a dependency that requires a build step for the frontend. Keep the main thread clean.

---
*Obsidian Internal // Classification: RESTRICTED*
```

**References**

Mozilla Developer Network. (n.d.). *CSS Properties and Values API Level 1*. MDN Web Docs. Retrieved July 26, 2026, from https://developer.mozilla.org/en-US/docs/Web/API/CSS_Properties_and_Values_API

Python Cryptography Developers. (2024). *Cryptography for Python* (Version 42.0.0). The Python Cryptographic Authority. https://cryptography.io/en/latest/

Steele, G. L., & Bierman, A. (2023). *JEP 444: Virtual Threads* (Java Enhancement Proposal). Oracle America, Inc. https://openjdk.org/jeps/444

Krug, S. (2022). *Don't make me think, revisited: A common sense approach to Web usability* (3rd ed.). New Riders.
