// Periodic FE telemetry is tested by the browser suite, not compared by its
// incidental position in a deterministic command transcript. Keep all other
// protocol frames and their ordering so semantic regressions still fail.
export function normalizeCorpus(messages) {
  return messages.filter((message) => message.t !== 'mindstate').map((message) => {
    if (typeof message.msg === 'string') {
      message = { ...message, msg: message.msg.replace(/\s+/g, ' ') };
    }
    return JSON.stringify(message).replace(/[0-9a-f]{32,64}/g, 'TOKEN').replace(/\d+/g, 'N');
  }).join('\n');
}
