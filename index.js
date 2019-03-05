"use strict";
const url = require("url");
const express = require("express");
const cluster = require("cluster");
const net = require("net");
const socketio = require("socket.io");
const io_redis = require("socket.io-redis");
const farmhash = require("farmhash");
global.__basedir = __dirname;
const num_processes = require("os").cpus().length;
const port = 8181;
const {isEmpty} = require("./utils/helper");
const conf_var = require("./config/keys");
const writeLog = require("./utils/logger");
let morgan = require("morgan");
if (cluster.isMaster) {
  let workers = [];

  // Helper function for spawning worker at index 'i'.
  let spawn = function(i) {
    workers[i] = cluster.fork();

    // Optional: Restart worker on exit
    workers[i].on("exit", function(code, signal) {
      // respawning worker
      spawn(i);
    });
  };

  // Spawn workers.
  for (let i = 0; i < num_processes; i++) {
    spawn(i);
  }

  // Helper function for getting a worker index based on IP address.
  // This is a hot path so it should be really fast. The way it works
  // is by converting the IP address to a number by removing non numeric
  // characters, then compressing it to the number of slots we have.
  const worker_index = function(ip, len) {
    return farmhash.fingerprint32(ip) % len; // Farmhash is the fastest and works with IPv6, too
  };

  const server = net.createServer({pauseOnConnect: true}, connection => {
    // We received a connection and need to pass it to the appropriate
    // worker. Get the worker for this connection's source IP and pass
    // it the connection.
    let worker = workers[worker_index(connection.remoteAddress, num_processes)];
    worker.send("sticky-session:connection", connection);
  });

  server.listen(port);

  cluster.on("exit", function(worker, code, signal) {
    for (let id in cluster.workers) {
      cluster.workers[id].kill();
    }
    if (code === 1) {
      console.log("Problem in connecting Redis Server");
    }
    process.exit();
  });

  console.log(`Master listening on port ${port}`);
} else {
  const app = express();
  // Don't expose our internal server to the outside world.

  const server = app.listen(0);
  const io = socketio(server);
  io.adapter(io_redis({host: conf_var.redis.host, port: conf_var.redis.port}));

  io.of("/").adapter.on("error", function(err) {
    process.exit(1);
  });

  io.on("connection", function(socket) {
    if (!isEmpty(socket.handshake.query.ucode)) {
      const user = socket.handshake.query.ucode;
      const connuser = "socketconnected_" + user;

      socket.on(connuser, data => {
        writeLog(data.ucode, data.msg);
      });

      socket.on("disconnect", function() {
        writeLog(user, "User Disconnected");
      });
    }
  });
  // Listen to messages sent from the master. Ignore everything else.
  process.on("message", function(message, connection) {
    if (message !== "sticky-session:connection") {
      return;
    }

    // Emulate a connection event on the server by emitting the
    // event with the connection the master sent us.
    server.emit("connection", connection);

    connection.resume();
  });
  morgan.token("date", function() {
    return new Date().toString();
  });
  app.use(morgan("combined"));
  app.get("/dialer/*", function(req, res) {
    const parse_url = url.parse(req.url, true);
    const query_str = parse_url.query;
    const dialerdata = "dialerdata_" + query_str.agtid;
    io.emit(dialerdata, query_str);
    writeLog(query_str.agtid, query_str);
    res.send("send to dialer");
  });
}
