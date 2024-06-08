# s3-range-zip

Load individual files from zip files on S3 without downloading the entire zip using range parameters.

## Installation

```
npm install s3-range-zip
```

## Usage

```js
import { S3Client } from '@aws-sdk/client-s3';
import S3RangeZip from 's3-range-zip';

const s3 = new S3Client();
const reader = new S3RangeZip(s3);

const fileList = await reader.fetchFileList('bucket', 'key');
console.log(fileList);

const file = await reader.downloadFile('bucket', 'key', 'myfile.txt', {encoding: 'utf8'})
console.log(file);
```

## class S3RangeZip

### constructor(s3Client)
* `s3Client` `<S3Client>` Instance from `@aws-sdk/client-s3`

### async fetchFileList(bucketName, key)
* `bucketName` `<string>` S3 Bucket name
* `key` `<string>` S3 Item key

Returns the list of files in the zip.

### async downloadFile(bucketName, key, fileName, options)
* `bucketName` `<string>` S3 Bucket name
* `key` `<string>` S3 Item key
* `fileName` `<string>` Name of file inside the zip to download and decompress
* `options` `<object>` Optional

Option Name | Type | Description
-----------|-------|----------------
`encoding` | string | `utf8` to return string instead of default `Uint8Array`
`onProgress(receivedBytes, totalBytes)` | function | receive updates during download

Returns the decompressed file contents as Uint8Array or string.

## License

MIT
