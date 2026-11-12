#!/usr/bin/env node
/* Vendored from Doone-skser/wb-proxy qoder-proxy.mjs (MIT).
 * Modified for dsh-model-dock: configurable auth file, catalog covering the
 * `app` section (QoDuck `lmodel`), and a programmatic serve() handle.
 */
/**
 * qoder-proxy — 把 Qoder 账号里限时免费的模型(DeepSeek-Flash / Qwen3.8-Flash 等)
 * 反代成 OpenAI 兼容接口。零依赖,Node.js >= 18。
 *
 * 用法:
 *   node qoder-proxy.mjs serve [--port 8477] [--host 127.0.0.1] [--key <apikey>]
 *   node qoder-proxy.mjs login           # 从本机 Qoder IDE 导入登录态(macOS)
 *   node qoder-proxy.mjs models          # 打印当前账号可用模型
 *
 * 凭证优先级: 环境变量 QODER_TOKEN(+QODER_REFRESH_TOKEN) > ~/.qoder-proxy/auth.json
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

// ======================== cosy 协议 (签名/编码/会话) ========================
const CUSTOM = "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!";
const STD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const s2c = {};
for (let i = 0; i < 64; i++) s2c[STD[i]] = CUSTOM[i];
s2c['='] = '$';

function cosyEncode(plainBuf) {
  const std = plainBuf.toString('base64');
  const n = std.length, a = Math.floor(n / 3);
  const re = std.slice(n - a) + std.slice(a, n - a) + std.slice(0, a);
  return [...re].map(c => s2c[c]).join('');
}

const APP_CODE = 'cosy';
const SECRET_B64 = 'd2FyLCB3YXIgbmV2ZXIgY2hhbmdlcw==';
const COSY_VERSION = '1.0.10';
const md5hex = s => crypto.createHash('md5').update(s).digest('hex');
const uuid = () => crypto.randomUUID();
const unixSec = () => Math.floor(Date.now() / 1000);

const SERVER_PUB = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDA8iMH5c02LilrsERw9t6Pv5Nc
4k6Pz1EaDicBMpdpxKduSZu5OANqUq8er4GM95omAGIOPOh+Nx0spthYA2BqGz+l
6HRkPJ7S236FZz73In/KVuLnwI8JJ2CbuJap8kvheCCZpmAWpb/cPx/3Vr/J6I17
XcW+ML9FoCI6AOvOzwIDAQAB
-----END PUBLIC KEY-----`;

function fingerprint(uid) {
  const m = s => crypto.createHash('md5').update(s).digest('hex');
  return {
    machineId: process.env.QODER_MACHINE_ID || m('machine:' + uid),
    machineType: process.env.QODER_MACHINE_TYPE || m('machinetype:' + uid).slice(0, 18),
    machineToken: process.env.QODER_MACHINE_TOKEN || crypto.createHash('sha512').update('machinetoken:' + uid).digest('base64url').slice(0, 43),
  };
}

function newSession(identity) {
  const tempKey = crypto.randomBytes(16).toString('hex').slice(0, 16);
  const cosyKey = crypto.publicEncrypt(
    { key: SERVER_PUB, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(tempKey)).toString('base64');
  const payloadJson = JSON.stringify({
    name: identity.name, aid: identity.uid, uid: identity.uid, yx_uid: '',
    organization_id: identity.organizationId || '', organization_name: '',
    user_type: identity.userType || 'personal_standard',
    security_oauth_token: identity.securityOauthToken, refresh_token: identity.refreshToken || '',
  });
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(tempKey), Buffer.from(tempKey));
  const info = Buffer.concat([cipher.update(payloadJson, 'utf8'), cipher.final()]).toString('base64');
  return { tempKey, cosyKey, info, identity };
}

function buildHeaders(sess, fp, pathSig, bodyStr, accept, extra = {}) {
  const payloadB64 = Buffer.from(JSON.stringify({
    cosyVersion: COSY_VERSION, ideVersion: '', info: sess.info, requestId: uuid(), version: 'v1',
  })).toString('base64');
  const date = String(unixSec());
  const sig = md5hex(payloadB64 + '\n' + sess.cosyKey + '\n' + date + '\n' + bodyStr + '\n' + pathSig);
  return {
    'cosy-data-policy': 'agree',
    'content-type': 'application/json',
    'cosy-machinetype': fp.machineType,
    'cosy-clienttype': '5',
    'cosy-date': date,
    'cosy-user': sess.identity.uid,
    'cosy-key': sess.cosyKey,
    'cache-control': 'no-cache',
    'accept': accept,
    'authorization': 'Bearer COSY.' + payloadB64 + '.' + sig,
    'cosy-version': COSY_VERSION,
    'cosy-machineid': fp.machineId,
    'cosy-machinetoken': fp.machineToken,
    'login-version': 'v2',
    'user-agent': 'Go-http-client/2.0',
    'cosy-scene': 'assistant',
    'cosy-business-product': 'ide',
    'cosy-business-type': 'agent',
    ...extra,
  };
}

// ======================== 端点 ========================
const USERINFO_URL = 'https://openapi.qoder.sh/api/v1/userinfo';
const JOBTOKEN_URL = 'https://center.qoder.sh/algo/api/v3/user/jobToken?Encode=1';
const MODEL_LIST_URL = 'https://api2.qoder.sh/algo/api/v2/model/list?Encode=1';
const CHAT_URL = 'https://api2.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1';
const CHAT_PATH_SIG = '/api/v2/service/pro/sse/agent_chat_generation';
const ML_PATH_SIG = '/api/v2/model/list';

// ======================== 凭证管理 ========================
let AUTH_FILE = path.join(os.homedir(), '.qoder-proxy', 'auth.json');

/** Point the credential at the dock's own data directory. */
export function configureAuthFile(file) {
  AUTH_FILE = file;
}

