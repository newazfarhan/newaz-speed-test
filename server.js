// server.js (Option A)
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
// keep raw parser so req.body is a Buffer for octet-stream
app.use(express.raw({ type: "application/octet-stream", limit: "500mb" }));

app.use(express.static(path.join(__dirname, "public")));

app.get("/download", (req, res) => {
  const size = Math.min(
    parseInt(req.query.size || "5000000", 10),
    200 * 1024 * 1024
  );
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", String(size));
  const chunk = Buffer.alloc(64 * 1024, "a");
  let sent = 0;
  function sendNext() {
    while (sent < size) {
      const remaining = size - sent;
      const toSend =
        remaining >= chunk.length ? chunk : chunk.slice(0, remaining);
      if (!res.write(toSend)) {
        res.once("drain", sendNext);
        return;
      }
      sent += toSend.length;
    }
    res.end();
  }
  sendNext();
});

// upload: read from req.body buffer (because express.raw consumed stream)
app.post("/upload", (req, res) => {
  let received = 0;
  if (req.body && Buffer.isBuffer(req.body)) {
    received = req.body.length;
  } else {
    // fallback: if body-parser didn't run, count stream events
    req.on("data", (d) => (received += d.length));
    req.on("end", () => res.json({ received }));
    req.on("error", () => res.status(500).end());
    return;
  }
  // respond with received bytes
  res.json({ received });
});

const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`Server listening on http://localhost:${port}`)
);
