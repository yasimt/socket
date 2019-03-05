const fs = require("fs");
const util = require("util");
const moment = require("moment");
module.exports = function writeLog(ucode, data) {
  const day = moment().format("YYYY-MM-DD");
  let logpath = __basedir + "/logs/" + day + "/";
  if (!fs.existsSync(logpath)) {
    fs.mkdirSync(logpath);
  }

  let filename = ucode + ".log";
  let log_file = fs.createWriteStream(logpath + filename, {
    flags: "a",
    encoding: "utf-8",
    mode: "0666"
  });
  const curtime = moment().format("YYYY-MM-DD H:mm:ss");
  log_file.write(
    util.format({
      time: curtime,
      data
    }) + "\n\n"
  );
  log_file.end();
};
