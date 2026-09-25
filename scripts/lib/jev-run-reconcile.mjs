const LIVE_STATES = new Set(['starting','playing']);

export function assessJevRunManifest(manifest, {nowMs=Date.now(),
  heartbeatGraceMs=60_000,isPidRunning=()=>null}={}) {
  if (!manifest || !LIVE_STATES.has(manifest.status))
    return {action:'skip',reason:'manifest-not-live'};
  const pid=Number(manifest.pid);
  const updatedAt=Date.parse(manifest.updatedAt || '');
  if (!Number.isInteger(pid) || pid<=0 || !Number.isFinite(updatedAt))
    return {action:'attention',reason:'missing-or-invalid-pid-or-heartbeat'};
  const heartbeatAgeMs=Math.max(0,nowMs-updatedAt);
  const processRunning=isPidRunning(pid);
  if (processRunning===true)
    return heartbeatAgeMs>heartbeatGraceMs
      ? {action:'attention',reason:'stale-heartbeat-process-still-running',pid,heartbeatAgeMs}
      : {action:'healthy',reason:'player-process-running',pid,heartbeatAgeMs};
  if (processRunning!==false)
    return {action:'attention',reason:'player-process-state-unknown',pid,heartbeatAgeMs};
  if (heartbeatAgeMs<heartbeatGraceMs)
    return {action:'attention',reason:'player-exited-but-heartbeat-grace-not-met',pid,heartbeatAgeMs};
  return {action:'mark-failed',reason:'player-process-exited-with-stale-live-manifest',pid,heartbeatAgeMs};
}

export function reconcileJevRunManifest(manifest, assessment, at=new Date().toISOString()) {
  if (assessment?.action!=='mark-failed')
    throw new Error('Only a confirmed stale-process assessment can reconcile a manifest.');
  return {...manifest,status:'failed',updatedAt:at,reconciliation:{
    at,reason:assessment.reason,pid:assessment.pid,
    heartbeatAgeMs:assessment.heartbeatAgeMs,previousStatus:manifest.status,
  }};
}
