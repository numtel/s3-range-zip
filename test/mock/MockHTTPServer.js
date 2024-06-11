import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

export default class MockHTTPServer {
  constructor(chunkCount) {
    this.chunkCount = chunkCount;
    this.data = {
      "example-bucket": {
        "test.zip": readFileSync('test/test.zip'),
      }
    };

    this.server = createServer((req, res) => this.handleRequest(req, res));
  }

  handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const [bucket, key] = url.pathname.slice(1).split('/');

    if (!this.data[bucket] || !this.data[bucket][key]) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('NoSuchKey: The specified key does not exist.');
      return;
    }

    let content = this.data[bucket][key];
    const contentLength = content.length;

    let start = 0;
    let end = contentLength - 1;

    if (req.headers.range) {
      const range = req.headers.range;
      const matches = range.match(/bytes=(\d*)-(\d*)/);
      if (matches) {
        start = matches[1] ? parseInt(matches[1], 10) : null;
        end = matches[2] ? parseInt(matches[2], 10) : null;

        if (start >= contentLength || end >= contentLength) {
          res.writeHead(416, { 'Content-Range': `bytes */${contentLength}` });
          res.end();
          return;
        }

        if (start !== null && end !== null) {
          // Range with start and end
          content = content.subarray(start, end + 1);
        } else if (start !== null) {
          // Range with only start
          content = content.subarray(start);
        } else if (end !== null) {
          // Range from the end
          content = content.subarray(content.length - end);
        }

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${contentLength}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': content.length,
          'Content-Type': 'application/octet-stream',
        });
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid Range Header');
        return;
      }
    } else {
      res.writeHead(200, {
        'Content-Length': contentLength,
        'Content-Type': 'application/octet-stream',
      });
    }

    const chunkSize = Math.ceil(content.length / this.chunkCount);
    let offset = 0;

    const sendChunk = () => {
      if (offset < content.length) {
        const chunk = content.subarray(offset, Math.min(offset + chunkSize, content.length));
        res.write(chunk);
        offset += chunkSize;
        setTimeout(sendChunk, 10);  // Simulate network delay
      } else {
        res.end();
      }
    };

    sendChunk();
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server.listen(0, () => {
        const port = this.server.address().port;
        const url = `http://localhost:${port}/`;
        resolve(url);
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  stop() {
    this.server.close();
  }
}
