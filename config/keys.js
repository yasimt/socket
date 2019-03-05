if (process.env.NODE_ENV === "development") {
  // we are in development - return the dev constants!!!
  module.exports = require("./dev");
} else {
  // we are in production - return the prod constants!!!
  module.exports = require("./prod");
}
