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
  // Agent boost is a deliberately separate test capability. It is never
  // enabled by the normal local profile and must be paired with the
  // dedicated GM credential at the WebSocket boundary.
  const agentBoostEnabled = env.DR_ENABLE_AGENT_BOOST === '1';
  if (profile === 'public' && agentBoostEnabled) {
    throw new Error('Agent boost cannot be enabled on the public profile.');
  }
  const boundedInt = (name, fallback, min, max) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer from ${min} to ${max}.`);
    }
    return value;
  };
  const allowedOrigins = String(env.DR_ALLOWED_ORIGINS || '')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  if (profile === 'public' && !allowedOrigins.length) {
    throw new Error('Public hosting requires DR_ALLOWED_ORIGINS (comma-separated browser origins).');
  }
  const roleToken = (name) => {
    const value = env[name];
    if (profile === 'public' && (typeof value !== 'string' || value.length < 32)) {
      throw new Error(`Public hosting requires ${name} with at least 32 characters.`);
    }
    return value || env.DR_GM_TOKEN;
  };
  return {
    profile, host, port,
    apiEnabled: profile === 'local' ? env.DR_ENABLE_API !== '0' : env.DR_ENABLE_API === '1',
    debugApiEnabled,
    agentBoostEnabled,
    maxWsClients: boundedInt('DR_MAX_WS_CLIENTS', profile === 'public' ? 250 : 1000, 1, 10000),
    wsAuthTimeoutMs: boundedInt('DR_WS_AUTH_TIMEOUT_MS', 30_000, 5_000, 300_000),
    maxHttpConcurrent: boundedInt('DR_MAX_HTTP_CONCURRENT', 256, 1, 5000),
    httpRequestTimeoutMs: boundedInt('DR_HTTP_REQUEST_TIMEOUT_MS', 30_000, 1_000, 300_000),
    requireWsOrigin: profile === 'public',
    allowedOrigins,
    gmOperatorToken: roleToken('DR_GM_OPERATOR_TOKEN'),
    gmAdminToken: roleToken('DR_GM_ADMIN_TOKEN'),
    gmPlayToken: roleToken('DR_GM_PLAY_TOKEN'),
  };
}
