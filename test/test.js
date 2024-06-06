import {strictEqual} from 'node:assert';

import MockS3Client from './mock/MockS3Client.js';

import S3RangeZip from '../index.js';

describe('S3RangeZip', () => {
  it('reads a file', async () => {
    const s3 = new MockS3Client();
    const reader = new S3RangeZip(s3);

    const bucket = 'example-bucket';
    const key = 'test.zip';
    const fileName = 'packages/circuits/src/semaphore.circom';

    const fileList = await reader.fetchFileList(bucket, key);
    strictEqual(fileList.length, 27);

    const fileBin = await reader.downloadFile(bucket, key, fileName)
    const fileStr = await reader.downloadFile(bucket, key, fileName, {encoding: 'utf8'})
    const expectedLen = fileList.find(x=>x.fileName === fileName).uncompressedSize;
    strictEqual(fileBin.length, expectedLen);
    strictEqual(fileStr.length, expectedLen);
  });
});
