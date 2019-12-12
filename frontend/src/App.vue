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
          <v-select
            :items="displays"
            v-model="displaySelected"
            @change="displayChanged()"
            label="디스플레이"
            solo
          ></v-select>
          <v-btn text href="https://cafe.naver.com/olddos" target="_blank">
            <span class="mr-2">도스박물관 카페</span>
          </v-btn>
        </v-toolbar-items>
      </v-toolbar>
      <div class="text-center">
        <canvas
          id="terminal"
          ref="terminal"
          width="640"
          height="528"
          @click="terminalClicked()"
        ></canvas>
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
      </div>
    </v-content>
  </v-app>
</template>

<script>
import io from 'socket.io-client';

const FONT_WIDTH = 8;
const FONT_HEIGHT = 16;
const SCREEN_WIDTH = 80;
const SCREEN_HEIGHT = 33;

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
    displays: ['VGA', 'HERCULES'],
    displaySelected: 'VGA',
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

    keepConn: false,
    keepConnMsg: '.'
  }),

  created() {
    window.addEventListener('resize', this.onResize);
  },

  destroyed() {
    window.removeEventListener('resize', this.onResize);
  },

  mounted() {
    // Set the color preset by default(VGA)
    for (var i = 0; i < 16; i++) {
      COLOR[i] = COLOR_PRESET_VGA[i];
    }

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

    setupTerminal() {
      this.ctx2d = this.$refs.terminal.getContext('2d');
      if (this.ctx2d) {
        this.ctx2d.fillStyle = COLOR[this.attr.textColor];
        this.ctx2d.font = 'normal 16px neodgm';
        this.ctx2d.textBaseline = 'top';
      } else {
        alert('error: cannot create a canvas context2d!');
      }
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

    displayChanged() {
      var targetPreset = COLOR_PRESET_VGA;

      if (this.displaySelected == 'HERCULES') {
        targetPreset = COLOR_PRESET_HERCULES;
      }

      for (var i = 0; i < 16; i++) {
        COLOR[i] = targetPreset[i];
      }

      // Clear whole webpage
      document.getElementById('app').style.backgroundColor =
        COLOR[this.attr.backgroundColor];

      this.command = null;
      this.enterCommand();

      this.terminalClicked();
    },

    write(text) {
      for (const ch of text) {
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

#app {
  background: #000040;
  font-family: 'neodgm' !important;
}

#terminal {
  margin-top: 16px;
  background: #000040;
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
</style>
