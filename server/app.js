const net = require('net')
const mkdir = require('mkdirp-sync')
const http = require('http')
const spawn = require('child_process').spawn
const uuidv1 = require('uuid').v1
const iconv = require('iconv-lite')
const express = require('express')
const execSync = require('child_process').execSync
const fileUpload = require('express-fileupload')

const { TelnetSocket } = require('telnet-stream')
require('console-stamp')(console, 'yyyy/mm/dd HH:MM:ss.l')

const ECHO = 1
const TERMINAL_TYPE = 24
const WINDOW_SIZE = 31
const WILL_OPTIONS = [ECHO, TERMINAL_TYPE, WINDOW_SIZE]

const app = express()

app.use(fileUpload())
app.use(express.static(process.cwd() + '/frontend/build'))

const httpServer = http.createServer(app)
const io = require('socket.io')(httpServer, {
  cors: {
    origin: '*'
  }
})

const BBS_ADDR = 'badamelong.iptime.org'
const BBS_PORT = 1000

const fileCacheDir = process.cwd() + '/frontend/build/file-cache/'

io.on('connection', function (ioSocket) {
  console.log('Client connected:', ioSocket.client.conn.remoteAddress)

  // Remain data to be parsed
  var remain = []

  // Create client TCP Socket
  ioSocket.netSocket = net.createConnection(BBS_PORT, BBS_ADDR)

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
    if (ioSocket.rzTransmit) {
      ioSocket.rz.stdin.write(Buffer.from(buffer))
    } else if (ioSocket.szTransmit) {
      ioSocket.sz.stdin.write(Buffer.from(buffer))
    } else {
      ioSocket.tSocket.decodeStream.write(buffer)

      // Check rz
      {
        const pattern = /B00000000000000/
        const result = pattern.exec(buffer.toString())
        if (result) {
          // Create temporary for file download using uuid
          ioSocket.rzTargetDir = uuidv1()
          mkdir(fileCacheDir + ioSocket.rzTargetDir)

          ioSocket.rzTransmit = true

          ioSocket.rz = spawn('rz', ['-e', '-E', '-vv'], {
            cwd: fileCacheDir + ioSocket.rzTargetDir,
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
                ioSocket.rzFilename = result[1]
                ioSocket.emit('rz-begin', { filename: ioSocket.rzFilename })
              }
            }
            {
              const pattern =
                /Bytes received: ([0-9 ]*)\/([0-9 ]*).*BPS:([0-9 ]*)/gi

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
            ioSocket.rzTransmit = false
            execSync('find . -type f -exec mv -f {} "' + ioSocket.rzFilename + '" 2> /dev/null \\;', {
              cwd:
              fileCacheDir +
                ioSocket.rzTargetDir
            })
            ioSocket.emit('rz-end', {
              code,
              url: '/file-cache/' + ioSocket.rzTargetDir + '/' + ioSocket.rzFilename
            })
          })
        }
      }

      // Check sz
      {
        const pattern = /B0100/
        const result = pattern.exec(buffer.toString())
        if (result) {
          if (ioSocket.szFileReady) {
            ioSocket.szTransmit = true

            ioSocket.sz = spawn('sz', [ioSocket.szFilename, '-e', '-E', '-vv'], {
              cwd: fileCacheDir + ioSocket.szTargetDir,
              setsid: true
            })

            ioSocket.sz.stdout.on('data', (data) => {
              ioSocket.tSocket.write(data)
            })

            ioSocket.sz.stderr.on('data', (data) => {
              const decodedString = iconv.decode(Buffer.from(data), 'euc-kr')
              {
                const pattern = /Sending: (.*)/
                const result = pattern.exec(decodedString)
                if (result) {
                  ioSocket.emit('sz-begin', { filename: ioSocket.szFilenameUTF8 })
                }
              }
              {
                const pattern =
                  /Bytes sent: ([0-9 ]*)\/([0-9 ]*).*BPS:([0-9 ]*)/gi

                let result = null
                while ((result = pattern.exec(decodedString))) {
                  if (result) {
                    const sent = parseInt(result[1], 10)
                    const total = parseInt(result[2], 10)
                    const bps = parseInt(result[3], 10)

                    ioSocket.emit('sz-progress', { sent, total, bps })
                  }
                }
              }
            })

            ioSocket.sz.on('close', (code) => {
              ioSocket.szTransmit = false
              ioSocket.emit('sz-end', { code })
            })
          } else {
            // Send it is not supported
            ioSocket.emit(
              'data',
              '업로드할 파일이 준비되지 않았습니다.'
            )
            // Send abort
            const abortPacket = [
              24, 24, 24, 24, 24, 24, 24, 24, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 0
            ]
            ioSocket.netSocket.write(Buffer.from(abortPacket))
          }
        }
      }
    }
  })

  ioSocket.on('data', (data) => {
    ioSocket.tSocket.write(iconv.encode(Buffer.from(data), 'euc-kr'))
  })

  ioSocket.on('sz-ready', (data) => {
    console.log('sz-ready:', data)
    ioSocket.szFileReady = data.szFileReady
    ioSocket.szTargetDir = data.szTargetDir
    ioSocket.szFilenameUTF8 = data.szFilenameUTF8
    ioSocket.szFilename = data.szFilename
  })

  ioSocket.on('error', (error) => {
    console.log('Client error:', error)
  })

  ioSocket.on('disconnect', () => {
    console.log('Client disconnected:', ioSocket.client.conn.remoteAddress)
    ioSocket.netSocket.destroy()
  })

  // File upload
  app.post('/upload', function(req, res) {
    var result = true
    const receivedFile = req.files.fileToUpload

    console.log('Received a file to upload:', receivedFile)

    const szFileReady = true
    const szTargetDir = uuidv1()

    // The szFilename is euc-kr
    const szFilenameUTF8 = receivedFile.name
    const szFilename = iconv.encode(receivedFile.name, 'euc-kr').toString('ascii')

    const dir = fileCacheDir + szTargetDir
    mkdir(dir)

    // Save file to the directory
    receivedFile.mv(dir + `/${receivedFile.name}`, (err) => {
      if (err) {
        console.error('File mv error:', err)
        result = false
      }
    })

    // Rename the filename to euc-kr from utf8
    execSync('convmv --notest -f utf8 -t euckr * 2> /dev/null', {
      cwd: dir
    })

    res.send({
      result,
      szFileReady,
      szTargetDir,
      szFilenameUTF8,
      szFilename
    })
  })
})

console.log('Listening...')

httpServer.listen(9090, '0.0.0.0')
