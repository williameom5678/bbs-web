const net = require('net')
const mkdir = require('mkdirp-sync')
const http = require('http')
const spawn = require('child_process').spawn
const uuidv1 = require('uuid').v1
const iconv = require('iconv-lite')
const express = require('express')
const execSync = require('child_process').execSync

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
const WEB_ADDR = 'bbs.olddos.kr:9001'

io.on('connection', function (ioSocket) {
  console.log('Client connected:', ioSocket.client.conn.remoteAddress)

  // Remain data to be parsed
  var remain = []

  // Create client TCP Socket
  ioSocket.netSocket = net.createConnection(9000, 'bbs.olddos.kr')

  // Create Telnet Procotol Stream
  ioSocket.tSocket = new TelnetSocket(ioSocket.netSocket)

  // Generate the decode stream
  ioSocket.tSocket.decodeStream = iconv.decodeStream('euc-kr')
  ioSocket.tSocket.decodeStream.on('data', (data) => {
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
    if (ioSocket.binaryTransmit) {
      ioSocket.rz.stdin.write(Buffer.from(buffer))
    } else {
      ioSocket.tSocket.decodeStream.write(buffer)

      // Check rz
      {
        const pattern = /B00000000000000/
        const result = pattern.exec(buffer.toString())
        if (result) {
          // Create temporary for file download using uuid
          ioSocket.rzTargetDir = uuidv1()
          mkdir(
            process.cwd() + '/frontend/build/file-cache/' + ioSocket.rzTargetDir
          )

          ioSocket.binaryTransmit = true

          ioSocket.rz = spawn('rz', ['-e', '-E', '-vv'], {
            cwd:
              process.cwd() +
              '/frontend/build/file-cache/' +
              ioSocket.rzTargetDir,
            setsid: true
          })

          ioSocket.rz.stdout.on('data', (data) => {
            ioSocket.tSocket.write(data)
          })

          ioSocket.rz.stderr.on('data', (data) => {
            const decodedString = iconv.decode(Buffer.from(data), 'euc-kr')
            {
              const pattern = /Receiving: (.*)/
              const result = pattern.exec(decodedString)
              if (result) {
                ioSocket.rzFileName = result[1]
                ioSocket.emit('rz-begin', { filename: ioSocket.rzFileName })
              }
            }
            {
              const pattern =
                /Bytes received: ([0-9 ]*)\/([0-9]*).*BPS:([0-9]*)/gi

              let result = null
              while ((result = pattern.exec(decodedString))) {
                if (result) {
                  const received = parseInt(result[1], 10)
                  const total = parseInt(result[2], 10)
                  const bps = parseInt(result[3], 10)

                  ioSocket.emit('rz-progress', { received, total, bps })
                }
              }
            }
          })

          ioSocket.rz.on('close', (code) => {
            ioSocket.binaryTransmit = false
            execSync('find', ['.', '-type f', '-exec mv -f {} ' + ioSocket.rzFileName + ' 2> /dev/null \;'], {
              cwd:
                process.cwd() +
                '/frontend/build/file-cache/' +
                ioSocket.rzTargetDir
            })
            ioSocket.emit('rz-end', {
              code,
              url:
                'http://' +
                WEB_ADDR +
                '/file-cache/' +
                ioSocket.rzTargetDir +
                '/' +
                ioSocket.rzFileName
            })
          })
        }
      }

      // Check sz
      {
        const pattern = /B0100/
        const result = pattern.exec(buffer.toString())
        if (result) {
          // Send it is not supported
          ioSocket.emit(
            'data',
            'Web Client에서는 파일 업로드를 지원하지 않습니다.'
          )
          // Send abort
          const abortPacket = [
            24, 24, 24, 24, 24, 24, 24, 24, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 0
          ]
          ioSocket.netSocket.write(Buffer.from(abortPacket))
        }
      }
    }
  })

  ioSocket.on('data', (data) => {
    ioSocket.tSocket.write(iconv.encode(Buffer.from(data), 'euc-kr'))
  })

  ioSocket.on('error', (error) => {
    console.log('Client error:', error)
  })

  ioSocket.on('disconnect', () => {
    console.log('Client disconnected:', ioSocket.client.conn.remoteAddress)
    ioSocket.netSocket.destroy()
  })
})

console.log('Listening...')

httpServer.listen(8080, '0.0.0.0')
