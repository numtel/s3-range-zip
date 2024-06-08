import {readFileSync} from 'node:fs';

export default class MockS3Client {
  constructor(chunkCount) {
    this.chunkCount = chunkCount;
    this.data = {
      "example-bucket": {
        "test.zip": readFileSync('test/test.zip'),
      }
    };
  }

  send(command) {
    if (command.constructor.name === "GetObjectCommand") {
      const { Bucket, Key, Range } = command.input;

      if (!this.data[Bucket] || !this.data[Bucket][Key]) {
        return Promise.reject(new Error("NoSuchKey: The specified key does not exist."));
      }

      let content = this.data[Bucket][Key];

      if (Range) {
        const matches = Range.match(/bytes=(\d*)-(\d*)/);
        if (matches) {
          const start = matches[1] ? parseInt(matches[1], 10) : null;
          const end = matches[2] ? parseInt(matches[2], 10) : null;

          if (start !== null && end !== null) {
            // Range with start and end
            content = content.subarray(start, end + 1);
          } else if (start !== null) {
            // Range with only start
            content = content.subarray(start);
          } else if (end !== null) {
            // Range from the end
            content = content.subarray(content.length - end);
          } else {
            return Promise.reject(new Error("InvalidRange: The requested range is not valid."));
          }
        } else {
          return Promise.reject(new Error("InvalidRange: The requested range is not valid."));
        }
      }

      return Promise.resolve({
        Body: {
          transformToString: async () => content.toString('utf8'),
          transformToByteArray: async () => new Uint8Array(content),
          getReader: () => new MockReader(content, this.chunkCount),
        },
        ContentLength: content.length,
        ContentRange: Range ? `bytes ${Range}/${this.data[Bucket][Key].length}` : undefined,
      });
    }

    return Promise.reject(new Error("Unsupported command"));
  }
}

class MockReader {
  constructor(content, chunkCount) {
    this.content = content;
    this.done = false;
    this.chunkCount = chunkCount;
    this.chunkSize = Math.ceil(content.length / chunkCount);
    this.currentChunk = 0;
  }

  read() {
    if (this.currentChunk >= this.chunkCount) {
      return Promise.resolve({ done: true, value: null });
    }

    const start = this.currentChunk * this.chunkSize;
    const end = Math.min(start + this.chunkSize, this.content.length);
    const chunk = this.content.subarray(start, end);

    this.currentChunk += 1;

    return Promise.resolve({ done: false, value: chunk });
  }
}
