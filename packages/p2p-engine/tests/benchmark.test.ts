import { describe, it, expect } from 'vitest';
import {
  FileTransferEngine,
  TransferTransport,
  FileDataInput,
} from '../src/index.js';
import { generateUUID, computeSHA256, SignalingEnvelope, FileChunk } from '@lynq/core';

describe('Performance Benchmarks (Latency, Throughput, and Concurrency)', () => {
  it('benchmarks messaging latency across 1,000 round-trips', async () => {
    const latencies: number[] = [];
    const totalMessages = 1000;

    for (let i = 0; i < totalMessages; i++) {
      const start = performance.now();

      // Simulated local message envelope round-trip
      const envelope: SignalingEnvelope = {
        id: generateUUID(),
        type: 'msg:send',
        senderId: 'alice',
        recipientId: 'bob',
        timestamp: Date.now(),
        payload: { content: `Benchmark ping ${i}` },
      };

      // Serialize and deserialize (simulating socket wire protocol)
      const wire = JSON.stringify(envelope);
      const parsed = JSON.parse(wire);

      // Ack envelope
      const ackEnvelope: SignalingEnvelope = {
        id: generateUUID(),
        type: 'msg:ack',
        senderId: 'bob',
        recipientId: 'alice',
        timestamp: Date.now(),
        payload: { messageId: parsed.id, status: 'delivered' },
      };
      const ackWire = JSON.stringify(ackEnvelope);
      const ackParsed = JSON.parse(ackWire);

      const elapsed = performance.now() - start;
      latencies.push(elapsed);
      expect(ackParsed.type).toBe('msg:ack');
    }

    latencies.sort((a, b) => a - b);
    const avgLatency = latencies.reduce((sum, v) => sum + v, 0) / totalMessages;
    const p50 = latencies[Math.floor(totalMessages * 0.5)];
    const p95 = latencies[Math.floor(totalMessages * 0.95)];
    const p99 = latencies[Math.floor(totalMessages * 0.99)];

    console.log(`\n=== BENCHMARK: 1,000 Message Round-Trips ===`);
    console.log(`Average Latency : ${avgLatency.toFixed(3)} ms`);
    console.log(`p50 Latency     : ${p50.toFixed(3)} ms`);
    console.log(`p95 Latency     : ${p95.toFixed(3)} ms`);
    console.log(`p99 Latency     : ${p99.toFixed(3)} ms`);

    // Latency on local system should easily be well under 1ms
    expect(avgLatency).toBeLessThan(5.0);
    expect(p95).toBeLessThan(10.0);
  });

  it('benchmarks file transfer engine throughput with 10 MB payload & SHA-256 verification', async () => {
    const sender = new FileTransferEngine('alice');
    const receiver = new FileTransferEngine('bob');

    // 10 MB test payload
    const fileSizeBytes = 10 * 1024 * 1024; // 10 MB
    const fileBytes = new Uint8Array(fileSizeBytes);
    for (let i = 0; i < fileSizeBytes; i += 1024) {
      fileBytes[i] = (i % 256);
    }

    const testFile: FileDataInput = {
      name: 'benchmark_10mb.dat',
      size: fileSizeBytes,
      type: 'application/octet-stream',
      data: fileBytes,
    };

    const startTime = performance.now();

    const { transfer: offer } = await sender.createTransferOffer(testFile, 'bob');
    receiver.handleIncomingOffer(offer);

    const receiverTransport: TransferTransport = {
      sendData: () => true,
    };
    receiver.acceptTransfer(offer.transferId, receiverTransport);

    const completionPromise = new Promise<{ transfer: any; fileData: Uint8Array }>((resolve) => {
      receiver.on('transferCompleted', (data: any) => {
        resolve(data);
      });
    });

    const senderTransport: TransferTransport = {
      sendData: (type: string, payload: unknown) => {
        if (type === 'transfer:chunk') {
          // Stream directly into receiver
          receiver.handleIncomingChunk(payload as FileChunk);
        }
        return true;
      },
    };

    await sender.startStreamingOutgoing(offer.transferId, senderTransport);
    const result = await completionPromise;

    const totalSeconds = (performance.now() - startTime) / 1000;
    const mbTransferred = fileSizeBytes / (1024 * 1024);
    const throughputMBps = mbTransferred / totalSeconds;

    console.log(`\n=== BENCHMARK: 10 MB P2P File Transfer ===`);
    console.log(`Total Size      : ${mbTransferred.toFixed(2)} MB`);
    console.log(`Elapsed Time    : ${totalSeconds.toFixed(3)} s`);
    console.log(`Throughput      : ${throughputMBps.toFixed(2)} MB/s`);

    // Verify 100% integrity
    const expectedHash = await computeSHA256(fileBytes);
    const actualHash = await computeSHA256(result.fileData);
    expect(actualHash).toBe(expectedHash);
    expect(throughputMBps).toBeGreaterThan(10.0); // Must exceed 10 MB/s
  });

  it('benchmarks concurrent file transfers (5 simultaneous streams)', async () => {
    const sender = new FileTransferEngine('alice');
    const receiver = new FileTransferEngine('bob');

    const count = 5;
    const sizePerFile = 1024 * 1024; // 1 MB each = 5 MB total concurrent
    const startTime = performance.now();

    let completedCount = 0;
    const completionPromise = new Promise<void>((resolve) => {
      receiver.on('transferCompleted', () => {
        completedCount++;
        if (completedCount === count) resolve();
      });
    });

    const receiverTransport: TransferTransport = {
      sendData: () => true,
    };

    const senderTransport: TransferTransport = {
      sendData: (type: string, payload: unknown) => {
        if (type === 'transfer:chunk') {
          receiver.handleIncomingChunk(payload as FileChunk);
        }
        return true;
      },
    };

    const streamPromises: Promise<void>[] = [];

    for (let i = 0; i < count; i++) {
      const data = new Uint8Array(sizePerFile);
      data.fill(i + 1);

      const fileInput: FileDataInput = {
        name: `concurrent_${i}.bin`,
        size: sizePerFile,
        type: 'application/octet-stream',
        data,
      };

      const { transfer: offer } = await sender.createTransferOffer(fileInput, 'bob');
      receiver.handleIncomingOffer(offer);
      receiver.acceptTransfer(offer.transferId, receiverTransport);
      streamPromises.push(sender.startStreamingOutgoing(offer.transferId, senderTransport));
    }

    await Promise.all(streamPromises);
    await completionPromise;

    const totalSeconds = (performance.now() - startTime) / 1000;
    const totalMB = (count * sizePerFile) / (1024 * 1024);
    const throughput = totalMB / totalSeconds;

    console.log(`\n=== BENCHMARK: 5 Concurrent File Transfers ===`);
    console.log(`Total Transferred: ${totalMB.toFixed(2)} MB across 5 streams`);
    console.log(`Elapsed Time     : ${totalSeconds.toFixed(3)} s`);
    console.log(`Combined Rate    : ${throughput.toFixed(2)} MB/s`);

    expect(completedCount).toBe(5);
  });
});
