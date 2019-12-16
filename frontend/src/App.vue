<template>
  <v-app>
    <v-content>
      <v-toolbar dark dense>
        <v-toolbar-title class="subtitle-1 text-uppercase">
          <img
            src="apple-icon.png"
            style="vertical-align: middle; margin-right: 8px"
            width="24px"
            height="24px"
          />
          <span style="color: yellow">도</span>
          <span style="color: white">/</span>
          <span style="color: red">스</span>
          <span style="color: white">/</span>
          <span style="color: cyan">박</span>
          <span style="color: white">/</span>
          <span style="color: lightgreen">물</span>
          <span style="color: white">/</span>
          <span style="color: yellow">관</span>
          <span style="color: white">/</span>
          <span style="color: white">BBS</span>
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-toolbar-items>
          <v-btn @click="copyToClipboard()"
            ><v-icon>mdi-clipboard-text-outline</v-icon></v-btn
          >
          <v-select
            :items="fonts"
            v-model="selectedFont"
            @change="displayChanged()"
            label="글꼴"
            style="width: 110px"
            solo
          ></v-select>
          <v-select
            :items="displays"
            v-model="selectedDisplay"
            @change="displayChanged()"
            label="디스플레이"
            style="width: 130px"
            solo
          ></v-select>
          <!--
          <v-btn @click="uploadFile()" style="width: 160px"
            >업로드파일 준비</v-btn
          >
          -->
        </v-toolbar-items>
      </v-toolbar>
      <div class="text-center">
        <canvas
          id="terminal"
          ref="terminal"
          width="640"
          height="528"
          @click="terminalClicked()"
          @mousemove="mouseMove"
        ></canvas>
        <div
          ref="smartMouseBox"
          class="smart-mouse-box"
          @click="smartMouseClicked()"
        ></div>
        <input
          id="command"
          ref="command"
          v-model="command"
          :type="commandType"
          @keyup.enter="enterCommand()"
        />

        <v-dialog v-model="connDiag" persistent width="256">
          <v-card>
            <v-card-text class="text-center">
              <p class="margin-16">접속 중입니다..</p>
              <v-progress-circular
                :size="48"
                :width="7"
                color="purple"
                indeterminate
                style="margin: 32px"
              ></v-progress-circular>
            </v-card-text>
          </v-card>
        </v-dialog>

        <v-dialog v-model="applyDiag" persistent width="256">
          <v-card>
            <v-card-text class="text-center">
              <p class="margin-16">적용 중입니다..</p>
              <v-progress-circular
                :size="48"
                :width="7"
                color="green"
                indeterminate
                style="margin: 32px"
              ></v-progress-circular>
            </v-card-text>
          </v-card>
        </v-dialog>

        <v-dialog v-model="rzDiag" persistent width="256">
          <v-card>
            <v-card-text class="text-center">
              <div ref="rzDiagText" class="margin-16"></div>
              <div ref="rzProgress" class="margin-16"></div>
              <div>
                <v-progress-linear
                  color="light-green darken-4"
                  height="16"
                  :value="((rzReceived / rzTotal) * 100).toFixed(0)"
                  striped
                ></v-progress-linear>
              </div>
            </v-card-text>
            <v-card-actions v-if="rzReceived == rzTotal">
              <v-spacer></v-spacer>
              <v-btn
                :href="rzUrl"
                :download="rzFilename"
                color="green darken-1"
                text
                >다운로드</v-btn
              >
              <v-btn color="green darken-1" text @click="rzClose()">닫기</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <v-dialog v-model="szDiag" persistent width="384">
          <v-card>
            <v-card-text class="text-center">
              <div class="margin-16">
                업로드 커맨드 실행 전<br />
                파일을 준비하는 과정입니다<br />
              </div>
              <div class="margin-16">
                <v-file-input
                  v-model="fileToUpload"
                  placeholder="파일을 선택해 주세요"
                  label="파일 선택"
                  show-size
                  prepend-icon="mdi-paperclip"
                >
                  <template v-slot:selection="{ text }">
                    <v-chip small label color="primary">
                      {{ text }}
                    </v-chip>
                  </template></v-file-input
                >
              </div>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn color="green darken-1" text @click="szCancel()"
                >취소</v-btn
              >
              <v-btn color="green darken-1" text @click="szUpload()"
                >업로드</v-btn
              >
            </v-card-actions>
          </v-card>
        </v-dialog>

        <v-dialog v-model="szProgressDiag" persistent width="256">
          <v-card>
            <v-card-text class="text-center">
              <div ref="szDiagText" class="margin-16"></div>
              <div ref="szProgress" class="margin-16"></div>
              <div>
                <v-progress-linear
                  color="light-green darken-4"
                  height="16"
                  :value="((szSent / szTotal) * 100).toFixed(0)"
                  striped
                ></v-progress-linear>
              </div>
            </v-card-text>
            <v-card-actions v-if="szSent == szTotal">
              <v-spacer></v-spacer>
              <v-btn color="green darken-1" text @click="szClose()">확인</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </div>
    </v-content>
  </v-app>
