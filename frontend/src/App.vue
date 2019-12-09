<template>
  <div>
    <canvas id="terminal" ref="terminal" width="640" height="512"></canvas>
    <input v-model="command" @keyup.enter="enterCommand()" />
  </div>
</template>

<script>
import io from 'socket.io-client';

const FONT_WIDTH = 8;
const FONT_HEIGHT = 16;
const SCREEN_WIDTH = 80;
const SCREEN_HEIGHT = 33;

const COLOR = [
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
  '#ffffff', // White
];

export default {
  name: 'bbs-web',

  data: () => ({
    io: null,
    ctx2d: null,
    connected: false,
    command: null,
    escape: null,
    cursor: {
      x: 0,
      y: 0,
    },
    cursorStore: {
      x: 0,
      y: 0,
    },
    attr: {
      textColor: 15,
      backgroundColor: 1,
      reversed: false,
    },
  }),

  mounted() {
    this.$nextTick(() => {
      this.setupTerminal();
      this.setupNetwork();
    });
  },

  methods: {
    setupNetwork() {
      this.io = io('http://goblins.iptime.org:8080');

      this.io.on('connect', () => {
        this.connected = true;
      });

      this.io.on('disconnect', () => {
        this.connected = false;
      });

      this.io.on('data', data => {
        this.write(Buffer.from(data).toString());
      });

      this.io.on('rz-begin', filename => {
        console.log(`rz-begin, filename: ${filename}`);
      });

      this.io.on('rz-progess', progress => {
        console.log(
          `rz-progress, ${progress.received}/${progress.total} BPS: ${progress.bps} ETA: ${progress.eta}`,
        );
      });

      this.io.on('rz-end', result => {
        console.log(`rz-end with the code ${result.code}, url: ${result.url}`);
      });
    },

    setupTerminal() {
      this.ctx2d = this.$refs.terminal.getContext('2d');
      if (this.ctx2d) {
        this.ctx2d.fillStyle = '#ffffff';
        this.ctx2d.font = 'normal 16px neodgm';
        this.ctx2d.textBaseline = 'top';
      } else {
        alert('Cannot create a canvas context2d!');
      }
    },

    enterCommand() {
      this.io.emit('data', this.command + '\r\n');
      this.command = null;
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
          switch (ch) {
            case '\x1b':
              this.escape = '\x1b';
              break;

            case '\x0d':
              this.cr();
              break;

            case '\x0a':
              this.lf();
              break;

            default:
              {
                const charWidth = ch.charCodeAt(0) < 0x80 ? 1 : 2;
                const cursor_px = {
                  x: this.cursor.x * FONT_WIDTH,
                  y: this.cursor.y * FONT_HEIGHT,
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
                  FONT_HEIGHT,
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
    },

    cr() {
      this.cursor.x = 0;
    },

    lf() {
      this.cursor.y++;
      if (this.cursor.y > SCREEN_HEIGHT - 1) {
        this.cursor.y = SCREEN_HEIGHT - 1;

        this.screenScrollUp();
      }
    },

    doubleWidth(ch) {
      return ch.charCodeAt(0) >= 0x80 && this.ctx2d.measureText(ch).width <= 8;
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
      {
        const pattern = /\[=([0-9]*)F/;
        const result = pattern.exec(this.escape);
        if (result != null) {
          const param1 = parseInt(result[1], 10);
          this.attr.textColor = isNaN(param1) ? 15 : param1;
        }
      }

      {
        const pattern = /\[=([0-9]*)G/;
        const result = pattern.exec(this.escape);
        if (result != null) {
          const param1 = parseInt(result[1], 10);
          this.attr.backgroundColor = isNaN(param1) ? 1 : param1;
        }
      }

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

      {
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

        {
          const pattern = /\[([0-9]*)C/;
          const result = pattern.exec(this.escape);
          if (result) {
            const param1 = parseInt(result[1], 10);
            this.cursor.x = isNaN(param1) ? 0 : param1 - 1;
          }
        }

        {
          if (this.escape == '[s') {
            this.cursorStore = {x: this.cursor.x, y: this.cursor.y};
          } else if (this.escape == '[u') {
            this.cursor = {x: this.cursorStore.x, y: this.cursorStore.y};
          }
        }
      }

      {
        if (this.escape == '\x1b[2J') {
          this.ctx2d.clearRect(
            0,
            0,
            this.$refs.terminal.width,
            this.$refs.terminal.height,
          );
        }
      }

      {
        if (this.escape.endsWith('[2K')) {
          this.ctx2d.clearRect(
            0,
            this.cursor.y * FONT_HEIGHT,
            this.$refs.terminal.width,
            FONT_HEIGHT,
          );
        } else if (this.escape.endsWith('[1K')) {
          this.ctx2d.clearRect(
            0,
            this.cursor.y * FONT_HEIGHT,
            (this.cursor.x + 1) * 8,
            FONT_HEIGHT,
          );
        } else if (this.escape.endsWith('[0K') || this.escape.endsWith('[K')) {
          this.ctx2d.clearRect(
            this.cursor.x * FONT_WIDTH,
            this.cursor.y * FONT_HEIGHT,
            this.$refs.terminal.width - this.cursor.x * FONT_WIDTH,
            FONT_HEIGHT,
          );
        }
      }

      {
        const pattern = /\[([0-9]*);([0-9]*)r/;
        const result = pattern.exec(this.escape);
        if (result) {
          const param1 = parseInt(result[1], 10);
          const param2 = parseInt(result[2], 10);
          const scrollFrom = isNaN(param1) ? 0 : param1 - 1;
          const scrollTo = isNaN(param2) ? 0 : param2 - 1;

          const copy = this.ctx2d.getImageData(
            0,
            scrollFrom * FONT_HEIGHT + FONT_HEIGHT,
            this.$refs.terminal.width,
            (scrollTo - scrollFrom) * FONT_HEIGHT + FONT_HEIGHT,
          );
          this.ctx2d.putImageData(copy, 0, scrollFrom * FONT_HEIGHT);
          this.ctx2d.fillStyle = this.attr.backgroundColor;
          this.ctx2d.fillRect(
            0,
            scrollTo * FONT_HEIGHT,
            this.$refs.terminal.width,
            FONT_HEIGHT,
          );
        }
      }
    },

    screenScrollUp() {
      const copy = this.ctx2d.getImageData(
        0,
        FONT_HEIGHT,
        this.$refs.terminal.width,
        this.$refs.terminal.height - FONT_HEIGHT,
      );
      this.ctx2d.putImageData(copy, 0, 0);
      this.ctx2d.fillStyle = '#000080';
      this.ctx2d.fillRect(
        0,
        this.$refs.terminal.height - FONT_HEIGHT,
        this.$refs.terminal.width,
        FONT_HEIGHT,
      );
    },
  },
};
</script>

<style>
@font-face {
  font-family: 'neodgm';
  src: url('assets/neodgm.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}

html,
body {
  background: #000000;
}

#terminal {
  background: #000080;
}

.hiru {
  font-family: 'neodgm';
}
</style>
