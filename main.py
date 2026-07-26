import asyncio
import os
import time
from dataclasses import dataclass, field
from typing import AsyncGenerator, Protocol
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
import orjson

@dataclass(frozen=True, slots=True)
class CryptoContext:
    key_material: bytes
    nonce: bytes = field(default_factory=lambda: os.urandom(12))
    
    def derive_subkey(self, info: bytes) -> bytes:
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=info,
        )
        return hkdf.derive(self.key_material)

class LedgerEntry(Protocol):
    @property
    def payload(self) -> bytes: ...
    @property
    def timestamp(self) -> float: ...

@dataclass(slots=True)
class SecurePayload:
    payload: bytes
    timestamp: float = field(default_factory=time.time)

class ZeroCopyCryptoEngine:
    __slots__ = ('_aesgcm', '_context')
    
    def __init__(self, context: CryptoContext):
        subkey = context.derive_subkey(b"obsidian-vault-v1")
        self._aesgcm = AESGCM(subkey)
        self._context = context

    async def encrypt(self, entry: LedgerEntry) -> bytes:
        loop = asyncio.get_running_loop()
        
        plaintext = entry.payload
        aad = str(entry.timestamp).encode('utf-8')
        
        ciphertext = await loop.run_in_executor(
            None, 
            self._aesgcm.encrypt, 
            self._context.nonce, 
            plaintext, 
            aad
        )
        
        return self._context.nonce + ciphertext

    async def decrypt(self, blob: bytes, timestamp: float) -> bytes:
        loop = asyncio.get_running_loop()
        nonce = blob[:12]
        ciphertext = blob[12:]
        aad = str(timestamp).encode('utf-8')
        
        plaintext = await loop.run_in_executor(
            None,
            self._aesgcm.decrypt,
            nonce,
            ciphertext,
            aad
        )
        return plaintext

class AsyncBatchProcessor:
    def __init__(self, engine: ZeroCopyCryptoEngine, batch_size: int = 100):
        self._engine = engine
        self._batch_size = batch_size
        self._queue: asyncio.Queue[LedgerEntry] = asyncio.Queue(maxsize=10000)

    async def ingest(self, entry: LedgerEntry) -> None:
        await self._queue.put(entry)

    async def process_stream(self) -> AsyncGenerator[bytes, None]:
        batch = []
        while True:
            try:
                entry = await asyncio.wait_for(self._queue.get(), timeout=0.1)
                batch.append(entry)
                
                if len(batch) >= self._batch_size:
                    async for result in self._flush_batch(batch):
                        yield result
                    batch.clear()
            except asyncio.TimeoutError:
                if batch:
                    async for result in self._flush_batch(batch):
                        yield result
                    batch.clear()

    async def _flush_batch(self, batch: list[LedgerEntry]) -> AsyncGenerator[bytes, None]:
        tasks = [self._engine.encrypt(entry) for entry in batch]
        results = await asyncio.gather(*tasks)
        for res in results:
            yield res

async def main():
    master_key = os.urandom(32)
    ctx = CryptoContext(key_material=master_key)
    engine = ZeroCopyCryptoEngine(ctx)
    processor = AsyncBatchProcessor(engine)

    async def mock_producer():
        for i in range(10):
            entry = SecurePayload(payload=orjson.dumps({"id": i, "data": "sensitive"}))
            await processor.ingest(entry)
            await asyncio.sleep(0.05)

    asyncio.create_task(mock_producer())
    
    async for encrypted_blob in processor.process_stream():
        print(f"Processed blob size: {len(encrypted_blob)} bytes")

if __name__ == "__main__":
    asyncio.run(main())
