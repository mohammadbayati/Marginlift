const { start } = require("./src/server");

const server = start();

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down MarginLift.`);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
