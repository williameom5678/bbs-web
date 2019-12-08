<template>
  <div>
    <canvas id="terminal" ref="terminal" width="640" height="512"></canvas>
    <input v-model="command" @keyup.enter="enterCommand()" />
  </div>
</template>

<script>
import io from "socket.io-client";
import iconv from "iconv";

export default {
  name: "bbs-web",

  data: () => ({
    io: null,
    ctx2d: null,
    connected: false,
    command: null,
    decodeStream: null,
    cursor: {
      x: 0,
      y: 0
    }
  }),

  mounted() {
    this.setupTerminal();
    this.setupNetwork();
  },

  methods: {
    setupNetwork() {
      this.decodeStream = iconv.decodeStream("KS_C_5601-1987");
      if (!this.decodeStream) {
        alert("Error: cannot create the decode stream!");
      }
      this.decodeStream.on("data", str => {
        console.log("DecodeStream.on: ", str); // Do something with decoded strings, chunk-by-chunk.
      });

      this.io = io("http://localhost:8080");

      this.io.on("connect", () => {
        this.connected = true;
      });

      this.io.on("disconnect", () => {
        this.connected = false;
      });

      this.io.on("data", data => {
        this.decodeStream.write(data);
        this.refreshTerminal();
      });

      this.io.on("rz-begin", filename => {
        console.log(`rz-begin, filename: ${filename}`);
      });

      this.io.on("rz-progess", progress => {
        console.log(
          `rz-progress, ${progress.received}/${progress.total} BPS: ${progress.bps} ETA: ${progress.eta}`
        );
      });

      this.io.on("rz-end", result => {
        console.log(`rz-end with the code ${result.code}, url: ${result.url}`);
      });
    },

    setupTerminal() {
      console.log("setupTermianl(): ", this.$refs.terminal);

      this.$nextTick(() => {
        this.ctx2d = this.$refs.terminal.getContext("2d");
        if (this.ctx2d) {
          this.ctx2d.fillStyle = "#ffffff";
          this.ctx2d.font = "normal 16px neodgm";
          this.ctx2d.textBaseline = "top";
        } else {
          alert("Cannot create a canvas context2d!");
        }

        setTimeout(() => {
          this.ctx2d.fillText("도스박물관OldDos", 32, 32);
        }, 5000);
      });
    },

    refreshTerminal() {},

    enterCommand() {
      this.io.emit("data", this.command + "\r\n");
      this.command = null;
    }
  }
};
</script>

<style>
@font-face {
  font-family: "neodgm";
  src: url("assets/neodgm.ttf") format("truetype");
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
  font-family: "neodgm";
}
</style>