export function authFilePath() {
  return AUTH_FILE;
}

/** Adopt a credential the caller already holds (a fresh IDE import). */
export function adoptAuth(a) {
  saveAuth({ ...(loadAuth() || {}), ...a });
}

export function loadAuth() {
  if (process.env.QODER_TOKEN) {
    return { token: process.env.QODER_TOKEN, refreshToken: process.env.QODER_REFRESH_TOKEN || '' };
  }
  try { return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')); } catch { return null; }
}
export function saveAuth(a) {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(a, null, 2), { mode: 0o600 });
}

// 从本机 Qoder IDE(macOS)导入: auth.v1.dat 用 Electron safeStorage 加密,
// 密钥在 Keychain "Qoder App Safe Storage"(Chromium safe_storage 算法)。
/** Windows OSCrypt key cache, one entry per Qoder data directory. */
const WIN_KEY_CACHE = new Map();

/** DPAPI-unprotect one directory's Local State key (PowerShell once per dir). */
function windowsKeyFor(dir) {
  const cached = WIN_KEY_CACHE.get(dir);
  if (cached !== undefined) return cached;
  const localState = path.join(dir, 'Local State');
  if (!fs.existsSync(localState)) throw new Error('Local State missing');
  const quoted = localState.replace(/'/g, "''");
  const script = "$ErrorActionPreference='Stop';"
    + "Add-Type -AssemblyName System.Security;"
    + `$ls = Get-Content '${quoted}' -Raw | ConvertFrom-Json;`
    + "$blob = [Convert]::FromBase64String($ls.os_crypt.encrypted_key);"
    + "if ($blob[0] -eq 0x44) { $blob = $blob[5..($blob.Length-1)] };"
    + "$key = [System.Security.Cryptography.ProtectedData]::Unprotect($blob, $null, "
    + "[System.Security.Cryptography.DataProtectionScope]::CurrentUser);"
    + "[Convert]::ToBase64String($key)";
  const encoded = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8' }).trim();
  const key = Buffer.from(encoded, 'base64');
  if (key.length === 0) throw new Error('DPAPI returned an empty key');
  WIN_KEY_CACHE.set(dir, key);
  return key;
}

/** Read one Windows Qoder data directory's `auth.v1.dat`. */
function readWindowsAuth(dir) {
  const file = path.join(dir, 'auth.v1.dat');
  const key = windowsKeyFor(dir);
  const enc = fs.readFileSync(file);
  if (enc.subarray(0, 3).toString('ascii') !== 'v10') throw new Error('unexpected OSCrypt prefix');
  const body = enc.subarray(3);
  const nonce = body.subarray(0, 12);
  const tag = body.subarray(body.length - 16);
  const cipher = body.subarray(12, body.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(cipher), decipher.final()]).toString('utf8');
  const auth = JSON.parse(plain);
  return { token: auth.token || auth.accessToken, refreshToken: auth.refreshToken || '' };
}

/**
 * Windows import: every `%APPDATA%\com.qoder.app.*` channel is a candidate,
 * stable first then the newest. Chromium's OSCrypt on Windows wraps an
 * AES-256-GCM key with DPAPI; `powershell` is the only DPAPI surface Node has
 * without a native addon, and its answer is cached for this process.
 */
function importFromWindows() {
  const root = process.env.APPDATA || '';
  if (root === '') throw new Error('未找到 %APPDATA%，无法读取 Qoder 登录态');
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    throw new Error(`无法读取 ${root}，请确认 Qoder 桌面版已安装并登录`);
  }
  const candidates = entries
    .filter(entry => entry.isDirectory() && entry.name.startsWith('com.qoder.app.'))
    .map(entry => {
      const dir = path.join(root, entry.name);
      let mtimeMs = 0;
      try { mtimeMs = fs.statSync(dir).mtimeMs; } catch {}
      return { name: entry.name, dir, mtimeMs };
    })
    .sort((a, b) => {
      const stable = Number(b.name === 'com.qoder.app.stable') - Number(a.name === 'com.qoder.app.stable');
      return stable !== 0 ? stable : b.mtimeMs - a.mtimeMs;
    });
  for (const candidate of candidates) {
    if (!fs.existsSync(path.join(candidate.dir, 'auth.v1.dat'))) continue;
    try {
      const auth = readWindowsAuth(candidate.dir);
      if (typeof auth.token === 'string' && auth.token !== '') return auth;
    } catch {
      // A stale key or a half-written file: try the next channel.
    }
  }
  throw new Error(`未找到可解密的 Qoder 登录态（已扫描 ${root}\\com.qoder.app.*）。请先打开 Qoder 桌面版并完成登录`)
}

