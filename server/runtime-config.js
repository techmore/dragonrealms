// Pure launch configuration. Local tools keep their API; network hosting is explicit.
export function runtimeConfig(env = process.env) {
  const profile = env.DR_PROFILE || 'local';
  if (!['local', 'public'].includes(profile)) throw new Error('DR_PROFILE must be local or public.');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const host = env.DR_HOST || (profile === 'local' ? '127.0.0.1' : '0.0.0.0');
  if (profile === 'local' && !['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('A non-loopback DR_HOST requires DR_PROFILE=public.');
  }
  if (profile === 'public' && (!env.DR_GM_TOKEN || env.DR_GM_TOKEN.length < 32)) {
    throw new Error('Public hosting requires an explicitly configured DR_GM_TOKEN of at least 32 characters.');
  }
  const debugApiEnabled = env.DR_ENABLE_DEBUG_API === '1';
  if (profile === 'public' && debugApiEnabled && (!env.DR_DEBUG_TOKEN || env.DR_DEBUG_TOKEN.length < 32)) {
    throw new Error('Public debug API requires an explicitly configured DR_DEBUG_TOKEN of at least 32 characters.');
  }
  return {
    profile, host, port,
    apiEnabled: profile === 'local' ? env.DR_ENABLE_API !== '0' : env.DR_ENABLE_API === '1',
    debugApiEnabled,
  };
}
