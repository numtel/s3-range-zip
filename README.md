# s3-range-zip

Load individual files from zip files on S3 without downloading the entire zip using range parameters.

## Installation

```
npm install s3-range-zip
```

## Usage

```js
const reader = new S3RangeZip();

const fileList = await reader.fetchFileList('bucket', 'key');
console.log(fileList);

const file = await reader.downloadFile('bucket', 'key', 'myfile.txt', {encoding: 'utf8'})
console.log(file);
```

## class S3RangeZip

### constructor(s3Client)
* `s3UrlFun` `<function>` Optionally, pass a function to use a custom URL scheme.

  Default:
  ```js
  (bucketName, key) => `https://${bucketName}.s3.amazonaws.com/${key}`
  ```

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