export function importFromIDE(options = {}) {
  if (process.platform === 'win32') return importFromWindows();
  if (process.platform !== 'darwin') {
    throw new Error(`Qoder 自动导入目前支持 macOS / Windows（当前 ${process.platform}）`)
  }
  const dat = path.join(os.homedir(), 'Library/Application Support/com.qoder.app.stable/auth.v1.dat');
  if (!fs.existsSync(dat)) {
    throw new Error(`未找到 Qoder 登录文件（${dat}）。请先打开 Qoder 桌面版并完成登录，然后再点「使用桌面版登录」`)
  }
  let pw
  try {
    // Bounded: when macOS suppresses the keychain prompt (background launch,
    // denied ACL), `security` waits forever and blocks the whole host event
    // loop — the plugin then looks like a silent install failure.
    pw = execSync('security find-generic-password -s "Qoder App Safe Storage" -w', { encoding: 'utf8', timeout: options.timeoutMs ?? 5000 }).trim()
  } catch (error) {
    const timedOut = error?.code === 'ETIMEDOUT' || error?.signal === 'SIGTERM'
    throw new Error(timedOut
      ? '读取钥匙串超时：系统没有弹出「Qoder App Safe Storage」授权窗口。可在终端手动执行 security find-generic-password -s "Qoder App Safe Storage" -w 并点「始终允许」，或改用 QODER_TOKEN / .qoder-token。'
      : '无法读取钥匙串里的「Qoder App Safe Storage」，请在系统提示中允许访问后重试')
  }
  const key = crypto.pbkdf2Sync(pw, 'saltysalt', 1003, 16, 'sha1');
  const buf = fs.readFileSync(dat);
  const d = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20));
  const plain = Buffer.concat([d.update(buf.subarray(3)), d.final()]).toString('utf8');
  const j = JSON.parse(plain);
  return { token: j.token || j.accessToken, refreshToken: j.refreshToken || '' };
}

// 用 refreshToken 换新的访问令牌(jobToken 交换)
async function refreshTokens(auth) {
  const date = new Date().toUTCString();
  const sig = md5hex(APP_CODE + '&' + SECRET_B64 + '&' + date);
  const inner = JSON.stringify({
    personalToken: '', securityOauthToken: '', refreshToken: auth.refreshToken,
    needRefresh: true, authInfo: {},
  });
  const body = cosyEncode(Buffer.from(JSON.stringify({ payload: inner, encodeVersion: '1' })));
  const seed = 'cred:' + auth.refreshToken;
  const fp = fingerprint(seed);
  const resp = await fetch(JOBTOKEN_URL, {
    method: 'POST',
    headers: {
      'cosy-machinetoken': fp.machineToken, 'cosy-machinetype': fp.machineType,
      'login-version': 'v2', 'appcode': APP_CODE, 'accept': 'application/json',
      'accept-encoding': 'identity', 'cosy-version': COSY_VERSION, 'cosy-clienttype': '5',
      'date': date, 'signature': sig, 'content-type': 'application/json',
      'cosy-machineid': fp.machineId, 'user-agent': 'Go-http-client/2.0',
    },
    body,
  });
  if (!resp.ok) throw new Error('jobToken refresh HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 200));
  const j = await resp.json();
  if (!j.securityOauthToken) throw new Error('jobToken refresh: no securityOauthToken in response');
  const out = { token: j.securityOauthToken, refreshToken: j.refreshToken || auth.refreshToken };
  saveAuth(out);
  return out;
}

// PAT → jobToken 交换(Personal Access Token 通道,与 IDE 设备令牌不同配额桶)
async function exchangePAT(pat) {
  const date = new Date().toUTCString();
  const sig = md5hex(APP_CODE + '&' + SECRET_B64 + '&' + date);
  const inner = JSON.stringify({
    personalToken: pat, securityOauthToken: '', refreshToken: '', needRefresh: false, authInfo: {},
  });
  const body = cosyEncode(Buffer.from(JSON.stringify({ payload: inner, encodeVersion: '1' })));
  const fp = fingerprint('cred:' + pat);
  const resp = await fetch(JOBTOKEN_URL, {
    method: 'POST',
    headers: {
      'cosy-machinetoken': fp.machineToken, 'cosy-machinetype': fp.machineType,
      'login-version': 'v2', 'appcode': APP_CODE, 'accept': 'application/json',
      'accept-encoding': 'identity', 'cosy-version': COSY_VERSION, 'cosy-clienttype': '5',
      'date': date, 'signature': sig, 'content-type': 'application/json',
      'cosy-machineid': fp.machineId, 'user-agent': 'Go-http-client/2.0',
    },
    body,
  });
  if (!resp.ok) throw new Error('PAT exchange HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 300));
  const j = await resp.json();
  if (!j.securityOauthToken) throw new Error('PAT exchange: 响应缺少 securityOauthToken: ' + JSON.stringify(j).slice(0, 300));
  return {
    token: j.securityOauthToken, refreshToken: j.refreshToken || '',
    name: j.name || '', uid: j.id || '', userType: j.userType || 'personal_standard',
  };
}

// ======================== 上游会话 ========================
// ======================== jobToken(IDE 通道) ========================
// 抓包自 IDE 主进程: 用 dt- 设备令牌换一个 24h 的 jt- 工作令牌,走官方客户端配额通道
const JOBTOKEN_MINT_URL = 'https://openapi.qoder.sh/api/v1/me/jobToken';
const QODER_CLIENT_ID = '732aef47-9cf2-46a2-95fe-4cebb5d0d1fa';

async function mintJobToken(ideToken) {
  const resp = await fetch(JOBTOKEN_MINT_URL, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + ideToken, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ clientId: QODER_CLIENT_ID }),
  });
  if (!resp.ok) throw new Error('mint jobToken HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 200));
  const j = await resp.json();
  if (!j.token) throw new Error('mint jobToken: 响应无 token');
  return { token: j.token, expiresAt: j.expires_at, refreshToken: j.refresh_token || '' };
}

// 取一个未过期的 jt-(过期前 10 分钟自动重签,结果缓存在 auth.json)
async function getIDEChannelToken(force = false) {
  const auth = loadAuth() || {};
  const ideToken = auth.ideToken || auth.token;
  if (!ideToken) return null;
  if (!force && auth.jobToken && auth.jobTokenExpiresAt) {
    const exp = Date.parse(auth.jobTokenExpiresAt);
    if (exp && exp - Date.now() > 10 * 60 * 1000) return auth.jobToken;
  }
  const jt = await mintJobToken(ideToken);
  saveAuth({ ...auth, jobToken: jt.token, jobTokenExpiresAt: jt.expiresAt, jobTokenRefresh: jt.refreshToken });
  return jt.token;
}

