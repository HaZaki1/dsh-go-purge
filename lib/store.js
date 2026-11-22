// dsh-go-purge 的本地状态层。
// 手机上没有桌面安装目录、没有 shim、没有 Windows 注册表；全部状态只落在
// $DSH_HOME/dsh-go-purge/，与桌面 dsh-purge 的 $DSH_HOME/rules 分开，互不踩踏。
import fs, { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const MAX_PERSONA_BYTES = 512 * 1024;
const DEFAULT_ID = 'little-code-sauce';

export function findDshHome() {
  const candidates = [
    process.env.DSH_HOME,
    process.env.DSH_GO_HOME,
    path.join(os.homedir() || '', '.dsh'),
    '/root/.dsh',
  ].filter((p) => typeof p === 'string' && p.trim());
  for (const p of candidates) {
    try {
      if (fs.existsSync(path.join(p, 'dsh-go-purge')) || fs.existsSync(path.join(p, 'rules'))) return p;
    } catch { /* ignore */ }
  }
  return candidates[0] || path.join(os.homedir() || '.', '.dsh');
}

export function stateDir(home = findDshHome()) {
  return path.join(home, 'dsh-go-purge');
}
export function personasDir(home = findDshHome()) {
  return path.join(stateDir(home), 'personas');
}
export function stateFile(home = findDshHome()) {
  return path.join(stateDir(home), 'state.json');
}
export function indexFile(home = findDshHome()) {
  return path.join(personasDir(home), '_index.json');
}
export function personaFile(home, id) {
  return path.join(personasDir(home), `${id}.md`);
}
export function bundledDefaultText() {
  try {
    return fs.readFileSync(new URL('../assets/default-prompt.md', import.meta.url), 'utf8').trim();
  } catch {
    return '';
  }
}
export function validId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}
export function normalizeText(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').trim();
}

async function atomicWrite(file, content) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(tmp, content, 'utf8');
  await fsp.rename(tmp, file);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function readState(home = findDshHome()) {
  const raw = await readJson(stateFile(home), {});
  return {
    active: validId(raw?.active) ? raw.active : DEFAULT_ID,
    enabled: raw?.enabled !== false,
    mode: ['replace', 'strict', 'append', 'off'].includes(raw?.mode) ? raw.mode : 'replace',
    byModel: raw?.byModel && typeof raw.byModel === 'object' ? raw.byModel : {},
  };
}

export async function writeState(home, state) {
  const prev = await readState(home);
  const next = { ...prev, ...state };
  if (next.active !== undefined && !validId(next.active)) throw new Error('invalid persona id');
  await atomicWrite(stateFile(home), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export async function readIndex(home = findDshHome()) {
  const raw = await readJson(indexFile(home), {});
  return raw && typeof raw === 'object' ? raw : {};
}

export async function writeIndex(home, index) {
  await atomicWrite(indexFile(home), `${JSON.stringify(index, null, 2)}\n`);
}

/** 首次启动：把随包附带的原始人设种子写入 $DSH_HOME，不覆盖用户改动。 */
export async function ensureInitial(home = findDshHome()) {
  await fsp.mkdir(personasDir(home), { recursive: true });
  const index = await readIndex(home);
  const file = personaFile(home, DEFAULT_ID);
  let seeded = false;
  if (!fs.existsSync(file)) {
    const text = bundledDefaultText();
    if (text) {
      await fsp.writeFile(file, `${text}\n`, 'utf8');
      seeded = true;
    }
  }
  if (!index[DEFAULT_ID]) {
    index[DEFAULT_ID] = {
      id: DEFAULT_ID,
      name: '小码酱（原始 dsh-purge 默认）',
      description: '来自 YuJunZhiXue/dsh-purge v1.1.71 的默认提示词',
      updatedAt: new Date().toISOString(),
    };
    await writeIndex(home, index);
  }
  const state = await readState(home);
  if (!fs.existsSync(personaFile(home, state.active))) {
    await writeState(home, { active: DEFAULT_ID });
  }
  return { home, seeded, active: (await readState(home)).active };
}

export async function listPersonas(home = findDshHome()) {
  const index = await readIndex(home);
  const out = [];
  for (const [id, meta] of Object.entries(index)) {
    if (!validId(id)) continue;
    let size = 0;
    try { size = (await fsp.stat(personaFile(home, id))).size; } catch { /* missing */ }
    out.push({
      id,
      name: typeof meta?.name === 'string' ? meta.name : id,
      description: typeof meta?.description === 'string' ? meta.description : '',
      size,
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export async function readPersona(home, id) {
  if (!validId(id)) throw new Error('invalid persona id');
  try {
    return normalizeText(await fsp.readFile(personaFile(home, id), 'utf8'));
  } catch {
    return null;
  }
}

export async function savePersona(home, id, content, meta = {}) {
  if (!validId(id)) throw new Error('invalid persona id');
  const text = normalizeText(content);
  if (Buffer.byteLength(text, 'utf8') > MAX_PERSONA_BYTES) throw new Error('persona too large (512KB)');
  await atomicWrite(personaFile(home, id), `${text}\n`);
  const index = await readIndex(home);
  index[id] = {
    id,
    name: typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim().slice(0, 80) : id,
    description: typeof meta.description === 'string' ? meta.description.slice(0, 240) : '',
    updatedAt: new Date().toISOString(),
  };
  await writeIndex(home, index);
  return index[id];
}

export async function deletePersona(home, id) {
  if (!validId(id)) throw new Error('invalid persona id');
  await fsp.unlink(personaFile(home, id)).catch((e) => { if (e.code !== 'ENOENT') throw e; });
  const index = await readIndex(home);
  delete index[id];
  await writeIndex(home, index);
  const state = await readState(home);
  if (state.active === id) await writeState(home, { active: DEFAULT_ID });
}

export async function setActive(home, id) {
  if (!validId(id)) throw new Error('invalid persona id');
  if (!(await readPersona(home, id))) throw new Error(`persona not found: ${id}`);
  return writeState(home, { active: id });
}

function modelName(context) {
  const tries = [
    () => context?.agent?.session?.header?.model,
    () => context?.agent?.session?.header?.modelId,
    () => context?.model,
    () => context?.llm?.model,
    () => context?.provider?.model,
  ];
  for (const get of tries) {
    try {
      const v = get();
      if (typeof v === 'string' && v.trim()) return v.trim();
    } catch { /* proxy */ }
  }
  return '';
}

/** 当前生效的人设正文：byModel 命中优先，否则用全局 active。 */
export async function activeText(home = findDshHome(), context = null, config = {}) {
  if (config?.enabled === false) return '';
  if (typeof config?.personaText === 'string' && normalizeText(config.personaText)) {
    return normalizeText(config.personaText);
  }
  const state = await readState(home);
  let id = state.active;
  const model = modelName(context);
  if (model && typeof state.byModel[model] === 'string' && validId(state.byModel[model])) {
    id = state.byModel[model];
  }
  const text = await readPersona(home, id);
  return text || bundledDefaultText();
}

export async function status(home = findDshHome(), context = null) {
  const state = await readState(home);
  const model = modelName(context);
  const effective = model && state.byModel[model] ? state.byModel[model] : state.active;
  return {
    home,
    stateDir: stateDir(home),
    active: state.active,
    effective,
    model,
    mode: state.mode,
    enabled: state.enabled,
    personas: await listPersonas(home),
  };
}