</template>

<script>
import io from 'socket.io-client';
import copy from 'copy-to-clipboard';

const FONT_WIDTH = 8;
const FONT_HEIGHT = 16;
const SCREEN_WIDTH = 80;
const SCREEN_HEIGHT = 33;

const SMART_MOUSE_BORDER = 2;

var WINDOW_TOP = 0;
var WINDOW_BOTTOM = SCREEN_HEIGHT - 1;

const COLOR_PRESET_VGA = [
  '#000000', // Black
  '#000080', // Blue
  '#008000', // Green
  '#008080', // Cyan
  '#800000', // Red
  '#800080', // Magenta
  '#804000', // Brown
  '#808080', // Light gray
  '#404040', // Gray
  '#4040ff', // Light blue
  '#40ff40', // Light green
  '#40ffff', // Light cyan
  '#ff4040', // Light red
  '#ff40ff', // Light magenta
  '#ffff40', // Yellow
  '#ffffff' // White
];

const COLOR_PRESET_HERCULES = [
  '#000000',
  '#000000',
  '#808080',
  '#808080',
  '#808080',
  '#808080',
  '#808080',
  '#a0a0a0',
  '#a0a0a0',
  '#808080',
  '#a0a0a0',
  '#a0a0a0',
  '#a0a0a0',
  '#a0a0a0',
  '#ffffff',
  '#ffffff'
];

const COLOR = [];