let AUTH = null;       // {token, refreshToken}
let IDENTITY = null;   // userinfo 派生
let SESS = null;       // cosy session
let FP = null;         // 设备指纹

export async function initSession(forceRefresh = false) {
  if (!AUTH) {
    AUTH = loadAuth();
    if (!AUTH || !AUTH.token) throw new Error('未找到凭证: 设 QODER_TOKEN 或先运行 `node qoder-proxy.mjs login`');
  }
  // IDE 通道的"刷新"就是重新签 jt-,走下面;只有纯 PAT 通道才用旧交换端点
  if (forceRefresh && AUTH.refreshToken && !AUTH.ideToken && !AUTH.token?.startsWith('dt-')) AUTH = await refreshTokens(AUTH);

  // 优先走 IDE 通道: dt- 换 24h 的 jt-,配额与官方客户端同桶
  let channelToken = AUTH.token;
  if (!process.env.QODER_NO_IDE_CHANNEL && (AUTH.ideToken || AUTH.token?.startsWith('dt-'))) {
    try {
      const jt = await getIDEChannelToken(forceRefresh);
      if (jt) { channelToken = jt; console.log('[auth] IDE 通道 jobToken 就绪'); }
    } catch (e) {
      console.error('[auth] jobToken 签发失败,回退原通道:', e.message);
      // The desktop app rotates auth.v1.dat on its own schedule. If the stored
      // dt- is what died, re-import the desktop session once instead of
      // serving a token we already know is dead.
      if (/\b(401|403)\b/.test(e.message)) {
        try {
          const imported = importFromIDE();
          if (imported && imported.token) {
            saveAuth({ ...(loadAuth() || {}), ...imported, ideToken: imported.token, ideRefreshToken: imported.refreshToken });
            AUTH = loadAuth();
            const jt = await getIDEChannelToken(true);
            if (jt) { channelToken = jt; console.log('[auth] 已从桌面版重新导入并重签 jobToken'); }
          }
        } catch (e2) { console.error('[auth] 桌面版重新导入失败:', e2.message); }
      }
    }
  }

  const resp = await fetch(USERINFO_URL, { headers: { authorization: 'Bearer ' + channelToken } });
  if (resp.status === 401 && channelToken !== AUTH.token) {
    // jt- 不能调 userinfo 属正常,用存下的身份兜底
  } else if (resp.status === 401 && !forceRefresh && AUTH.refreshToken) return initSession(true);
  else if (!resp.ok && !AUTH.uid) throw new Error('userinfo HTTP ' + resp.status);
  if (resp.ok) {
    const ui = await resp.json();
    IDENTITY = {
      name: ui.name, uid: ui.id, organizationId: ui.organization_id || '',
      userType: ui.userType || 'personal_standard',
      securityOauthToken: channelToken, refreshToken: AUTH.refreshToken || '',
    };
    FP = fingerprint(ui.id);
  } else {
    IDENTITY = {
      name: AUTH.name || 'qoder-user', uid: AUTH.uid, organizationId: '',
      userType: AUTH.userType || 'personal_standard',
      securityOauthToken: channelToken, refreshToken: AUTH.refreshToken || '',
    };
    FP = fingerprint(AUTH.uid);
  }
  SESS = newSession(IDENTITY);
  return { name: IDENTITY.name, id: IDENTITY.uid };
}

// ======================== 模型目录 ========================
// ======================== 每日签到(领 Credits) ========================
// 国际版需要官方客户端真实设备指纹,macOS 上从本机 Qoder IDE 的缓存读取
function ideFingerprint() {
  try {
    const umid = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.qoder/umid-cache.json'), 'utf8'));
    const machineId = fs.readFileSync(path.join(os.homedir(), '.qoder/.auth/machine_id'), 'utf8').trim();
    return {
      machineId,
      machineToken: umid.info.machineToken, machineType: umid.info.machineType,
      machineCode: umid.info.machineCode || '',
    };
  } catch { return null; }
}

export async function checkin() {
  const auth = loadAuth();
  const dt = auth?.ideToken || auth?.token;
  if (!dt) throw new Error('无凭证');
  const fp = ideFingerprint();
  const headers = {
    'authorization': 'Bearer ' + dt, 'accept': 'application/json',
    'accept-language': 'zh-CN', 'user-agent': 'Qoder', 'cosy-clienttype': '10',
  };
  if (fp) {
    headers['cosy-version'] = '0.4.4';
    headers['cosy-machineid'] = fp.machineId;
    headers['cosy-machinetoken'] = fp.machineToken;
    headers['cosy-machinetype'] = fp.machineType;
    if (fp.machineCode) headers['cosy-machinecode'] = fp.machineCode;
    headers['cosy-machinehostname'] = 'localhost';
    headers['cosy-machineos'] = 'aarch64_darwin';
  }
  const base = 'https://openapi.qoder.sh';
  const listResp = await fetch(base + '/sash/api/v1/me/campaigns', { headers });
  if (!listResp.ok) throw new Error('查询活动 HTTP ' + listResp.status);
  const list = await listResp.json();
  const target = (list.campaigns || []).find(c => c.actionType === 'CLAIM_BENEFIT' && c.claimStatus === 'CLAIMABLE');
  if (!target) {
    const claimed = (list.campaigns || []).some(c => c.actionType === 'CLAIM_BENEFIT' && c.claimStatus === 'CLAIMED');
    return { status: claimed ? 'already_claimed' : 'no_campaign' };
  }
  const claimResp = await fetch(`${base}/sash/api/v1/me/campaigns/${target.campaignId}/claim`, { method: 'POST', headers });
  if (!claimResp.ok) throw new Error('领取 HTTP ' + claimResp.status + ': ' + (await claimResp.text()).slice(0, 200));
  const j = await claimResp.json();
  return {
    status: j.replayed ? 'already_claimed' : 'claimed',
    amount: j.benefit?.amount, expiresAt: j.validity ? j.expiresAt : undefined,
  };
}

