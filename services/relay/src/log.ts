export function log(scope: string, msg: string, extra?: Record<string, unknown>) {
  const line = `${new Date().toISOString()} [${scope}] ${msg}`;
  if (extra) console.log(line, JSON.stringify(extra));
  else console.log(line);
}

export function warn(scope: string, msg: string, extra?: Record<string, unknown>) {
  const line = `${new Date().toISOString()} [${scope}] WARN ${msg}`;
  if (extra) console.warn(line, JSON.stringify(extra));
  else console.warn(line);
}
