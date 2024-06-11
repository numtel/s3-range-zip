import {strictEqual, ok} from 'node:assert';

import MockS3Client from './mock/MockS3Client.js';

import S3RangeZip from '../index.js';

describe('S3RangeZip', () => {
  it('reads a file', async () => {
    const chunkCount = 5;
    const s3 = new MockS3Client(chunkCount);
    const reader = new S3RangeZip(s3);

    const bucket = 'example-bucket';
    const key = 'test.zip';
    const fileName = 'packages/circuits/src/semaphore.circom';

    const fileList = await reader.fetchFileList(bucket, key);
    strictEqual(fileList.length, 8);
    const fileInfo = fileList.find(x=>x.fileName === fileName);

    const fileBin = await reader.downloadFile(bucket, key, fileName);
    let lastReceived = 0;
    let receivedCount = 0;
    const fileStr = await reader.downloadFile(bucket, key, fileName, {
      encoding: 'utf8',
      onProgress(received, total) {
        ok(received > lastReceived);
        lastReceived = received;
        receivedCount++;
      }
    });
    strictEqual(receivedCount, chunkCount);
    strictEqual(fileBin.length, fileInfo.uncompressedSize);
    strictEqual(fileStr.length, fileInfo.uncompressedSize);
  });
});