const FALLBACK_MODELS = [
  { key: 'dfmodel', display_name: 'DeepSeek-Flash', is_reasoning: true, price_factor: 0, enable: true },
  { key: 'qfmodel', display_name: 'Qwen3.8-Flash', is_reasoning: true, price_factor: 0, enable: true },
];
const MODEL_ALIASES = {
  'deepseek': 'dfmodel', 'deepseek-flash': 'dfmodel', 'deepseek-v4.1-flash': 'dfmodel',
  'deepseek-v4.1-flash-1017': 'dfmodel',
  'deepseek-v4-flash': 'dfmodel', 'ds-flash': 'dfmodel', 'ds': 'dfmodel',
  'qwen': 'qfmodel', 'qwen-flash': 'qfmodel', 'qwen3.8-flash': 'qfmodel',
  'auto': 'dfmodel', 'default': 'dfmodel',
};
// /v1/models 只展示这两个免费模型(key -> 对外 id)
const PUBLIC_MODEL_IDS = { dfmodel: 'deepseek-v4.1-flash-1017', qfmodel: 'qwen3.8-flash' };
let modelCache = { at: 0, models: null };

async function fetchModels(force = false, retried = false) {
  if (!force && modelCache.models && Date.now() - modelCache.at < 5 * 60 * 1000) return modelCache.models;
  try {
    const h = buildHeaders(SESS, FP, ML_PATH_SIG, '', 'application/json');
    const resp = await fetch(MODEL_LIST_URL, { headers: h });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      if (!retried && isSessionExpired(resp.status, detail) && (AUTH?.refreshToken || AUTH?.ideToken)) {
        await initSession(true);
        return fetchModels(force, true);
      }
      throw new Error('HTTP ' + resp.status);
    }
    const j = await resp.json();
    // The account catalog is split by surface. QoDuck lives in `app`, the
    // regular chat models in `chat`/`assistant`; a surface-aware reader has to
    // merge them or the free model is invisible.
    const byKey = new Map();
    for (const arr of [j.chat, j.assistant, j.app]) {
      if (!Array.isArray(arr)) continue;
      for (const m of arr) {
        if (!m || typeof m.key !== 'string' || m.key === '') continue;
        byKey.set(m.key, m);
      }
    }
    if (byKey.size > 0) {
      const contextWindow = (m) => {
        const configs = m.context_config && typeof m.context_config === 'object' ? m.context_config : {};
        let fallback = m.max_input_tokens || 200000;
        for (const entry of Object.values(configs)) {
          if (entry && entry.is_default && Number(entry.token_count) > 0) return Number(entry.token_count);
        }
        return fallback;
      };
      const efforts = (m) => {
        const enabled = m.thinking_config && m.thinking_config.enabled;
        const set = enabled && enabled.efforts && typeof enabled.efforts === 'object' ? Object.keys(enabled.efforts) : [];
        return set;
      };
      const defaultEffort = (m) => {
        const enabled = m.thinking_config && m.thinking_config.enabled;
        const set = enabled && enabled.efforts && typeof enabled.efforts === 'object' ? enabled.efforts : null;
        if (set === null) return undefined;
        for (const [key, value] of Object.entries(set)) if (value && value.is_default) return key;
        return undefined;
      };
      modelCache = {
        at: Date.now(),
        models: [...byKey.values()].filter(m => m.enable !== false).map(m => ({
          key: m.key,
          display_name: m.display_name || m.key,
          is_reasoning: !!m.is_reasoning,
          price_factor: m.price_factor ?? 1,
          enable: m.enable !== false,
          max_input_tokens: contextWindow(m),
          is_free: m.is_free === true || m.price_factor === 0 || (Array.isArray(m.tags) && m.tags.includes('free')),
          efforts: efforts(m),
          default_effort: defaultEffort(m),
          can_disable_thinking: Boolean(m.thinking_config && m.thinking_config.disabled),
          supports_images: m.is_vl === true,
        })),
      };
      return modelCache.models;
    }
  } catch (e) {
    // The lane must be able to tell a live catalog from the compiled-in
    // fallback; swallowing this here made the panel claim "live" forever.
    throw e instanceof Error ? e : new Error(String(e));
  }
  return [];
}

/** Live catalog for the lane/panel; throws when the upstream call fails. */
export async function getModelsLive(force = true) {
  return fetchModels(force, false);
}

/**
 * Proxy-internal catalog. Chat routes keep working with the compiled-in
 * fallback if the catalog endpoint is down, but the lane never publishes this
 * fallback as a live catalog.
 */
export async function getModels(force = false, retried = false) {
  try {
    return await fetchModels(force, retried);
  } catch (e) {
    console.error('[models] 拉取失败,用兜底列表:', e.message);
    return FALLBACK_MODELS;
  }
}

// 推理档位: 模型名后缀 ":max/:high/:medium/:low/:xhigh/:off",或请求体 reasoning_effort
const VALID_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const DEFAULT_EFFORT = 'max'; // 默认开思考 + max 档
// 各模型实际支持的档位(来自上游目录 thinking_config);不在表内的模型不做校验
const EFFORT_SUPPORT = {
  dfmodel: new Set(['low', 'high', 'max']),
  qfmodel: new Set(['low', 'medium', 'xhigh']),
};
/**
 * 把请求的档位收敛到该模型实际支持的档位。
 *
 * `declared` 来自上游目录的 thinking_config：付费模型（Auto/Efficient/Ultimate 等）
 * 支持的档位各不相同，之前只对 dfmodel/qfmodel 查表，其他模型会把默认的 `max`
 * 原样发出去，上游就会拒绝。没有声明档位的模型视为不开思考，直接 `off`。
 */
