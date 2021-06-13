const net = require('net')
const mkdir = require('mkdirp-sync')
const http = require('http')
const spawn = require('child_process').spawn
const execSync = require('child_process').execSync
const uuidv1 = require('uuid').v1
const iconv = require('iconv-lite')
const express = require('express')
const app = express()
const debug = require('debug')('bbs-web/server')

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

io.on('connection', function(ioSocket) {
  console.log('Client connected:', ioSocket.client.conn.remoteAddress)

  // Remain data to be parsed
  var remain = []

  // Create client TCP socket
  ioSocket.netSocket = new net.Socket()

  // Generate the decode stream
  ioSocket.netSocket.decodeStream = iconv.decodeStream('euc-kr')
  ioSocket.netSocket.decodeStream.on('data', data => {
    ioSocket.emit('data', Buffer.from(data))
  })

  try {
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
  } catch {
    console.log('Connection failed..')
  }

  // Deliver the bbs server close event to the ioSocket
  ioSocket.netSocket.on('close', () => {
    console.log('BBS disconnected:', ioSocket.client.conn.remoteAddress)
    ioSocket.disconnect(true)
  })

  // Data from the telnet server. Deliver it to the web client.
  ioSocket.netSocket.on('data', data => {
    ioSocket.netSocket.decodeStream.write(data)

    // Check rz
    {
      const pattern = /B00000000000000/
      const result = pattern.exec(data.toString())
      if (result) {
        // Send it is not supported
        ioSocket.emit('data', 'Web Client에서는 파일 다운로드를 지원하지 않습니다.')
        // Send abort
        const abortPacket = [
          24, 24, 24, 24, 24, 24, 24, 24, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 0
        ]
        ioSocket.netSocket.write(Buffer.from(abortPacket))
      }
    }

    // Check sz
    {
      const pattern = /B0100/
      const result = pattern.exec(data.toString())
      if (result) {
        // Send it is not supported
        ioSocket.emit('data', 'Web Client에서는 파일 업로드를 지원하지 않습니다.')
        // Send abort
        const abortPacket = [
          24, 24, 24, 24, 24, 24, 24, 24, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 0
        ]
        ioSocket.netSocket.write(Buffer.from(abortPacket))
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
