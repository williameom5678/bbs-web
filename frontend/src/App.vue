<template>
  <div>
    <input v-model="command" @keyup.enter="enterCommand()" />
  </div>
</template>

<script>
import io from "socket.io-client";
import iconv from "iconv-lite";

export default {
  name: "bbs-web",

  data: () => ({
    io: null,
    connected: false,
    command: null
  }),

  mounted() {
    this.io = io("http://localhost:8080");

    this.io.on("connect", () => {
      this.connected = true;
    });

    this.io.on("disconnect", () => {
      this.connected = false;
    });

    this.io.on("data", data => {
      console.log("data:", iconv.decode(Buffer.from(data), "euc-kr"));
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

  methods: {
    enterCommand() {
      this.io.emit("data", this.command + "\r\n");
      this.command = null;
    }
  }
};
</script>
