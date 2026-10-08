// CLI-private clock: game policies observe declared engine time; performance.now
// and the operating system retain real time. Never install in a live server.
export function installSimulationClock(elapsedSeconds, epoch = Date.now()) {
  const originalNow = Date.now;
  const simulatedNow = () => epoch + Math.floor(elapsedSeconds() * 1000);
  Date.now = simulatedNow;
  let restored = false;
  return {
    restore() {
      if (restored) return;
      restored = true;
      if (Date.now === simulatedNow) Date.now = originalNow;
    },
  };
}