function clampEffort(modelKey, effort, declared) {
  const supported = new Set(
    Array.isArray(declared) && declared.length > 0
      ? declared.filter(item => VALID_EFFORTS.has(item))
      : [...(EFFORT_SUPPORT[modelKey] ?? [])],
  );
  if (supported.size === 0) return 'off';
  if (effort === 'off') return 'off';
  if (!effort) {
    if (supported.has('high')) return 'high';
    if (supported.has('xhigh')) return 'xhigh';
    return [...supported][0];
  }
  if (supported.has(effort)) return effort;
  const fallback = {
    xhigh: ['max', 'high'],
    max: ['xhigh', 'high'],
    high: ['medium', 'max', 'xhigh'],
    medium: ['high', 'low'],
    low: ['medium'],
  };
  for (const alternative of fallback[effort] ?? []) {
    if (supported.has(alternative)) return alternative;
  }
  return supported.has('high') ? 'high' : [...supported][0];
}

function resolveModel(requested, models) {
  let r = (requested || 'default').trim();
  let effort = null;
  const ci = r.lastIndexOf(':');
  if (ci > 0) {
    const suffix = r.slice(ci + 1).toLowerCase();
    if (suffix === 'off' || suffix === 'no-think' || suffix === 'nothink') { effort = 'off'; r = r.slice(0, ci); }
    else if (VALID_EFFORTS.has(suffix)) { effort = suffix; r = r.slice(0, ci); }
  }
  const key = MODEL_ALIASES[r.toLowerCase()] || r;
  const info = models.find(m => m.key === key);
  return { key, effort, info: info || { key, display_name: key, is_reasoning: true, price_factor: 0, enable: true } };
}

// ======================== 消息转换 ========================
function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(p => {
      if (typeof p === 'string') return p;
      if (p && p.type === 'text') return p.text || '';
      return '';
    }).join('');
  }
  return content == null ? '' : String(content);
}

function convertMessages(incoming) {
  const out = [];
  let hasSystem = false;
  for (const m of incoming || []) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role;
    if (role === 'system' || role === 'developer') {
      if (hasSystem) { // 多个 system 合并
        out[0].content += '\n\n' + contentToText(m.content);
        continue;
      }
      hasSystem = true;
      out.push({ role: 'system', content: contentToText(m.content) });
      continue;
    }
    if (role === 'user') {
      // Claude 风格 tool_result 块 → role:tool
      if (Array.isArray(m.content) && m.content[0] && m.content[0].type === 'tool_result') {
        for (const b of m.content) {
          if (!b || b.type !== 'tool_result') continue;
          out.push({ role: 'tool', tool_call_id: b.tool_use_id || '', content: contentToText(b.content) });
        }
        continue;
      }
      out.push({ role: 'user', content: contentToText(m.content) });
      continue;
    }
    if (role === 'assistant') {
      const msg = { role: 'assistant', content: '' };
      if (Array.isArray(m.content)) {
        const texts = [], toolCalls = [];
        for (const b of m.content) {
          if (!b) continue;
          if (b.type === 'text') texts.push(b.text || '');
          else if (b.type === 'tool_use') {
            toolCalls.push({
              id: b.id, type: 'function',
              function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
            });
          }
        }
        msg.content = texts.join('');
        if (m.tool_calls) toolCalls.push(...m.tool_calls);
        if (toolCalls.length) msg.tool_calls = toolCalls;
      } else {
        msg.content = contentToText(m.content);
        if (Array.isArray(m.tool_calls) && m.tool_calls.length) msg.tool_calls = m.tool_calls;
      }
      out.push(msg);
      continue;
    }
    if (role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.tool_call_id || '', content: contentToText(m.content) });
      continue;
    }
  }
  if (!hasSystem) out.unshift({ role: 'system', content: 'You are a helpful assistant.' });
  return out;
}

function latestUserPrompt(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
}

// ======================== 上游调用 ========================
function buildUpstreamBody(modelKey, modelInfo, messages, tools, maxTokens, effort) {
  const prompt = latestUserPrompt(messages);
  const nid = uuid();
  const thinking = effort !== 'off';
  const eff = thinking ? (effort || DEFAULT_EFFORT) : 'none';
  const body = {
    request_id: nid, request_set_id: uuid(), chat_record_id: nid,
    stream: true, chat_task: 'FREE_INPUT',
    chat_context: {
      chatPrompt: '',
      extra: {
        context: [],
        modelConfig: { is_reasoning: thinking, key: modelKey, ...(eff ? { effort: eff } : {}) },
        originalContent: { type: 'text', text: prompt },
      },
      features: [], imageUrls: null, text: { type: 'text', text: prompt },
    },
    image_urls: null, is_reply: true, is_retry: false,
    session_id: uuid(), code_language: '', source: 1, version: '3', chat_prompt: '',
    parameters: { max_tokens: maxTokens || 32768 },
    aliyun_user_type: IDENTITY.userType || 'personal_standard',
    session_type: 'qoder', agent_id: 'agent_common', task_id: 'common',
    model_config: {
      key: modelKey, display_name: modelInfo.display_name || modelKey, model: '',
      format: 'openai', is_vl: false, is_reasoning: thinking,
      api_key: '', url: '', source: 'system',
      max_input_tokens: modelInfo.max_input_tokens || 180000,
      ...(eff ? { effort: eff } : {}),
    },
    messages,
  };
  if (tools) body.tools = tools;
  return body;
}

