const SERVER = location.origin;
document.getElementById("server-origin-small").textContent = SERVER;

function now() {
  return performance.now();
}
function toMbps(bytes, ms) {
  return (bytes * 8) / (ms / 1000) / 1_000_000;
}

async function measureLatency(repeats = 6) {
  const times = [];
  for (let i = 0; i < repeats; i++) {
    const t0 = now();
    await fetch(`${SERVER}/download?size=64&r=${Math.random()}`, {
      cache: "no-store",
    });
    const t1 = now();
    times.push(t1 - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

function generateRandomBuffer(size) {
  const buf = new Uint8Array(size);
  const CHUNK = 65536;
  for (let offset = 0; offset < size; offset += CHUNK) {
    const len = Math.min(CHUNK, size - offset);
    crypto.getRandomValues(buf.subarray(offset, offset + len));
  }
  return buf;
}

async function downloadTimed(
  durationSec = 10,
  concurrency = 3,
  onProgress = () => {}
) {
  let totalBytes = 0;
  let running = true;
  const controllers = [];
  const stopTimeout = setTimeout(() => {
    running = false;
    controllers.forEach((c) => c.abort());
  }, durationSec * 1000);

  async function worker() {
    while (running) {
      const controller = new AbortController();
      controllers.push(controller);
      try {
        const resp = await fetch(
          `${SERVER}/download?size=4000000&r=${Math.random()}`,
          { cache: "no-store", signal: controller.signal }
        );
        const reader = resp.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.length;
          onProgress(totalBytes);
          if (!running) {
            controller.abort();
            break;
          }
        }
      } catch (e) {
        if (e.name !== "AbortError") console.warn("dl worker", e);
      } finally {
        const i = controllers.indexOf(controller);
        if (i != -1) controllers.splice(i, 1);
      }
    }
  }

  const start = now();
  const workers = new Array(concurrency).fill(0).map(() => worker());
  await Promise.allSettled(workers);
  const end = now();
  clearTimeout(stopTimeout);
  return {
    seconds: (end - start) / 1000,
    bytes: totalBytes,
    mbps: toMbps(totalBytes, end - start),
  };
}

async function uploadTimed(
  durationSec = 10,
  chunkSize = 500000,
  onProgress = () => {}
) {
  const payload = generateRandomBuffer(chunkSize);
  let totalBytes = 0;
  let running = true;
  const controllers = [];
  const stopTimeout = setTimeout(() => {
    running = false;
    controllers.forEach((c) => c.abort());
  }, durationSec * 1000);

  const start = now();
  while (running) {
    const controller = new AbortController();
    controllers.push(controller);
    try {
      await fetch(`${SERVER}/upload?cachebust=${Math.random()}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: payload,
        signal: controller.signal,
      });
      totalBytes += payload.length;
      onProgress(totalBytes);
    } catch (e) {
      if (e.name !== "AbortError") console.warn("upload", e);
      if (!running) break;
    } finally {
      const i = controllers.indexOf(controller);
      if (i != -1) controllers.splice(i, 1);
    }
  }
  const end = now();
  clearTimeout(stopTimeout);
  return {
    seconds: (end - start) / 1000,
    bytes: totalBytes,
    mbps: toMbps(totalBytes, end - start),
  };
}

// UI wiring
const runBtn = document.getElementById("run");
const latencyEl = document.getElementById("latency");
const dlMbpsEl = document.getElementById("dl-mbps");
const upMbpsEl = document.getElementById("up-mbps");
const dlDetails = document.getElementById("dl-details");
const upDetails = document.getElementById("up-details");
const dlBar = document.getElementById("dl-bar");
const upBar = document.getElementById("up-bar");
const logEl = document.getElementById("log");
function log(s) {
  logEl.textContent = s + "\n" + logEl.textContent;
}

async function runSpeedTest() {
  runBtn.disabled = true;
  log("Starting tests...");
  latencyEl.textContent = "...";
  dlMbpsEl.textContent = "...";
  upMbpsEl.textContent = "...";
  dlDetails.textContent = "Transferred: 0 bytes — 0.0s";
  upDetails.textContent = "Transferred: 0 bytes — 0.0s";
  dlBar.style.width = "0%";
  upBar.style.width = "0%";

  try {
    const lat = await measureLatency();
    latencyEl.textContent = lat.toFixed(1);
    log(`Latency ${lat.toFixed(1)} ms`);

    let dlTotal = 0;
    const dlStart = now();
    const dlInterval = setInterval(() => {
      const elapsed = (now() - dlStart) / 1000;
      const mbpsNow = toMbps(dlTotal, now() - dlStart);
      dlDetails.textContent = `Transferred: ${dlTotal.toLocaleString()} bytes — ${elapsed.toFixed(
        1
      )}s — ${mbpsNow.toFixed(2)} Mbps`;
      dlBar.style.width = Math.min(100, (mbpsNow / 100) * 100) + "%";
    }, 300);
    const dl = await downloadTimed(10, 3, (b) => {
      dlTotal = b;
    });
    clearInterval(dlInterval);
    dlMbpsEl.textContent = `${dl.mbps.toFixed(2)} Mbps`;
    dlDetails.textContent = `Transferred: ${dl.bytes.toLocaleString()} bytes — ${dl.seconds.toFixed(
      1
    )}s`;
    dlBar.style.width = Math.min(100, (dl.mbps / 100) * 100) + "%";
    log(`Download ${dl.mbps.toFixed(2)} Mbps`);

    await new Promise((r) => setTimeout(r, 300));

    let upTotal = 0;
    const upStart = now();
    const upInterval = setInterval(() => {
      const elapsed = (now() - upStart) / 1000;
      const mbpsNow = toMbps(upTotal, now() - upStart);
      upDetails.textContent = `Transferred: ${upTotal.toLocaleString()} bytes — ${elapsed.toFixed(
        1
      )}s — ${mbpsNow.toFixed(2)} Mbps`;
      upBar.style.width = Math.min(100, (mbpsNow / 100) * 100) + "%";
    }, 300);
    const up = await uploadTimed(10, 500000, (b) => {
      upTotal = b;
    });
    clearInterval(upInterval);
    upMbpsEl.textContent = `${up.mbps.toFixed(2)} Mbps`;
    upDetails.textContent = `Transferred: ${up.bytes.toLocaleString()} bytes — ${up.seconds.toFixed(
      1
    )}s`;
    upBar.style.width = Math.min(100, (up.mbps / 100) * 100) + "%";
    log(`Upload ${up.mbps.toFixed(2)} Mbps`);

    log("Tests complete.");
  } catch (e) {
    log("Error: " + (e && e.message ? e.message : e));
    console.error(e);
  } finally {
    runBtn.disabled = false;
  }
}

// auto-run on load
window.addEventListener("load", () => {
  runSpeedTest();
});
// button fallback
runBtn.addEventListener("click", runSpeedTest);
