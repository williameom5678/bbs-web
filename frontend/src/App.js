import cookies from 'browser-cookies'
import copy from 'copy-to-clipboard'
import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Nav,
  Modal,
  ProgressBar,
  Navbar,
  NavDropdown
} from 'react-bootstrap'
import io from 'socket.io-client'
import './App.scss'
import LoadingModal from './LoadingModal'
import THEMES from './themes'

const prettyBytes = require('pretty-bytes')
const debug = require('debug')('bbs-web')

const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 528

const FONT_WIDTH = 8
const FONT_HEIGHT = 16
const SCREEN_HEIGHT = 33

const SMART_MOUSE_BORDER = 2

let WINDOW_TOP = 0
let WINDOW_BOTTOM = SCREEN_HEIGHT - 1

const COLOR = []
const FONTS = [
  { name: '둥근모', value: 'neodgm' },
  { name: '굵은체', value: 'neoiyg' },
  { name: '필기체', value: 'neopil' },
  { name: '굵은달', value: 'neoancient' },
  { name: '샘물체', value: 'neowater' }
]
const DISPLAYS = ['VGA', 'ACI', 'HERCULES']

let _io = null
let _ctx2d = null
let _rate = 1.0
let _selectedDisplay = 'VGA'
let _selectedFont = 'neodgm'
let _escape = null
let _cursor = { x: 0, y: 0 }
let _cursorStore = { x: 0, y: 0 }
let _attr = { textColor: 15, backgroundColor: 1, reversed: false }
let _lastPageText = ''
let _lastPageTextPos = []
let _smartMouse = []
let _smartMouseCmd = null

