const net = require('net')
const mkdir = require('mkdirp-sync')
const http = require('http')
const spawn = require('child_process').spawn
const execSync = require('child_process').execSync
const uuidv1 = require('uuid').v1
const iconv = require('iconv-lite')
const express = require('express')
const app = express()

require('console-stamp')(console, 'yyyy/mm/dd HH:MM:ss.l')

app.use(express.static(process.cwd() + '/frontend/build'))

const httpServer = http.createServer(app)
const io = require('socket.io')(httpServer, {
  cors: {
    origin: '*'
  }
})

const BBS_ADDR = 'bbs.olddos.kr'
const BBS_PORT = 9000
const WEB_ADDR = 'bbs.olddos.kr'

io.on('connection', function(ioSocket) {
  console.log('Client connected:', ioSocket.client.conn.remoteAddress)

  // Remain data to be parsed
  var remain = []

  // Create client TCP socket
  ioSocket.netSocket = new net.Socket()

  // True if the binary transmit mode
  ioSocket.netSocket.binaryTransmit = false

  // Generate the decode stream
  ioSocket.netSocket.decodeStream = iconv.decodeStream('euc-kr')
  ioSocket.netSocket.decodeStream.on('data', data => {
    ioSocket.emit('data', Buffer.from(data))
  })

  // Connect to the BBS server (BBS_ADDR:BBS_PORT)
  ioSocket.netSocket.connect(BBS_PORT, BBS_ADDR, () => {
    console.log('BBS connected:', ioSocket.client.conn.remoteAddress)
    // prettier-ignore
    const initPacket =
        [
          255, 251,  24, 255, 252,  32, 255, 252,
           35, 255, 252,  39, 255, 250,  24,  86,
           84,  49,  48,  48, 255, 240, 255, 251,
            1, 255, 251,  31, 255, 252,   3
        ]

    // When connected, send the init packet (pre-defined)
    ioSocket.netSocket.write(Buffer.from(initPacket))
  })

  // Deliver the bbs server close event to the ioSocket
  ioSocket.netSocket.on('close', () => {
    console.log('BBS disconnected:', ioSocket.client.conn.remoteAddress)
    ioSocket.disconnect(true)
  })

  // Data from the telnet server. Deliver it to the web client.
  ioSocket.netSocket.on('data', data => {
    if (ioSocket.netSocket.binaryTransmit) {
      const payload = []

      data = [...remain, ...data]
      remain = []

      var index = 0
      while (index < data.length) {
        if (data[index] != 255) {
          payload.push(data[index])
          index++
        } else {
          if (index == data.length - 1) {
            remain.push(255)
            break
          } else if (data[index + 1] == 255) {
            payload.push(255)
            index += 2
          } else if (data[index + 1] >= 239 && data[index + 1] < 255) {
            index += 3
          } else {
            index += 2
          }
        }
      }

      // At this line, ioSocket.netSocket.rz must be exist
      ioSocket.netSocket.rz.stdin.write(Buffer.from(payload))
    } else {
      ioSocket.netSocket.decodeStream.write(data)

      // Check rz session start
      const pattern = /B00000000000000/
      const result = pattern.exec(data.toString())
      if (result) {
        // Create temporary for file download using uuid
        ioSocket.netSocket.rzTargetDir = uuidv1()
        mkdir(
          process.cwd() +
            '/frontend/dist/file-cache/' +
            ioSocket.netSocket.rzTargetDir
        )

        ioSocket.netSocket.binaryTransmit = true

        ioSocket.netSocket.rz = spawn('rz', ['-e', '-E', '-vv'], {
          cwd:
            process.cwd() +
            '/frontend/dist/file-cache/' +
            ioSocket.netSocket.rzTargetDir,
          setsid: true
        })

        ioSocket.netSocket.rz.stdout.on('data', data => {
          ioSocket.netSocket.write(data)
        })

        ioSocket.netSocket.rz.stderr.on('data', data => {
          const decodedString = iconv.decode(Buffer.from(data), 'euc-kr')
          {
            const pattern = /Receiving: (.*)/
            const result = pattern.exec(decodedString)
            if (result) {
              ioSocket.netSocket.rzFileName = result[1]
              ioSocket.emit('rz-begin', ioSocket.netSocket.rzFileName)
            }
          }
          {
            const pattern = /Bytes received: ([0-9]*)\/([0-9]*).*BPS:([0-9]*)/gi

            let result = null
            while (result = pattern.exec(decodedString)) {
              if (result) {
                const received = parseInt(result[1], 10)
                const total = parseInt(result[2], 10)
                const bps = parseInt(result[3], 10)

                ioSocket.emit('rz-progress', {
                  received,
                  total,
                  bps
                })
              }
            }
          }
        })

        ioSocket.netSocket.rz.on('close', code => {
          ioSocket.netSocket.binaryTransmit = false

          // When close, KSC5601 file name is broken on the UTF-8 System.
          // Should decode the file name to UTF-8
          execSync('mv * ' + ioSocket.netSocket.rzTargetDir, {
            cwd:
              process.cwd() +
              '/frontend/dist/file-cache/' +
              ioSocket.netSocket.rzTargetDir
          })
          execSync('mv * "' + ioSocket.netSocket.rzFileName + '"', {
            cwd:
              process.cwd() +
              '/frontend/dist/file-cache/' +
              ioSocket.netSocket.rzTargetDir
          })

          ioSocket.emit('rz-end', {
            code,
            url:
              'http://' +
              WEB_ADDR +
              '/file-cache/' +
              ioSocket.netSocket.rzTargetDir +
              '/' +
              ioSocket.netSocket.rzFileName
          })
        })
      }
    }
  })

  ioSocket.on('data', data => {
    ioSocket.netSocket.write(iconv.encode(Buffer.from(data), 'euc-kr'))
  })

  ioSocket.on('error', error => {
    console.log('Client error:', error)
  })

  ioSocket.on('disconnect', () => {
    console.log('Client disconnected:', ioSocket.client.conn.remoteAddress)
    ioSocket.netSocket.destroy()
  })
})

console.log('Listening...')

httpServer.listen(8080, '0.0.0.0')
