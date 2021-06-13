const net = require('net')
const http = require('http')
const iconv = require('iconv-lite')
const express = require('express')
const { TelnetSocket } = require('telnet-stream')
require('console-stamp')(console, 'yyyy/mm/dd HH:MM:ss.l')

const ECHO = 1
const TERMINAL_TYPE = 24
const WINDOW_SIZE = 31
const WILL_OPTIONS = [ECHO, TERMINAL_TYPE, WINDOW_SIZE]

const app = express()

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

  // Create client TCP Socket
  ioSocket.netSocket = net.createConnection(9000, 'bbs.olddos.kr')

  // Create Telnet Procotol Stream
  ioSocket.tSocket = new TelnetSocket(ioSocket.netSocket)

  // Generate the decode stream
  ioSocket.tSocket.decodeStream = iconv.decodeStream('euc-kr')
  ioSocket.tSocket.decodeStream.on('data', data => {
    ioSocket.emit('data', Buffer.from(data))
  })

  ioSocket.tSocket.on('do', (option) => {
    if (WILL_OPTIONS.includes(option)) {
      ioSocket.tSocket.writeWill(option)
  
      if (option == TERMINAL_TYPE) {
        ioSocket.tSocket.writeSub(TERMINAL_TYPE, Buffer.from('VT100'))
      }
    } else {
      ioSocket.tSocket.writeWont(option)
    }
  })

  ioSocket.tSocket.on('close', () => {
    console.log('BBS disconnected:', ioSocket.client.conn.remoteAddress)
    ioSocket.disconnect(true)
  })

  // Handling data from the telnet stream
  ioSocket.tSocket.on('data', (buffer) => {
    ioSocket.tSocket.decodeStream.write(buffer)

    // Check rz
    {
      const pattern = /B00000000000000/
      const result = pattern.exec(buffer.toString())
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
      const result = pattern.exec(buffer.toString())
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
  });

  ioSocket.on('data', data => {
    ioSocket.tSocket.write(iconv.encode(Buffer.from(data), 'euc-kr'))
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
