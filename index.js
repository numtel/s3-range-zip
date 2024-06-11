import pako from 'pako';

export default class S3RangeZip {
  constructor(s3UrlFun = (bucketName, key) => `https://${bucketName}.s3.amazonaws.com/${key}`) {
    this.s3UrlFun = s3UrlFun;
    this.fileList = [];
  }

  async getLastBytes(bucketName, key, byteCount) {
    const response = await fetch(this.s3UrlFun(bucketName, key), {
      headers: {
        'Range': `bytes=-${byteCount}`
      }
    });

    if (!response.ok) {
      throw new Error(`Error fetching data: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  async getCentralDirectory(bucketName, key, offset, size) {
    const response = await fetch(this.s3UrlFun(bucketName, key), {
      headers: {
        'Range': `bytes=${offset}-${offset + size - 1}`
      }
    });

    if (!response.ok) {
      throw new Error(`Error fetching data: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  parseEOCD(buffer) {
    const eocd = {};
    eocd.signature = readUint32LE(buffer, 0);
    eocd.numberOfThisDisk = readUint16LE(buffer, 4);
    eocd.numberOfTheDiskWithTheStartOfTheCentralDirectory = readUint16LE(buffer, 6);
    eocd.totalNumberOfEntriesInTheCentralDirectoryOnThisDisk = readUint16LE(buffer, 8);
    eocd.totalNumberOfEntriesInTheCentralDirectory = readUint16LE(buffer, 10);
    eocd.sizeOfTheCentralDirectory = readUint32LE(buffer, 12);
    eocd.offsetOfStartOfCentralDirectoryWithRespectToTheStartingDiskNumber = readUint32LE(buffer, 16);
    eocd.zipFileCommentLength = readUint16LE(buffer, 20);
    eocd.zipFileComment = buffer.slice(22, 22 + eocd.zipFileCommentLength);
    return eocd;
  }

  parseCentralDirectory(buffer) {
    const files = [];
    let offset = 0;

    while (offset < buffer.length) {
      const fileHeader = {};
      fileHeader.signature = readUint32LE(buffer, offset);
      if (fileHeader.signature !== 0x02014b50) {
        break;
      }
      fileHeader.versionMadeBy = readUint16LE(buffer, offset + 4);
      fileHeader.versionNeededToExtract = readUint16LE(buffer, offset + 6);
      fileHeader.generalPurposeBitFlag = readUint16LE(buffer, offset + 8);
      fileHeader.compressionMethod = readUint16LE(buffer, offset + 10);
      fileHeader.lastModFileTime = readUint16LE(buffer, offset + 12);
      fileHeader.lastModFileDate = readUint16LE(buffer, offset + 14);
      fileHeader.crc32 = readUint32LE(buffer, offset + 16);
      fileHeader.compressedSize = readUint32LE(buffer, offset + 20);
      fileHeader.uncompressedSize = readUint32LE(buffer, offset + 24);
      fileHeader.fileNameLength = readUint16LE(buffer, offset + 28);
      fileHeader.extraFieldLength = readUint16LE(buffer, offset + 30);
      fileHeader.fileCommentLength = readUint16LE(buffer, offset + 32);
      fileHeader.diskNumberStart = readUint16LE(buffer, offset + 34);
      fileHeader.internalFileAttributes = readUint16LE(buffer, offset + 36);
      fileHeader.externalFileAttributes = readUint32LE(buffer, offset + 38);
      fileHeader.relativeOffsetOfLocalHeader = readUint32LE(buffer, offset + 42);

      const fileName = readUtf8String(buffer, offset + 46, offset + 46 + fileHeader.fileNameLength);
      files.push({
        fileName,
        compressedSize: fileHeader.compressedSize,
        uncompressedSize: fileHeader.uncompressedSize,
        relativeOffsetOfLocalHeader: fileHeader.relativeOffsetOfLocalHeader
      });

      offset += 46 + fileHeader.fileNameLength + fileHeader.extraFieldLength + fileHeader.fileCommentLength;
    }

    return files;
  }

  parseLocalFileHeader(buffer) {
    const fileHeader = {};
    fileHeader.signature = readUint32LE(buffer, 0);
    fileHeader.versionNeededToExtract = readUint16LE(buffer, 4);
    fileHeader.generalPurposeBitFlag = readUint16LE(buffer, 6);
    fileHeader.compressionMethod = readUint16LE(buffer, 8);
    fileHeader.lastModFileTime = readUint16LE(buffer, 10);
    fileHeader.lastModFileDate = readUint16LE(buffer, 12);
    fileHeader.crc32 = readUint32LE(buffer, 14);
    fileHeader.compressedSize = readUint32LE(buffer, 18);
    fileHeader.uncompressedSize = readUint32LE(buffer, 22);
    fileHeader.fileNameLength = readUint16LE(buffer, 26);
    fileHeader.extraFieldLength = readUint16LE(buffer, 28);
    fileHeader.fileName = readUtf8String(buffer, 30, 30 + fileHeader.fileNameLength);
    return fileHeader;
  }

  async fetchFileList(bucketName, key) {
    const eocdSize = 22;
    const eocdBuffer = await this.getLastBytes(bucketName, key, eocdSize);
    const eocd = this.parseEOCD(eocdBuffer);

    const centralDirectoryBuffer = await this.getCentralDirectory(bucketName, key, eocd.offsetOfStartOfCentralDirectoryWithRespectToTheStartingDiskNumber, eocd.sizeOfTheCentralDirectory);
    this.fileList = this.parseCentralDirectory(centralDirectoryBuffer);
    return this.fileList;
  }

  async downloadFile(bucketName, key, fileName, options) {
    if (!this.fileList.length) {
      await this.fetchFileList(bucketName, key);
    }

    const fileEntry = this.fileList.find(file => file.fileName === fileName);
    if (!fileEntry) {
      throw new Error(`File ${fileName} not found in zip.`);
    }

    const localFileHeaderSize = 30 + fileEntry.fileName.length;
    const fileRangeStart = fileEntry.relativeOffsetOfLocalHeader;
    const fileRangeEnd = fileEntry.relativeOffsetOfLocalHeader + localFileHeaderSize + fileEntry.compressedSize;

    const response = await fetch(this.s3UrlFun(bucketName, key), {
      headers: {
        'Range': `bytes=${fileRangeStart}-${fileRangeEnd - 1}`
      }
    });

    if (!response.ok) {
      throw new Error(`Error fetching data: ${response.statusText}`);
    }
    const contentLength = parseInt(response.headers.get('Content-Length'), 10);
    const reader = response.body.getReader();
    let receivedLength = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      receivedLength += value.length;
      options && options.onProgress && options.onProgress(receivedLength, contentLength);
    }

    const chunksAll = new Uint8Array(receivedLength);
    let position = 0;
    for (let chunk of chunks) {
      chunksAll.set(chunk, position);
      position += chunk.length;
    }

    const localFileHeader = this.parseLocalFileHeader(chunksAll);
    const compressedData = chunksAll.slice(localFileHeaderSize, chunksAll.length);

    let decompressedData;
    if (localFileHeader.compressionMethod === 8) { // Deflate compression
      decompressedData = pako.inflate(compressedData, {raw:true});
    } else if (localFileHeader.compressionMethod === 0) { // No compression
      decompressedData = compressedData;
    } else {
      throw new Error(`Unsupported compression method: ${localFileHeader.compressionMethod}`);
    }

    if(options && options.encoding === 'utf8') {
      return readUtf8String(decompressedData, 0, decompressedData.length);
    }
    return decompressedData;
  }
}

function readUint32LE(buffer, offset) {
  return buffer[offset] |
    (buffer[offset + 1] << 8) |
    (buffer[offset + 2] << 16) |
    (buffer[offset + 3] << 24);
}

function readUint16LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

function readUtf8String(uint8Array, start, end) {
    if (start < 0 || end > uint8Array.length || start >= end) {
        throw new RangeError("Invalid start or end positions");
    }
    // Create a subarray from start to end
    const subArray = uint8Array.subarray(start, end);

    // Decode the subarray as a UTF-8 string
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(subArray);
}