/**
 * Whether an upstream answer means "the cached gateway session expired".
 *
 * Current Qoder builds answer an expired `jt-` with 403 and
 * `{"code":"105","message":"Login expired"}`; only 401 was treated as
 * refreshable here, so a lane that had been up for the token's 24h lifetime
 * stayed dead (and still looked "signed in") until the plugin was reloaded.
 */
function isSessionExpired(status, detail) {
  if (status === 401) return true;
  if (status !== 403) return false;
  return /"code"\s*:\s*"?105"?|login expired|session expired|not logged in|unauthor/i.test(detail || '');
}

class UpstreamError extends Error {
  constructor(status, detail) { super(`upstream ${status}: ${(detail || '').slice(0, 300)}`); this.status = status; this.detail = detail; }
}
const isTransient = (status, detail) =>
  status === 418 || status === 429 || status >= 500 || /provider_error|rate.?limit|timeout/i.test(detail || '');

// 流式调用上游,逐 delta 回调。返回 {usage}
async function callUpstream(modelKey, modelInfo, messages, tools, maxTokens, effort, onDelta) {
  const body = buildUpstreamBody(modelKey, modelInfo, messages, tools, maxTokens, effort);
  const bodyStr = cosyEncode(Buffer.from(JSON.stringify(body)));
  const maxRetries = 2;
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt));
    const h = buildHeaders(SESS, FP, CHAT_PATH_SIG, bodyStr, 'text/event-stream',
      { 'x-model-key': modelKey, 'x-model-source': 'system' });
    let resp;
    try {
      resp = await fetch(CHAT_URL, { method: 'POST', headers: h, body: bodyStr });
    } catch (e) { lastErr = e; continue; }
    if (resp.status !== 200) {
      const detail = await resp.text().catch(() => '');
      lastErr = new UpstreamError(resp.status, detail);
      if (isSessionExpired(resp.status, detail) && attempt === 0 && (AUTH.refreshToken || AUTH.ideToken)) {
        await initSession(true); continue;
      }
      if (isTransient(resp.status, detail) && attempt < maxRetries) continue;
      throw lastErr;
    }
    // 读 SSE
    const usage = { prompt_tokens: 0, completion_tokens: 0 };
    let emitted = false, envelopeErr = null;
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          let wrapper;
          try { wrapper = JSON.parse(data); } catch { continue; }
          if (wrapper.statusCodeValue && wrapper.statusCodeValue !== 200) {
            envelopeErr = new UpstreamError(wrapper.statusCodeValue, wrapper.body || '');
            break;
          }
          const inner = wrapper.body;
          if (!inner || inner === '[DONE]') continue;
          let chunk;
          try { chunk = JSON.parse(inner); } catch { continue; }
          if (chunk.code && !chunk.choices) {
            envelopeErr = new UpstreamError(wrapper.statusCodeValue || 400, inner);
            break;
          }
          if (chunk.usage) {
            usage.prompt_tokens = chunk.usage.prompt_tokens || usage.prompt_tokens;
            usage.completion_tokens = chunk.usage.completion_tokens || usage.completion_tokens;
          }
          for (const ch of chunk.choices || []) {
            const d = ch.delta || {};
            if (d.content || d.reasoning_content || d.tool_calls || d.role) {
              emitted = true;
              onDelta({
                role: d.role, content: d.content || '',
                reasoning: d.reasoning_content || '',
                toolCalls: Array.isArray(d.tool_calls) && d.tool_calls.length ? d.tool_calls : null,
              });
            }
          }
        }
        if (envelopeErr) break;
      }
    } catch (e) {
      lastErr = e;
      if (!emitted && attempt < maxRetries) continue;
      throw e;
    }
    if (envelopeErr) {
      lastErr = envelopeErr;
      if (!emitted && isTransient(envelopeErr.status, envelopeErr.detail) && attempt < maxRetries) continue;
      throw envelopeErr;
    }
    if (!emitted) { lastErr = new Error('upstream empty stream'); if (attempt < maxRetries) continue; throw lastErr; }
    return { usage };
  }
  throw lastErr || new Error('upstream failed');
}

// ======================== HTTP 服务 ========================
const ARGS = process.argv.slice(2);
function argVal(name, dflt) {
  const i = ARGS.indexOf('--' + name);
  return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : dflt;
}