function App() {
  const [connDiag, setConnDiag] = useState(true)
  const [command, setCommand] = useState('')
  const [commandType, setCommandType] = useState('text')

  const [applyDiag, setApplyDiag] = useState(false)

  const [rzDiag, setRzDiag] = useState(false)
  const [rzDiagText, setRzDiagText] = useState('')
  const [rzProgress, setRzProgress] = useState('')
  // const [rzFilename, setRzFilename] = useState('')
  var rzFilename = ''
  const [rzReceived, setRzReceived] = useState(0)
  const [rzFinished, setRzFinished] = useState(false)
  const [rzTotal, setRzTotal] = useState(1) // Set 1 as default value to prevent div with zero
  const [rzUrl, setRzUrl] = useState(null)

  const terminalRef = useRef()
  const smartMouseBoxRef = useRef()
  const commandRef = useRef()

  const fontSelected = (font) => {
    _selectedFont = font
    displayChanged(false)
  }

  const displaySelected = (display) => {
    _selectedDisplay = display
    displayChanged(false)
  }

  const onResize = () => {
    rebuildSmartMouse()
    moveCommandInputPosition()
  }

  const copyToClipboard = () => {
    let normalText = ''
    let esc = false

    for (const ch of _lastPageText) {
      if (!esc && ch === '\x1b') {
        esc = true
        continue
      }

      if (esc && '@ABCDFGHJKSfhlmprsu'.indexOf(ch) !== -1) {
        esc = false
        continue
      }

      if (!esc) {
        normalText += ch
      }
    }

    normalText = normalText.replace(/\x0d\x00/gi, '')

    if (copy(normalText)) {
      alert('현재 화면이 클립보드에 복사되었습니다.')
    } else {
      alert('클립보드에 복사 중 오류가 발생하였습니다.')
    }
  }

  const terminalClicked = () => {
    commandRef.current.focus()
  }

  const mouseMove = (clientX, clientY) => {
    const mouseX = clientX - terminalRef.current.getBoundingClientRect().left
    const mouseY = clientY - terminalRef.current.getBoundingClientRect().top

    for (const sm of _smartMouse) {
      if (
        mouseX >= sm.px.x &&
        mouseY >= sm.px.y &&
        mouseX < sm.px.x + sm.px.width &&
        mouseY < sm.px.y + sm.px.height
      ) {
        // Intenally set the smart mouse command
        _smartMouseCmd = sm.command

        // Mouse smart mouse box to the position
        smartMouseBoxRef.current.style.left =
          sm.px.x -
          SMART_MOUSE_BORDER +
          terminalRef.current.getBoundingClientRect().left +
          window.pageXOffset +
          'px'
        smartMouseBoxRef.current.style.top =
          sm.px.y -
          SMART_MOUSE_BORDER +
          terminalRef.current.getBoundingClientRect().top +
          window.pageYOffset +
          'px'
        smartMouseBoxRef.current.style.width =
          sm.px.width + 2 * SMART_MOUSE_BORDER + 'px'
        smartMouseBoxRef.current.style.height =
          sm.px.height + 2 * SMART_MOUSE_BORDER + 'px'
        smartMouseBoxRef.current.style.visibility = 'visible'

        return
      }
    }

    // If no smart mouse position has detected, hide the smart mouse box
    smartMouseBoxRef.current.style.visibility = 'hidden'
  }

  const smartMouseClicked = () => {
    if (/https?:\/\//.exec(_smartMouseCmd)) {
      window.open(_smartMouseCmd, '_blank')
    } else {
      enterCommand(_smartMouseCmd)
    }

    smartMouseBoxRef.current.style.visibility = 'hidden'
    _smartMouseCmd = ''

    terminalClicked()
  }

  const onKeyUp = (key) => {
    if (key === 'Enter') {
      enterCommand(command)
    }
  }

  const doubleWidth = (ch) => {
    return ch.charCodeAt(0) >= 0x80 && _ctx2d.measureText(ch).width <= 9
  }

  const screenScrollUp = () => {
    const copy = _ctx2d.getImageData(
      0,
      FONT_HEIGHT * (WINDOW_TOP + 1),
      CANVAS_WIDTH,
      FONT_HEIGHT * (WINDOW_BOTTOM - WINDOW_TOP)
    )
    _ctx2d.putImageData(copy, 0, FONT_HEIGHT * WINDOW_TOP)
    _ctx2d.fillStyle = COLOR[_attr.backgroundColor]
    _ctx2d.fillRect(0, WINDOW_BOTTOM * FONT_HEIGHT, CANVAS_WIDTH, FONT_HEIGHT)

    // Modify the position of _lastPageTextPos (scroll up)
    for (const pos of _lastPageTextPos) {
      if (pos.y >= WINDOW_TOP && pos.y <= WINDOW_BOTTOM) {
        pos.y--
      }
    }
  }

  const cr = () => {
    _cursor.x = 0
  }

  const lf = () => {
    _cursor.y++
    if (_cursor.y > WINDOW_BOTTOM) {
      _cursor.y = WINDOW_BOTTOM
      screenScrollUp()
    }
  }

  const enterCommand = (command) => {
    if (command) {
      _io.emit('data', `${command}\r\n`)
    } else {
      _io.emit('data', '\r\n')
    }
    setCommand('')
  }

  const displayChanged = (isInitial = false) => {
    for (let i = 0; i < 16; i++) {
      COLOR[i] = THEMES[_selectedDisplay][i]
    }

    terminalRef.current.style.fontFamily = _selectedFont
    commandRef.current.style.fontFamily = _selectedFont

    _ctx2d.font = `normal 16px ${_selectedFont}`

    terminalClicked()

    cookies.set('display', _selectedDisplay, { expires: 365 })
    cookies.set('font', _selectedFont, { expires: 365 })

    if (!isInitial) {
      setApplyDiag(true)

      setTimeout(() => {
        // Clear whole webpage
        document.getElementsByTagName('body')[0].style.backgroundColor =
          COLOR[_attr.backgroundColor]

        terminalRef.current.style.backgroundColor = COLOR[_attr.backgroundColor]

        // Rewrite last page text
        write(_lastPageText)
        setApplyDiag(false)

        terminalClicked()
      }, 4000)
    }
  }

  const setupTerminal = () => {
    _selectedDisplay = cookies.get('display') ?? 'VGA'
    _selectedFont = cookies.get('font') ?? 'neodgm'

    // Value check for the prevent error by the previous value
    if (!DISPLAYS.includes(_selectedDisplay)) {
      _selectedDisplay = 'VGA'
    }
    if (!FONTS.includes(_selectedFont)) {
      _selectedFont = 'neodgm'
    }

    _ctx2d = terminalRef.current.getContext('2d')
    if (_ctx2d) {
      _ctx2d.fillStyle = COLOR[_attr.textColor]
      _ctx2d.font = 'normal 16px ' + _selectedFont
      _ctx2d.textBaseline = 'top'
    } else {
      alert('error: cannot create a canvas context2d!')
    }

    displayChanged(true)
  }

  const rzClose = () => {
    setRzDiag(false)
    setRzFinished(false)
    setRzReceived(0)
    setRzTotal(0)
    //setRzFilename('')
    rzFilename = ''
    terminalClicked()
  }

  const onBeforeUnload = () => {
    _io.disconnect()
  }

  const setupNetwork = () => {
    // Need to wait some time for download TTF fonts
    setTimeout(() => {
      const host = 'http://bbs.olddos.kr:9001'

      debug('Start conecting...')
      _io = io(host)

      _io.on('connect', () => {
        debug('Connected')
        setConnDiag(false)
        terminalClicked()
      })

      _io.on('disconnect', () => {
        debug('Disconnected')
        write('접속이 종료되었습니다.\r\n')
      })

      _io.on('data', (data) => {
        // Check if the password input phrase
        const pattern = /비밀번호 : /
        const result = pattern.exec(Buffer.from(data).toString())
        if (result) {
          setCommandType('password')
        } else {
          setCommandType('text')
        }
        write(Buffer.from(data).toString())
      })

      _io.on('rz-begin', (begin) => {
        debug(`rz-begin: ${begin.filename}`)

        // setRzFilename(begin.filename)
        rzFilename = begin.filename
        setRzDiag(true)
        setRzFinished(false)
        setRzReceived(0)
        setRzTotal(0)
        setRzDiagText(`파일 준비중: ${begin.filename}`)
      })

      _io.on('rz-progress', (progress) => {
        setRzReceived(progress.received)
        setRzTotal(progress.total)
        setRzProgress(`${prettyBytes(progress.received)} / ${prettyBytes(progress.total)}`)
      })

      _io.on('rz-end', (result) => {
        if (result.code === 0) {
          setRzFinished(true)

          setRzDiagText(`파일 준비 완료: ${rzFilename}`)
          setRzUrl(result.url)
        } else {
          alert('error: download failure!')
        }
      })
    }, 4000)
  }

  const applyEscape = () => {
    // Text color
    {
      const pattern = /\[=([0-9]*)F/
      const result = pattern.exec(_escape)
      if (result) {
        const param1 = parseInt(result[1], 10)
        _attr.textColor = isNaN(param1) ? 15 : param1
      }
    }
    // Background color
    {
      const pattern = /\[=([0-9]*)G/
      const result = pattern.exec(_escape)
      if (result) {
        const param1 = parseInt(result[1], 10)
        _attr.backgroundColor = isNaN(param1) ? 1 : param1
      }
    }
    // Reverse color
    {
      const pattern = /\[([0-9]*)m/
      const result = pattern.exec(_escape)
      if (result) {
        const param1 = parseInt(result[1], 10)
        if (!isNaN(param1)) {
          if (param1 === 7) {
            _attr.reversed = true
          } else {
            _attr.reversed = false
          }
        } else {
          _attr.reversed = false
        }
      }
    }
    // Cursor position set
    {
      // Move _cursor to specific position
      {
        const pattern = /\[([0-9]*);([0-9]*)H/
        const result = pattern.exec(_escape)
        if (result) {
          const param1 = parseInt(result[1], 10)
          const param2 = parseInt(result[2], 10)

          _cursor.y = isNaN(param1) ? 0 : param1 - 1
          _cursor.x = isNaN(param2) ? 0 : param2 - 1
        } else {
          const pattern = /\[([0-9]*)H/
          const result = pattern.exec(_escape)
          if (result) {
            const param1 = parseInt(result[1], 10)
            _cursor.y = isNaN(param1) ? 0 : param1 - 1
            _cursor.x = 0
          }
        }
      }
      // Move _cursor y
      {
        const pattern = /\[([0-9]*)A/
        const result = pattern.exec(_escape)
        if (result) {
          const param1 = parseInt(result[1], 10)
          _cursor.y -= isNaN(param1) ? 0 : param1
          if (_cursor.y < 0) {
            _cursor.y = 0
            _cursor.x = 0
          }
        }
      }
      // Move _cursor x
      {
        const pattern = /\[([0-9]*)C/
        const result = pattern.exec(_escape)
        if (result) {
          const param1 = parseInt(result[1], 10)
          _cursor.x = isNaN(param1) ? 0 : param1 - 1
        }
      }
      // Store and restore the _cursor position
      {
        if (_escape === '[s') {
          _cursorStore = { x: _cursor.x, y: _cursor.y }
        } else if (_escape === '[u') {
          _cursor = { x: _cursorStore.x, y: _cursorStore.y }
        }
      }
    }
    // Clear the screen
    {
      if (_escape === '\x1b[2J') {
        _ctx2d.fillStyle = COLOR[_attr.backgroundColor]
        _ctx2d.fillRect(
          0,
          0,
          terminalRef.current.width,
          terminalRef.current.height
        )

        // Clear whole webpage
        document.getElementsByTagName('body')[0].style.backgroundColor =
          COLOR[_attr.backgroundColor]

        // Refresh _lastPageText (after 2J, there is no any other text)
        _lastPageText = '\x1b[2J'
        _lastPageTextPos = [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 }
        ]
        _cursor.x = 0
        _cursor.y = 0
      }
    }
    // Clear a line
    {
      if (_escape.endsWith('[2K')) {
        _ctx2d.fillStyle = COLOR[_attr.backgroundColor]
        _ctx2d.fillRect(
          0,
          _cursor.y * FONT_HEIGHT,
          terminalRef.current.clientWidth,
          FONT_HEIGHT
        )
      } else if (_escape.endsWith('[1K')) {
        _ctx2d.fillStyle = COLOR[_attr.backgroundColor]
        _ctx2d.fillRect(
          0,
          _cursor.y * FONT_HEIGHT,
          (_cursor.x + 1) * FONT_WIDTH,
          FONT_HEIGHT
        )
      } else if (_escape.endsWith('[0K') || _escape.endsWith('[K')) {
        _ctx2d.fillStyle = COLOR[_attr.backgroundColor]
        _ctx2d.fillRect(
          _cursor.x * FONT_WIDTH,
          _cursor.y * FONT_HEIGHT,
          terminalRef.current.clientWidth - _cursor.x * FONT_WIDTH,
          FONT_HEIGHT
        )
      }
    }
    // Set the window area
    {
      const pattern = /\[([0-9]*);([0-9]*)r/
      const result = pattern.exec(_escape)
      if (result) {
        const param1 = parseInt(result[1], 10)
        const param2 = parseInt(result[2], 10)
        const scrollFrom = isNaN(param1) ? 0 : param1 - 1
        const scrollTo = isNaN(param2) ? 0 : param2 - 1

        // Reset the window height
        if (scrollFrom <= 0 && scrollTo <= 0) {
          WINDOW_TOP = 0
          WINDOW_BOTTOM = SCREEN_HEIGHT - 1
        } else {
          WINDOW_TOP = scrollFrom
          WINDOW_BOTTOM = scrollTo
        }
      }
    }
  }

  const endOfEscape = () => {
    if (!_escape) {
      return false
    }
    const lastChar = _escape.charAt(_escape.length - 1)
    if ('@ABCDFGHJKSfhlmprsu'.indexOf(lastChar) !== -1) {
      return true
    } else {
      return false
    }
  }

  const rebuildSmartMouse = () => {
    _smartMouse = []
    smartMouseBoxRef.current.style.visibility = 'hidden'

    const smartMousePatterns = [
      /([0-9]+)\.\s[ㄱ-힣a-z/\s]+/gi, // 99. xx
      /\[([0-9]+)\]\s[ㄱ-힣a-z/\s]+/gi, // [99].xx
      /\(([a-z]+),/gi, // (x,
      /,([a-z]+),/gi, // ,x,
      /,([a-z]+)\)/gi, // ,x)
      /\(([a-z]+)\)/gi, // (x)
      /\[([a-z0-9]+)\]/gi, // [x]
      /(https?:\/\/[a-z0-9-\.\/?&_=#]+)/gi, // URL
      /([0-9]+) +.+ +[0-9-]+ +[0-9]+ + [0-9]+ +.*/gi, // Article
      /([0-9]+) +[0-9\.]+ .*/gi, // News (JTBC)
      /([0-9]+) +.+ +[0-9-]+ .*/gi, // News (Oh my news, IT news)
      /([0-9]+) +(JTBC|오마이뉴스|전자신문|속보|정치|연예|전체기사|주요기사|사회|오늘의 뉴스|게임)/gi // News Titles
    ]

    for (const pattern of smartMousePatterns) {
      var result = null
      while ((result = pattern.exec(_lastPageText))) {
        // Remove ANSI _escape code from the string(result[0])
        result[0] = result[0].replace(/\x1b\[=.{1,3}[FG]{1}/gi, '').trim()

        // If there is doubleWidthCharacter, replace it to '가' for correct measuring
        var normalText = ''
        for (const ch of result[0]) {
          if (doubleWidth(ch)) {
            normalText += '가'
          } else {
            normalText += ch
          }
        }

        const link = {
          command: result[1],
          px: {
            x: _lastPageTextPos[result.index].x * FONT_WIDTH * _rate,
            y: _lastPageTextPos[result.index].y * FONT_HEIGHT * _rate,
            width: _ctx2d.measureText(normalText).width * _rate,
            height: FONT_HEIGHT * _rate
          }
        }
        _smartMouse.push(link)
      }
    }
  }

  const moveCommandInputPosition = () => {
    const bcr = terminalRef.current.getBoundingClientRect()

    _rate = bcr.width / CANVAS_WIDTH
    const scaledCursorX = _cursor.x * FONT_WIDTH * _rate
    const scaledCursorY = _cursor.y * FONT_HEIGHT * _rate

    const tmLeft = bcr.left + window.pageXOffset
    const tmTop = bcr.top + window.pageYOffset
    const tmWidth = bcr.width

    const cmLeft = tmLeft + scaledCursorX
    const cmTop = tmTop + scaledCursorY - (20 - 16 * _rate) / 2
    const cmWidth = tmWidth - (cmLeft - tmLeft)

    commandRef.current.style.left = `${cmLeft}px`
    commandRef.current.style.top = `${cmTop}px`
    commandRef.current.style.width = `${cmWidth}px`

    commandRef.current.style.fontSize = `${16 * _rate}px`
    commandRef.current.style.height = '20px'
  }

  const write = (text) => {
    for (const ch of text) {
      _lastPageText += ch
      _lastPageTextPos.push({ x: _cursor.x, y: _cursor.y })
      if (_escape) {
        _escape = _escape + ch
        if (endOfEscape()) {
          applyEscape()
          _escape = null
        }
      } else {
        switch (ch.charCodeAt(0)) {
          case 27:
            _escape = '\x1b'
            break

          case 13:
            cr()
            break

          case 10:
            lf()
            break

          case 0: // NULL
          case 24: // ZDLE
          case 17: // XON
          case 138: // LF of sz
          case 65533: // Unknown
            break

          default:
            {
              const charWidth = ch.charCodeAt(0) < 0x80 ? 1 : 2
              const cursor_px = {
                x: _cursor.x * FONT_WIDTH,
                y: _cursor.y * FONT_HEIGHT
              }
              let textColor = COLOR[_attr.textColor]
              let backgroundColor = COLOR[_attr.backgroundColor]

              if (doubleWidth(ch)) {
                _ctx2d.save()
                _ctx2d.scale(2, 1)
                cursor_px.x /= 2
              }

              if (_attr.reversed) {
                textColor = COLOR[_attr.backgroundColor]
                backgroundColor = COLOR[_attr.textColor]
              }

              _ctx2d.fillStyle = backgroundColor
              _ctx2d.fillRect(
                cursor_px.x,
                cursor_px.y,
                charWidth * FONT_WIDTH,
                FONT_HEIGHT
              )
              _ctx2d.fillStyle = textColor
              _ctx2d.fillText(ch, cursor_px.x, cursor_px.y)

              if (doubleWidth(ch)) {
                _ctx2d.restore()
              }

              _cursor.x += charWidth
            }
            break
        }
      }
    }

    // Rebuild smart mouse
    rebuildSmartMouse()

    // Move the command textfield to the _cursor position
    moveCommandInputPosition()
  }

  useEffect(() => {
    debug('Setup')

    setupTerminal()
    setupNetwork()
    window.addEventListener('resize', onResize)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      window.removeEventListener('resize', this.onResize)
      window.removeEventListener('beforeunload', this.onBeforeUnload)
    }
  }, [])

  return (
    <div>
      <Navbar>
        <img src="/logo.png" className="mr-2" width="24px" height="24px" />
        <Navbar.Brand style={{ paddingBottom: '0.45rem' }}>
          <span style={{ fontSize: '1rem', color: 'yellow' }}>도</span>
          <span style={{ fontSize: '1rem', color: 'white' }}>/</span>
          <span style={{ fontSize: '1rem', color: 'red' }}>스</span>
          <span style={{ fontSize: '1rem', color: 'white' }}>/</span>
          <span style={{ fontSize: '1rem', color: 'cyan' }}>박</span>
          <span style={{ fontSize: '1rem', color: 'white' }}>/</span>
          <span style={{ fontSize: '1rem', color: 'lightgreen' }}>물</span>
          <span style={{ fontSize: '1rem', color: 'white' }}>/</span>
          <span style={{ fontSize: '1rem', color: 'yellow' }}>관</span>
        </Navbar.Brand>
        <Nav onSelect={(selectedKey) => fontSelected(selectedKey)}>
          <NavDropdown title="글꼴">
            {FONTS.map((font) => (
              <NavDropdown.Item key={font.value} eventKey={font.value}>
                {font.name}
              </NavDropdown.Item>
            ))}
          </NavDropdown>
        </Nav>
        <Nav onSelect={(selectedKey) => displaySelected(selectedKey)}>
          <NavDropdown title="색상">
            {DISPLAYS.map((display) => (
              <NavDropdown.Item key={display} eventKey={display}>
                {display}
              </NavDropdown.Item>
            ))}
          </NavDropdown>
        </Nav>
        <Button onClick={() => copyToClipboard()}>갈무리</Button>
      </Navbar>
      <div className="text-center mt-3">
        <canvas
          ref={terminalRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-100"
          style={{ maxWidth: '700px' }}
          onClick={() => terminalClicked()}
          onMouseMove={(event) => mouseMove(event.clientX, event.clientY)}
        ></canvas>
        <div
          ref={smartMouseBoxRef}
          className="smart-mouse-box"
          onClick={() => smartMouseClicked()}
        ></div>
        <input
          ref={commandRef}
          type={commandType}
          className="command"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyUp={(event) => onKeyUp(event.key)}
        />
      </div>
      <div className="text-center mt-3">
        <a href="mailto:gcjjyy@icloud.com">© 2019 gcjjyy@icloud.com</a>
      </div>
      <Modal show={rzDiag} size="xs" backdrop="static" centered>
        <Modal.Header>{rzDiagText}</Modal.Header>
        <Modal.Body className="text-center m-4">
          {rzProgress}
          <ProgressBar
            animated
            now={parseInt((rzReceived / rzTotal) * 100)}
            label={`${parseInt((rzReceived / rzTotal) * 100)}%`}
          />
        </Modal.Body>
        {rzFinished && (
          <div className="text-center m-3">
            <a href={rzUrl} download type="application/octet-stream">
              <Button className="w-50 mr-3">다운로드</Button>
            </a>
            <Button onClick={() => rzClose()}>닫기</Button>
          </div>
        )}
      </Modal>
      <LoadingModal show={connDiag} message="접속 중입니다.." />
      <LoadingModal show={applyDiag} message="적용 중입니다.." />
    </div>
  )
}

export default App
