const net = require("net");
const http = require("http");
const spawn = require("child_process").spawn;
const express = require("express");
const app = express();

app.use(express.static("frontend/dist"));

const httpServer = http.createServer(app);

const io = require("socket.io")(httpServer);

io.on("connection", function(ioSocket) {
  // Remain data to be parsed
  const remain = [];

  // Create client TCP socket
  const netSocket = new net.Socket();

  // True if the binary transmit mode
  netSocket.binaryTransmit = false;

  // Connect to the BBS server (localhost:9000)
  netSocket.connect(9000, "localhost", () => {
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
  netSocket.on("close", () => {
    ioSocket.disconnect(true);
  });

  // Data from the telnet server. Deliver it to the web client.
  netSocket.on("data", data => {
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

      rz.stdin.write(Buffer.from(payload));
    } else {
      ioSocket.emit("data", data);

      // Check rz session start
      const pattern = /B00000000000000/;
      const result = pattern.exec(data.toString());
      if (result) {
        console.log("rz session found");

        netSocket.binaryTransmit = true;

        const rz = spawn("rz", ["-e", "-E", "-vv"]);

        rz.stdout.on("data", data => {
          netSocket.write(data);
        });

        rz.stderr.on("data", data => {
          const pattern = /Bytes received: ([0-9]*)\/([0-9]*).*BPS:([0-9]*) ETA ([0-9:]*)/;
          const result = pattern.exec(data.toString());
          if (result) {
            const received = parseInt(result[1], 10);
            const total = parseInt(result[2], 10);
            const bps = parseInt(result[3], 10);
            const eta = result[4];

            console.log(`[${received}/${total}] BPS[${bps}] ETA[${eta}]`);
          }
        });

        rz.on("close", code => {
          netSocket.binaryTransmit = false;
        });
      }
    }
  });

  ioSocket.on("write", text => {
    netSocket.write(Buffer.from(text));
  });
});

httpServer.listen(8080);