export default {
  name: 'bbs-web',

  data: () => ({
    io: null,
    ctx2d: null,
    connDiag: true,
    connected: false,
    command: null,
    commandType: 'text',
    fonts: [
      { text: '둥근모', value: 'neodgm' },
      { text: '굵은체', value: 'neoiyg' },
      { text: '필기체', value: 'neopil' },
      { text: '옛체', value: 'neoancient' },
      { text: '샘물체', value: 'neowater' }
    ],
    displays: ['VGA', 'HERCULES'],
    selectedDisplay: 'VGA',
    selectedFont: 'neodgm',
    applyDiag: false,
    escape: null,
    cursor: {
      x: 0,
      y: 0
    },
    cursorStore: {
      x: 0,
      y: 0
    },
    attr: {
      textColor: 15,
      backgroundColor: 1,
      reversed: false
    },

    rzDiag: false,
    rzFilename: null,
    rzReceived: 0,
    rzTotal: 1,
    rzUrl: null,

    fileToUpload: null,
    szDiag: false,
    szProgressDiag: false,
    szSent: 0,
    szTotal: 1,

    keepConn: false,
    keepConnMsg: '.',
    lastPageText: '',
    lastPageTextPos: [],
    smartMouse: [],
    smartMouseCmd: null
  }),

  created() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('beforeunload', this.onBeforeUnload);
  },

  destroyed() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
  },

  mounted() {
    this.$nextTick(() => {
      this.setupTerminal();
      this.setupNetwork();
    });
  },

  methods: {
    setupNetwork() {
      setTimeout(() => {
        this.io = io('http://goblins.iptime.org:8080');

        this.io.on('connect', () => {
          this.connected = true;
          this.connDiag = false;
          this.terminalClicked();
        });

        this.io.on('disconnect', () => {
          this.connected = false;
          this.write('접속이 종료되었습니다.\r\n');
        });

        this.io.on('data', data => {
          // Check if the password input phrase
          const pattern = /비밀번호 : /;
          const result = pattern.exec(Buffer.from(data).toString());
          if (result) {
            this.commandType = 'password';
          } else {
            this.commandType = 'text';
          }
          this.write(Buffer.from(data).toString());
        });

        this.io.on('rz-begin', filename => {
          this.rzFilename = filename;
          this.rzDiag = true;
          this.rzReceived = 0;
          this.rzTotal = 1;
          this.$nextTick(() => {
            this.$refs.rzDiagText.innerText =
              '파일을 준비중입니다\n\n' + this.rzFilename;
          });
        });

        this.io.on('rz-progress', progress => {
          // Progress: { received, total, bps }
          this.rzReceived = progress.received;
          this.rzTotal = progress.total;

          const percent = ((this.rzReceived / this.rzTotal) * 100).toFixed(2);
          this.$refs.rzProgress.innerText = '(' + percent + '% / 100%)';
        });

        this.io.on('rz-end', result => {
          if (result.code == 0) {
            this.rzReceived = this.rzTotal;

            this.$nextTick(() => {
              this.$refs.rzDiagText.innerText =
                '파일이 준비되었습니다\n\n' + this.rzFilename;
              this.$refs.rzProgress.innerText = '(100% / 100%)';
              this.rzUrl = result.url;
            });
          } else {
            alert('error: download failure!');
          }
        });
      }, 4000);
    },

    rzClose() {
      this.rzDiag = false;
      this.$nextTick(() => {
        this.write('파일수신이 완료되었습니다. [ENTER]를 눌러주세요.');
        this.terminalClicked();
      });
    },

    uploadFile() {
      /*
      this.szDiag = true;
      */
    },

    szCancel() {
      /*
      this.szDiag = false;
      this.fileToUpload = null;
      */
    },

    szUpload() {
      /*
      console.log('Upload File:', this.fileToUpload);
      const formData = new FormData();
      formData.append('file', this.fileToUpload);
      axios
        .post('/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        })
        .then(function() {
          console.log('SUCCESS!!');
        })
        .catch(function() {
          console.log('FAILURE!!');
        });
      */
    },

    setupTerminal() {
      // Set the color preset by default(VGA)
      for (var i = 0; i < 16; i++) {
        COLOR[i] = COLOR_PRESET_VGA[i];
      }

      // If there is cookie, apply cookie
      const cookieColor = this.getCookie('display');
      if (cookieColor) {
        this.selectedDisplay = cookieColor;
      }

      const cookieFont = this.getCookie('font');
      if (cookieFont) {
        this.selectedFont = cookieFont;
      }

      this.ctx2d = this.$refs.terminal.getContext('2d');
      if (this.ctx2d) {
        this.ctx2d.fillStyle = COLOR[this.attr.textColor];
        this.ctx2d.font = 'normal 16px ' + this.selectedFont;
        this.ctx2d.textBaseline = 'top';
      } else {
        alert('error: cannot create a canvas context2d!');
      }

      this.displayChanged(true);
    },

    enterCommand() {
      if (this.command) {
        this.io.emit('data', this.command + '\r\n');
      } else {
        this.io.emit('data', '\r\n');
      }
      this.command = null;
    },

    terminalClicked() {
      this.$refs.command.focus();
    },

    displayChanged(isInitial = false) {
      var targetPreset = COLOR_PRESET_VGA;

      if (this.selectedDisplay == 'HERCULES') {
        targetPreset = COLOR_PRESET_HERCULES;
      }

      for (var i = 0; i < 16; i++) {
        COLOR[i] = targetPreset[i];
      }

      // Set applied font
      document.getElementById('app').style.fontFamily = this.selectedFont;

      this.$refs.terminal.style.fontFamily = this.selectedFont;

      this.$refs.command.style.fontFamily = this.selectedFont;

      this.ctx2d.font = 'normal 16px ' + this.selectedFont;

      this.terminalClicked();
      this.setCookie('display', this.selectedDisplay, 365);
      this.setCookie('font', this.selectedFont, 365);

      if (!isInitial) {
        this.applyDiag = true;

        setTimeout(() => {
          // Clear whole webpage
          document.getElementById('app').style.backgroundColor =
            COLOR[this.attr.backgroundColor];

          this.$refs.terminal.style.backgroundColor =
            COLOR[this.attr.backgroundColor];

          // Rewrite last page text
          this.write(this.lastPageText);
          this.applyDiag = false;

          this.terminalClicked();
        }, 4000);
      }
    },

    write(text) {
      for (const ch of text) {
        this.lastPageText += ch;
        this.lastPageTextPos.push({ x: this.cursor.x, y: this.cursor.y });
        if (this.escape) {
          this.escape = this.escape + ch;
          if (this.endOfEscape()) {
            this.applyEscape();
            this.escape = null;
          }
        } else {
          switch (ch.charCodeAt(0)) {
            case 27:
              this.escape = '\x1b';
              break;

            case 13:
              this.cr();
              break;

            case 10:
              this.lf();
              break;

            case 0: // NULL
            case 24: // ZDLE
            case 17: // XON
            case 138: // LF of sz
            case 65533: // Unknown
              break;

            default:
              {
                const charWidth = ch.charCodeAt(0) < 0x80 ? 1 : 2;
                const cursor_px = {
                  x: this.cursor.x * FONT_WIDTH,
                  y: this.cursor.y * FONT_HEIGHT
                };
                var textColor = COLOR[this.attr.textColor];
                var backgroundColor = COLOR[this.attr.backgroundColor];

                if (this.doubleWidth(ch)) {
                  this.ctx2d.save();
                  this.ctx2d.scale(2, 1);
                  cursor_px.x /= 2;
                }

                if (this.attr.reversed) {
                  textColor = COLOR[this.attr.backgroundColor];
                  backgroundColor = COLOR[this.attr.textColor];
                }

                this.ctx2d.fillStyle = backgroundColor;
                this.ctx2d.fillRect(
                  cursor_px.x,
                  cursor_px.y,
                  charWidth * FONT_WIDTH,
                  FONT_HEIGHT
                );
                this.ctx2d.fillStyle = textColor;
                this.ctx2d.fillText(ch, cursor_px.x, cursor_px.y);

                if (this.doubleWidth(ch)) {
                  this.ctx2d.restore();
                }

                this.cursor.x += charWidth;
              }
              break;
          }
        }
      }

      // Rebuild smart mouse
      this.rebuildSmartMouse();

      // Move the command textfield to the cursor position
      this.moveCommandInputPosition();
    },

    cr() {
      this.cursor.x = 0;
    },

    lf() {
      this.cursor.y++;
      if (this.cursor.y > WINDOW_BOTTOM) {
        this.cursor.y = WINDOW_BOTTOM;

        this.screenScrollUp();
      }
    },

    doubleWidth(ch) {
      return ch.charCodeAt(0) >= 0x80 && this.ctx2d.measureText(ch).width <= 9;
    },

    endOfEscape() {
      if (!this.escape) {
        return false;
      }
      const lastChar = this.escape.charAt(this.escape.length - 1);
      if ('@ABCDFGHJKSfhlmprsu'.indexOf(lastChar) != -1) {
        return true;
      } else {
        return false;
      }
    },

    applyEscape() {
      // Text color
      {
        const pattern = /\[=([0-9]*)F/;
        const result = pattern.exec(this.escape);
        if (result != null) {
          const param1 = parseInt(result[1], 10);
          this.attr.textColor = isNaN(param1) ? 15 : param1;
        }
      }
      // Background color
      {
        const pattern = /\[=([0-9]*)G/;
        const result = pattern.exec(this.escape);
        if (result != null) {
          const param1 = parseInt(result[1], 10);
          this.attr.backgroundColor = isNaN(param1) ? 1 : param1;
        }
      }
      // Reverse color
      {
        const pattern = /\[([0-9]*)m/;
        const result = pattern.exec(this.escape);
        if (result != null) {
          const param1 = parseInt(result[1], 10);
          if (!isNaN(param1)) {
            if (param1 == '7') {
              this.attr.reversed = true;
            } else {
              this.attr.reversed = false;
            }
          } else {
            this.attr.reversed = false;
          }
        }
      }
      // Cursor position set
      {
        // Move cursor to specific position
        {
          const pattern = /\[([0-9]*);([0-9]*)H/;
          const result = pattern.exec(this.escape);
          if (result) {
            const param1 = parseInt(result[1], 10);
            const param2 = parseInt(result[2], 10);

            this.cursor.y = isNaN(param1) ? 0 : param1 - 1;
            this.cursor.x = isNaN(param2) ? 0 : param2 - 1;
          } else {
            const pattern = /\[([0-9]*)H/;
            const result = pattern.exec(this.escape);
            if (result) {
              const param1 = parseInt(result[1], 10);
              this.cursor.y = isNaN(param1) ? 0 : param1 - 1;
              this.cursor.x = 0;
            }
          }
        }
        // Move cursor y
        {
          const pattern = /\[([0-9]*)A/;
          const result = pattern.exec(this.escape);
          if (result) {
            const param1 = parseInt(result[1], 10);
            this.cursor.y -= isNaN(param1) ? 0 : param1;
            if (this.cursor.y < 0) {
              this.cursor.y = 0;
              this.cursor.x = 0;
            }
          }
        }
        // Move cursor x
        {
          const pattern = /\[([0-9]*)C/;
          const result = pattern.exec(this.escape);
          if (result) {
            const param1 = parseInt(result[1], 10);
            this.cursor.x = isNaN(param1) ? 0 : param1 - 1;
          }
        }
        // Store and restore the cursor position
        {
          if (this.escape == '[s') {
            this.cursorStore = { x: this.cursor.x, y: this.cursor.y };
          } else if (this.escape == '[u') {
            this.cursor = { x: this.cursorStore.x, y: this.cursorStore.y };
          }
        }
      }
      // Clear the screen
      {
        if (this.escape == '\x1b[2J') {
          this.ctx2d.fillStyle = COLOR[this.attr.backgroundColor];
          this.ctx2d.fillRect(
            0,
            0,
            this.$refs.terminal.width,
            this.$refs.terminal.height
          );

          // Clear whole webpage
          document.getElementById('app').style.backgroundColor =
            COLOR[this.attr.backgroundColor];

          // Refresh lastPageText (after 2J, there is no any other text)
          this.lastPageText = '\x1b[2J';
          this.lastPageTextPos = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 }
          ];
          this.cursor.x = 0;
          this.cursor.y = 0;
        }
      }
      // Clear a line
      {
        if (this.escape.endsWith('[2K')) {
          this.ctx2d.fillStyle = COLOR[this.attr.backgroundColor];
          this.ctx2d.fillRect(
            0,
            this.cursor.y * FONT_HEIGHT,
            this.$refs.terminal.clientWidth,
            FONT_HEIGHT
          );
        } else if (this.escape.endsWith('[1K')) {
          this.ctx2d.fillStyle = COLOR[this.attr.backgroundColor];
          this.ctx2d.fillRect(
            0,
            this.cursor.y * FONT_HEIGHT,
            (this.cursor.x + 1) * FONT_WIDTH,
            FONT_HEIGHT
          );
        } else if (this.escape.endsWith('[0K') || this.escape.endsWith('[K')) {
          this.ctx2d.fillStyle = COLOR[this.attr.backgroundColor];
          this.ctx2d.fillRect(
            this.cursor.x * FONT_WIDTH,
            this.cursor.y * FONT_HEIGHT,
            this.$refs.terminal.clientWidth - this.cursor.x * FONT_WIDTH,
            FONT_HEIGHT
          );
        }
      }
      // Set the window area
      {
        const pattern = /\[([0-9]*);([0-9]*)r/;
        const result = pattern.exec(this.escape);
        if (result) {
          const param1 = parseInt(result[1], 10);
          const param2 = parseInt(result[2], 10);
          const scrollFrom = isNaN(param1) ? 0 : param1 - 1;
          const scrollTo = isNaN(param2) ? 0 : param2 - 1;

          // Reset the window height
          if (scrollFrom <= 0 && scrollTo <= 0) {
            WINDOW_TOP = 0;
            WINDOW_BOTTOM = SCREEN_HEIGHT - 1;
          } else {
            WINDOW_TOP = scrollFrom;
            WINDOW_BOTTOM = scrollTo;
          }
        }
      }
    },

    screenScrollUp() {
      const copy = this.ctx2d.getImageData(
        0,
        FONT_HEIGHT * (WINDOW_TOP + 1),
        this.$refs.terminal.clientWidth,
        FONT_HEIGHT * (WINDOW_BOTTOM - WINDOW_TOP)
      );
      this.ctx2d.putImageData(copy, 0, FONT_HEIGHT * WINDOW_TOP);
      this.ctx2d.fillStyle = COLOR[this.attr.backgroundColor];
      this.ctx2d.fillRect(
        0,
        WINDOW_BOTTOM * FONT_HEIGHT,
        this.$refs.terminal.clientWidth,
        FONT_HEIGHT
      );

      // Modify the position of lastPageTextPos (scroll up)
      for (const pos of this.lastPageTextPos) {
        if (pos.y >= WINDOW_TOP && pos.y <= WINDOW_BOTTOM) {
          pos.y--;
        }
      }
    },

    rebuildSmartMouse() {
      this.smartMouse = [];
      this.$refs.smartMouseBox.style.visibility = 'hidden';

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
      ];

      for (const pattern of smartMousePatterns) {
        var result = null;
        while ((result = pattern.exec(this.lastPageText))) {
          // Remove ANSI escape code from the string(result[0])
          result[0] = result[0].replace(/\x1b\[=.{1,3}[FG]{1}/gi, '').trim();

          // If there is doubleWidthCharacter, replace it to '가' for correct measuring
          var normalText = '';
          for (const ch of result[0]) {
            if (this.doubleWidth(ch)) {
              normalText += '가';
            } else {
              normalText += ch;
            }
          }

          const link = {
            command: result[1],
            px: {
              x: this.lastPageTextPos[result.index].x * FONT_WIDTH,
              y: this.lastPageTextPos[result.index].y * FONT_HEIGHT,
              width: this.ctx2d.measureText(normalText).width,
              height: FONT_HEIGHT
            }
          };
          this.smartMouse.push(link);
        }
      }
    },

    mouseMove(e) {
      const mouseX =
        e.clientX - this.$refs.terminal.getBoundingClientRect().left;
      const mouseY =
        e.clientY - this.$refs.terminal.getBoundingClientRect().top;

      for (const sm of this.smartMouse) {
        if (
          mouseX >= sm.px.x &&
          mouseY >= sm.px.y &&
          mouseX < sm.px.x + sm.px.width &&
          mouseY < sm.px.y + sm.px.height
        ) {
          // Intenally set the smart mouse command
          this.smartMouseCmd = sm.command;

          // Mouse smart mouse box to the position
          this.$refs.smartMouseBox.style.left =
            sm.px.x -
            SMART_MOUSE_BORDER +
            this.$refs.terminal.getBoundingClientRect().left +
            window.pageXOffset +
            'px';
          this.$refs.smartMouseBox.style.top =
            sm.px.y -
            SMART_MOUSE_BORDER +
            this.$refs.terminal.getBoundingClientRect().top +
            window.pageYOffset +
            'px';
          this.$refs.smartMouseBox.style.width =
            sm.px.width + 2 * SMART_MOUSE_BORDER + 'px';
          this.$refs.smartMouseBox.style.height =
            sm.px.height + 2 * SMART_MOUSE_BORDER + 'px';
          this.$refs.smartMouseBox.style.visibility = 'visible';

          return;
        }
      }

      // If no smart mouse position has detected, hide the smart mouse box
      this.$refs.smartMouseBox.style.visibility = 'hidden';
    },

    smartMouseClicked() {
      if (/https?:\/\//.exec(this.smartMouseCmd)) {
        window.open(this.smartMouseCmd, '_blank');
      } else {
        this.command = this.smartMouseCmd;
        this.enterCommand();
      }

      this.$refs.smartMouseBox.style.visibility = 'hidden';
      this.smartMousdCmd = '';

      this.terminalClicked();
    },

    moveCommandInputPosition() {
      this.$refs.command.style.left =
        (
          this.$refs.terminal.getBoundingClientRect().left +
          window.pageXOffset +
          this.cursor.x * FONT_WIDTH
        ).toString() + 'px';
      this.$refs.command.style.top =
        (
          this.$refs.terminal.getBoundingClientRect().top +
          window.pageYOffset +
          this.cursor.y * FONT_HEIGHT
        ).toString() + 'px';

      // Calculate the command textfield width (cursor ~ end of the screen)
      this.$refs.command.style.width =
        (
          this.$refs.terminal.clientWidth -
          this.cursor.x * FONT_WIDTH
        ).toString() + 'px';
    },

    onResize() {
      this.moveCommandInputPosition();
    },

    onBeforeUnload() {
      this.io.disconnect();
    },

    setCookie(cookie_name, value, days) {
      var exdate = new Date();
      exdate.setDate(exdate.getDate() + days);
      var cookie_value =
        escape(value) +
        (days == null ? '' : ';    expires=' + exdate.toUTCString());
      document.cookie = cookie_name + '=' + cookie_value;
    },

    getCookie(cookie_name) {
      var x, y;
      var val = document.cookie.split(';');

      for (var i = 0; i < val.length; i++) {
        x = val[i].substr(0, val[i].indexOf('='));
        y = val[i].substr(val[i].indexOf('=') + 1);
        x = x.replace(/^\s+|\s+$/g, '');
        if (x == cookie_name) {
          return unescape(y);
        }
      }
    },

    copyToClipboard() {
      var normalText = '';
      var esc = false;

      for (const ch of this.lastPageText) {
        if (!esc && ch == '\x1b') {
          esc = true;
          continue;
        }

        if (esc && ('@ABCDFGHJKSfhlmprsu'.indexOf(ch) != -1)) {
          esc = false;
          continue;
        }

        if (!esc) {
          normalText += ch;
        }
      }

      normalText = normalText.replace(/\x0d\x00/gi, '');

      if (copy(normalText)) {
        alert('현재 화면이 클립보드에 복사되었습니다.');
      } else {
        alert('클립보드에 복사 중 오류가 발생하였습니다.');
      }
    }
  }
};
</script>

<style>
@font-face {
  font-family: 'neodgm';
  src: url('assets/neodgm.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}

@font-face {
  font-family: 'neoiyg';
  src: url('assets/neoiyg.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}

@font-face {
  font-family: 'neopil';
  src: url('assets/neopil.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}

@font-face {
  font-family: 'neoancient';
  src: url('assets/neoancient.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}

@font-face {
  font-family: 'neowater';
  src: url('assets/neowater.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}

#app {
  background: #000000;
  font-family: 'neodgm' !important;
}

#terminal {
  margin-top: 16px;
}

#command {
  font-size: 16px !important;
  height: 16px !important;
  line-height: 16px !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  outline: none !important;
  position: absolute;
  color: #ffffff;
}

.margin-16 {
  padding-top: 16px !important;
}

.smart-mouse-box {
  margin: 0 !important;
  padding: 0 !important;
  border-top: 2px solid #ffffff !important;
  border-left: 2px solid #ffffff !important;
  border-right: 2px solid #aaaaaa !important;
  border-bottom: 2px solid #aaaaaa !important;
  outline: none !important;
  position: absolute;
  visibility: hidden;
}
</style>
