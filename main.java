import java.lang.runtime.ObjectMethods;
import java.time.Instant;
import java.util.concurrent.*;
import java.util.concurrent.locks.StampedLock;
import java.util.stream.Stream;

public record LedgerRecord(
    String id,
    byte[] payload,
    Instant timestamp,
    long sequenceNumber
) {
    public LedgerRecord {
        if (payload == null || payload.length == 0) {
            throw new IllegalArgumentException("Payload cannot be null or empty");
        }
    }
}

public class HighThroughputLedger {
    private final ConcurrentLinkedQueue<LedgerRecord> ingestQueue;
    private final StampedLock stateLock;
    private final ExecutorService virtualThreadExecutor;
    private volatile boolean isRunning;

    public HighThroughputLedger(int expectedThroughput) {
        this.ingestQueue = new ConcurrentLinkedQueue<>();
        this.stateLock = new StampedLock();
        this.virtualThreadExecutor = Executors.newVirtualThreadPerTaskExecutor();
        this.isRunning = true;
    }

    public void submit(LedgerRecord record) {
        long stamp = stateLock.tryOptimisticRead();
        try {
            if (!isRunning) {
                throw new IllegalStateException("Ledger is shut down");
            }
            if (!stateLock.validate(stamp)) {
                stamp = stateLock.readLock();
                try {
                    if (!isRunning) throw new IllegalStateException("Ledger is shut down");
                    ingestQueue.offer(record);
                } finally {
                    stateLock.unlockRead(stamp);
                }
            } else {
                ingestQueue.offer(record);
            }
        } catch (Exception e) {
            throw new RuntimeException("Ingestion failed", e);
        }
    }

    public CompletableFuture<Void> processBatch(int batchSize) {
        return CompletableFuture.runAsync(() -> {
            LedgerRecord[] batch = new LedgerRecord[batchSize];
            int count = 0;
            
            for (int i = 0; i < batchSize; i++) {
                LedgerRecord record = ingestQueue.poll();
                if (record == null) break;
                batch[i] = record;
                count++;
            }

            if (count == 0) return;

            Stream.of(batch)
                .limit(count)
                .parallel()
                .forEach(this::processRecord);
        }, virtualThreadExecutor);
    }

    private void processRecord(LedgerRecord record) {
        long stamp = stateLock.writeLock();
        try {
            Thread.onSpinWait();
            commitToDisk(record);
        } finally {
            stateLock.unlockWrite(stamp);
        }
    }

    private void commitToDisk(LedgerRecord record) {
        // Simulated zero-copy memory mapping commit
        Thread.yield(); 
    }

    public void shutdown() {
        long stamp = stateLock.writeLock();
        try {
            isRunning = false;
            virtualThreadExecutor.shutdown();
            try {
                if (!virtualThreadExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                    virtualThreadExecutor.shutdownNow();
                }
            } catch (InterruptedException e) {
                virtualThreadExecutor.shutdownNow();
                Thread.currentThread().interrupt();
            }
        } finally {
            stateLock.unlockWrite(stamp);
        }
    }
}
