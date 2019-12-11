const net = require('net');
const mkdir = require('mkdirp-sync');
const http = require('http');
const spawn = require('child_process').spawn;
const execSync = require('child_process').execSync;
const uuidv1 = require('uuid/v1');
const iconv = require('iconv-lite');
const express = require('express');
const app = express();

app.use(express.static(process.cwd() + '/frontend/dist'));

const httpServer = http.createServer(app);
const io = require('socket.io')(httpServer);

const BBS_ADDR = 'goblins.iptime.org';
const BBS_PORT = 9000;
const WEB_ADDR = 'goblins.iptime.org';
const WEB_PORT = 8080;

io.on('connection', function(ioSocket) {
  // Remain data to be parsed
  var remain = [];

  // Create client TCP socket
  const netSocket = new net.Socket();

  // True if the binary transmit mode
  netSocket.binaryTransmit = false;

  // Generate the decode stream
  netSocket.decodeStream = iconv.decodeStream('euc-kr');
  netSocket.decodeStream.on('data', data => {
    ioSocket.emit('data', Buffer.from(data));
  });

  // Connect to the BBS server (BBS_ADDR:BBS_PORT)
  netSocket.connect(BBS_PORT, BBS_ADDR, () => {
    // prettier-ignore
    const initPacket =
        [
          255, 251,  24, 255, 252,  32, 255, 252,
           35, 255, 252,  39, 255, 250,  24,  86,
           84,  49,  48,  48, 255, 240, 255, 251,
            1, 255, 251,  31, 255, 252,   3
        ];

    // When connected, send the init packet (pre-defined)
    netSocket.write(Buffer.from(initPacket));
  });

  // Deliver the bbs server close event to the ioSocket
  netSocket.on('close', () => {
    ioSocket.disconnect(true);
  });

  // Data from the telnet server. Deliver it to the web client.
  netSocket.on('data', data => {
    if (netSocket.binaryTransmit) {
      const payload = [];

      data = [...remain, ...data];
      remain = [];

      var index = 0;
      while (index < data.length) {
        if (data[index] != 255) {
          payload.push(data[index]);
          index++;
        } else {
          if (index == data.length - 1) {
            remain.push(255);
            break;
          } else if (data[index + 1] == 255) {
            payload.push(255);
            index += 2;
          } else if (data[index + 1] >= 239 && data[index + 1] < 255) {
            index += 3;
          } else {
            index += 2;
          }
        }
      }

      // At this line, netSocket.rz must be exist
      netSocket.rz.stdin.write(Buffer.from(payload));
    } else {
      netSocket.decodeStream.write(data);

      // Check rz session start
      const pattern = /B00000000000000/;
      const result = pattern.exec(data.toString());
      if (result) {
        // Create temporary for file download using uuid
        netSocket.rzTargetDir = uuidv1();
        mkdir(
          process.cwd() + '/frontend/dist/file-cache/' + netSocket.rzTargetDir,
        );

        netSocket.binaryTransmit = true;

        netSocket.rz = spawn('rz', ['-e', '-E', '-vv'], {
          cwd:
            process.cwd() +
            '/frontend/dist/file-cache/' +
            netSocket.rzTargetDir,
        });

        netSocket.rz.stdout.on('data', data => {
          netSocket.write(data);
        });

        netSocket.rz.stderr.on('data', data => {
          const decodedString = iconv.decode(Buffer.from(data), 'euc-kr');
          {
            const pattern = /Receiving: (.*)/;
            const result = pattern.exec(decodedString);
            if (result) {
              netSocket.rzFileName = result[1];
              ioSocket.emit('rz-begin', netSocket.rzFileName);
            }
          }
          {
            const pattern = /Bytes received: ([0-9]*)\/([0-9]*).*BPS:([0-9]*)/;
            const result = pattern.exec(decodedString);

            if (result) {
              const received = parseInt(result[1], 10);
              const total = parseInt(result[2], 10);
              const bps = parseInt(result[3], 10);

              ioSocket.emit('rz-progress', {
                received,
                total,
                bps,
              });
            }
          }
        });

        netSocket.rz.on('close', code => {
          netSocket.binaryTransmit = false;

          // When close, KSC5601 file name is broken on the UTF-8 System.
          // Should decode the file name to UTF-8
          execSync('mv * ' + netSocket.rzTargetDir, {
            cwd:
              process.cwd() +
              '/frontend/dist/file-cache/' +
              netSocket.rzTargetDir,
          });
          execSync('mv * "' + netSocket.rzFileName + '"', {
            cwd:
              process.cwd() +
              '/frontend/dist/file-cache/' +
              netSocket.rzTargetDir,
          });

          ioSocket.emit('rz-end', {
            code,
            url:
              'http://' +
              WEB_ADDR +
              ':' +
              WEB_PORT +
              '/file-cache/' +
              netSocket.rzTargetDir +
              '/' +
              netSocket.rzFileName,
          });
        });
      }
    }
  });

  ioSocket.on('data', data => {
    netSocket.write(iconv.encode(Buffer.from(data), 'euc-kr'));
  });
});

httpServer.listen(8080, '0.0.0.0');
