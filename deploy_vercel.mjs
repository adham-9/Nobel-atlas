/* Deploy site/index.html to Vercel using the CLI's stored credentials.
   Works around a Vercel CLI 65 bug: the CLI puts os.hostname() into a
   User-Agent header, and this machine's hostname is non-ASCII, which makes
   undici throw "Cannot convert argument to a ByteString". */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const AUTH = path.join(process.env.APPDATA, 'com.vercel.cli', 'Data', 'auth.json');
const CLIENT_ID = 'cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp';
const UA = 'nobel-atlas-deploy';

const auth = JSON.parse(fs.readFileSync(AUTH, 'utf8'));

async function refresh() {
  const disc = await fetch('https://vercel.com/.well-known/openid-configuration', {
    headers: { 'user-agent': UA }
  }).then((r) => r.json());
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: auth.refreshToken
  });
  const res = await fetch(disc.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
    body
  });
  const json = await res.json();
  if (!res.ok) throw new Error('token refresh failed: ' + res.status + ' ' + JSON.stringify(json));
  auth.token = json.access_token;
  if (json.refresh_token) auth.refreshToken = json.refresh_token;
  if (json.expires_in) auth.expiresAt = Date.now() + json.expires_in * 1000;
  fs.writeFileSync(AUTH, JSON.stringify(auth, null, 2));
  console.log('token refreshed');
}

async function api(pathname, opts) {
  const res = await fetch('https://api.vercel.com' + pathname, Object.assign({}, opts, {
    headers: Object.assign({ authorization: 'Bearer ' + auth.token, 'user-agent': UA }, (opts && opts.headers) || {})
  }));
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* ignore */ }
  if (!res.ok) throw new Error(pathname + ' -> ' + res.status + ' ' + text.slice(0, 500));
  return json;
}

async function main() {
  let me;
  try {
    me = await api('/v2/user');
  } catch (e) {
    if (!/invalidToken|403/.test(e.message)) throw e;
    await refresh();
    me = await api('/v2/user');
  }
  console.log('deploying as', me.user.username || me.user.email);

  const file = path.join('site', 'index.html');
  const data = fs.readFileSync(file, 'utf8');
  const name = process.argv[2] || 'nobel-atlas';

  const dep = await api('/v13/deployments?forceNew=1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      target: 'production',
      files: [{ file: 'index.html', data }],
      projectSettings: { framework: null, buildCommand: null, outputDirectory: null }
    })
  });
  console.log('deployment id:', dep.id);
  console.log('url: https://' + dep.url);

  for (let i = 0; i < 40; i++) {
    const st = await api('/v13/deployments/' + dep.id);
    if (st.readyState === 'READY' || st.readyState === 'ERROR') {
      console.log('state:', st.readyState);
      if (st.alias && st.alias.length) console.log('aliases:', st.alias.map((a) => 'https://' + a).join(' '));
      if (st.readyState === 'ERROR') process.exitCode = 1;
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