function openaiChunk(id, created, model, delta, finishReason = null, usage = null) {
  const c = {
    id, object: 'chat.completion.chunk', created, model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  if (usage) c.usage = usage;
  return c;
}

async function handleChatCompletions(req, res, body) {
  let r;
  try { r = JSON.parse(body); } catch { return jsonErr(res, 400, 'invalid JSON body'); }
  const models = await getModels();
  const { key: modelKey, effort: modelEffort, info: modelInfo } = resolveModel(r.model, models);
  // 档位优先级: 模型名后缀 > reasoning_effort / reasoning.effort > 默认 max
  let effort = modelEffort;
  if (!effort) {
    const re = (typeof r.reasoning_effort === 'string' && r.reasoning_effort)
      || (r.reasoning && typeof r.reasoning.effort === 'string' && r.reasoning.effort) || '';
    const rl = re.toLowerCase();
    if (rl === 'none' || rl === 'off' || rl === 'disable' || rl === 'disabled') effort = 'off';
    else if (VALID_EFFORTS.has(rl)) effort = rl;
  }
  effort = clampEffort(modelKey, effort, modelInfo?.is_reasoning === true ? modelInfo.efforts : []);
  const messages = convertMessages(r.messages);
  const tools = Array.isArray(r.tools) && r.tools.length ? r.tools : null;
  const isStream = r.stream === true;
  const reqId = 'chatcmpl-' + crypto.randomBytes(12).toString('hex');
  const created = unixSec();
  const t0 = Date.now();
  console.log(`[chat] model=${r.model || 'default'}->${modelKey} effort=${effort || DEFAULT_EFFORT} stream=${isStream} msgs=${messages.length} tools=${tools ? tools.length : 0}`);

  if (isStream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no',
    });
    const send = obj => res.write('data: ' + JSON.stringify(obj) + '\n\n');
    let sawToolCalls = false, usage = null;
    try {
      const out = await callUpstream(modelKey, modelInfo, messages, tools, r.max_tokens, effort, d => {
        const delta = {};
        if (d.role) delta.role = d.role;
        if (d.reasoning) delta.reasoning_content = d.reasoning;
        if (d.content) { delta.role = delta.role || 'assistant'; delta.content = d.content; }
        if (d.toolCalls) { delta.tool_calls = d.toolCalls; sawToolCalls = true; }
        send(openaiChunk(reqId, created, modelKey, delta));
      });
      usage = out.usage;
    } catch (e) {
      console.error(`[chat] 上游错误: ${e.message} (${Date.now() - t0}ms)`);
      send({ error: { message: e.message, type: e instanceof UpstreamError ? 'upstream_error' : 'proxy_error' } });
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    const u = usage && (usage.prompt_tokens || usage.completion_tokens)
      ? { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.prompt_tokens + usage.completion_tokens }
      : null;
    send(openaiChunk(reqId, created, modelKey, {}, sawToolCalls ? 'tool_calls' : 'stop', u));
    res.write('data: [DONE]\n\n');
    res.end();
    console.log(`[chat] 完成 ${Date.now() - t0}ms in=${u?.prompt_tokens} out=${u?.completion_tokens}`);
  } else {
    let full = '', reasoning = '';
    const toolFrags = new Map(); // index -> 合并中的 tool_call
    try {
      const out = await callUpstream(modelKey, modelInfo, messages, tools, r.max_tokens, effort, d => {
        if (d.content) full += d.content;
        if (d.reasoning) reasoning += d.reasoning;
        if (d.toolCalls) {
          for (const tc of d.toolCalls) {
            const k = tc.index ?? tc.id ?? 0;
            if (!toolFrags.has(k)) toolFrags.set(k, { id: tc.id, type: 'function', function: { name: tc.function?.name || '', arguments: '' } });
            const cur = toolFrags.get(k);
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.function.name = tc.function.name;
            if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
          }
        }
      });
      const usage = out.usage;
      const toolCallBuf = [...toolFrags.values()];
      const msg = { role: 'assistant', content: full || null };
      if (reasoning) msg.reasoning_content = reasoning;
      let finish = 'stop';
      if (toolCallBuf.length) { finish = 'tool_calls'; msg.tool_calls = toolCallBuf; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: reqId, object: 'chat.completion', created, model: modelKey,
        choices: [{ index: 0, message: msg, finish_reason: finish }],
        usage: {
          prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens,
          total_tokens: usage.prompt_tokens + usage.completion_tokens,
        },
      }));
      console.log(`[chat] 完成 ${Date.now() - t0}ms in=${usage.prompt_tokens} out=${usage.completion_tokens}`);
    } catch (e) {
      console.error(`[chat] 上游错误: ${e.message} (${Date.now() - t0}ms)`);
      jsonErr(res, e instanceof UpstreamError ? 502 : 500, e.message);
    }
  }
}

function jsonErr(res, status, msg) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: msg, type: 'proxy_error' } }));
}

async function handleModels(res) {
  const models = await getModels();
  const now = unixSec();
  // 只展示 PUBLIC_MODEL_IDS 里映射的免费模型
  const data = [];
  for (const [key, publicId] of Object.entries(PUBLIC_MODEL_IDS)) {
    const m = models.find(x => x.key === key);
    data.push({
      id: publicId, object: 'model', created: now, owned_by: 'qoder',
      display_name: m?.display_name || publicId, free: true,
      reasoning: m ? m.is_reasoning : true, upstream_key: key,
    });
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ object: 'list', data }));
}

// ======================== exported surface ========================
export function currentIdentity() {
  return IDENTITY === null
    ? undefined
    : { name: IDENTITY.name, uid: IDENTITY.uid, userType: IDENTITY.userType };
}

/**
 * Start the loopback OpenAI-compatible server and return once it is listening.
 * `port: 0` asks the OS for an ephemeral port, which the dock prefers so two
 * profiles never collide on 8477.
 */
export async function serve(port, host, apiKey) {
  if (SESS === null) await initSession();
  try { await getModels(); } catch { /* the catalog is advisory; chat still works */ }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (apiKey) {
      const auth = req.headers.authorization || '';
      if (auth !== 'Bearer ' + apiKey) return jsonErr(res, 401, 'invalid api key');
    }
    const url = req.url.split('?')[0];
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        if (req.method === 'POST' && url === '/v1/chat/completions') return await handleChatCompletions(req, res, body);
        if (req.method === 'GET' && url === '/v1/models') return await handleModels(res);
        if (url === '/health' || url === '/') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, user: IDENTITY ? IDENTITY.name : '' }));
        }
        jsonErr(res, 404, 'not found: ' + url);
      } catch (e) {
        console.error('[qoder] unhandled:', e && e.message);
        if (!res.headersSent) jsonErr(res, 500, e && e.message);
        else res.end();
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const actualPort = address && typeof address === 'object' ? address.port : port;
  return {
    server,
    port: actualPort,
    baseUrl: `http://${host}:${actualPort}`,
    close: () => new Promise((resolve, reject) => {
      server.close(() => resolve());
      server.closeAllConnections();
      server.once('error', reject);
    }),
  };
}
