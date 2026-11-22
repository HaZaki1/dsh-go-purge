// dsh-go 引擎侧的提示词接管。
// 只做三件事：挂一个系统提示词段、在 assemble 上做幂等改写、保留官方工具与审批。
// 不碰 asar / shim / 权限预设 / hooks-deny —— 那些是桌面专属，手机上会破坏 App 自己的确认流程。
const ORDER = -100000;
export const PERSONA_SECTION = 'dshgo-purge:persona';
const CAP_SECTION = 'dshgo-capabilities';
const GUARD = Symbol.for('dsh-go-purge.assembleGuard');
const ALLOWED_VARS = new Set(['cwd', 'model', 'provider']);

export function escapeInterpolation(text) {
  const src = String(text || '');
  if (!src.includes('{{')) return src;
  return src.replace(/\{\{([^{}]*)\}\}|(\{\{)/g, (all, name, open) => {
    if (name !== undefined && ALLOWED_VARS.has(name)) return all;
    if (open) return '{ {';
    return `{ {${name}}}`;
  });
}

export function normalizeEnvelope(text) {
  let out = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!out) return out;
  out = out.replace(/<\|im_start\|>\s*system\s*:\s*<project_instructions>/gi, '<|im_start|>system:\n<project_instructions>');
  out = out.replace(/<\|im_start\|>\s*system\s*:(?!\s*\n)/gi, '<|im_start|>system:\n');
  if (/<project_instructions>/i.test(out) && !/<\/project_instructions>/i.test(out)) {
    out = `${out.replace(/\s+$/, '')}\n</project_instructions>`;
  }
  return out.replace(/[ \t]+$/gm, '').replace(/^\s+/, '').replace(/\s+$/, '');
}

/** 只剥官方身份行，不动工具说明、审批规则和其余系统段。 */
export function stripHostIdentity(text, enabled) {
  if (!enabled || typeof text !== 'string') return text;
  const lines = [];
  for (const line of String(text).split('\n')) {
    const s = line.trim();
    if (/^identity lock/i.test(s)) continue;
    if (/^(?:you are|你是|i am|我是)\s+(?:claude|gpt|chatgpt|gemini|deepseek)/i.test(s)) continue;
    lines.push(line.replace(/(?:you are|你是|i am|我是)\s+(?:claude|gpt|chatgpt|gemini|deepseek)[^.!?。！？]*/gi, ''));
  }
  return lines.join('\n');
}

export function capabilityText(opts = {}) {
  if (opts.enabled === false) return '';
  if (opts.child) {
    return '## Capability selection (executor)\nRead the skill catalog and available tools first; use those that match this task, then do only the assigned work.';
  }
  return [
    '## Capability selection by task (mandatory)',
    '',
    '1. Read the available skills catalog / MCP list before acting. Know what exists.',
    '2. Match the task to the catalog; use task-matched skills and tools, not blanket rules.',
    '3. Call matching skills/tools with their real schemas before improvising with shell commands.',
    '4. Only then do it yourself, and say what was missing.',
    '5. Subagents inherit this rule; include it in their briefs.',
  ].join('\n');
}

function isOwnSection(name) {
  const n = String(name || '');
  return n === PERSONA_SECTION || n === CAP_SECTION;
}

/**
 * 幂等改写：把人设段放到最前；按配置剥掉宿主身份行；保留其余段与工具面。
 * 同一 assembled 对象重复进入不会再插第二份。
 */
export function rewriteAssembly(assembled, { text = '', mode = 'replace', stripIdentity = true, capability = true } = {}) {
  if (!assembled || !Array.isArray(assembled.sections)) return assembled;
  const inject = normalizeEnvelope(escapeInterpolation(text));
  const original = assembled.sections;
  const rest = [];
  for (const section of original) {
    if (!section || section.name === 'harness:identity') continue;
    if (isOwnSection(section.name)) continue;
    const next = { ...section };
    if (typeof next.text === 'string' && mode !== 'append') {
      next.text = stripHostIdentity(next.text, stripIdentity);
    }
    rest.push(next);
  }
  const out = [];
  if (inject) {
    out.push({ name: PERSONA_SECTION, order: ORDER, interpolate: false, text: inject });
  }
  if (capability && mode !== 'off') {
    out.push({ name: CAP_SECTION, order: ORDER + 1, interpolate: false, text: capabilityText({}) });
  }
  out.push(...rest);
  return {
    ...assembled,
    sections: out,
    contexts: Array.isArray(assembled.contexts) ? assembled.contexts : [],
    tools: Array.isArray(assembled.tools) ? assembled.tools : [],
  };
}

/** 只包装一次。宿主切换 preset 时 setter 会换成新函数，这里一并包住。 */
function installGuard(prompt, rewrite) {
  if (!prompt || typeof rewrite !== 'function') return false;
  let slot = null;
  try { slot = prompt[GUARD]; } catch { /* ignore */ }
  if (slot) { slot.rewrite = rewrite; return true; }

  let current = null;
  try { current = prompt.assemble; } catch { return false; }
  if (typeof current !== 'function') return false;
  if (current._dshGoPurgeWrapped && current._dshGoPurgeSlot) {
    current._dshGoPurgeSlot.rewrite = rewrite;
    return true;
  }
  slot = { rewrite };
  const wrap = (fn) => {
    if (typeof fn !== 'function') return fn;
    if (fn._dshGoPurgeWrapped) {
      if (fn._dshGoPurgeSlot) fn._dshGoPurgeSlot.rewrite = slot.rewrite;
      return fn;
    }
    const orig = typeof fn.bind === 'function' ? fn.bind(prompt) : fn;
    const wrapped = async function assembleWithPurge(...args) {
      let assembled;
      try {
        assembled = await orig(...args);
      } catch (err) {
        try { console.warn('[dsh-go-purge] assemble failed:', err?.message || err); } catch { /* ignore */ }
        return { sections: [], contexts: [], tools: [] };
      }
      try { return slot.rewrite(assembled, args[0]) || assembled; } catch (err) {
        try { console.warn('[dsh-go-purge] rewrite failed:', err?.message || err); } catch { /* ignore */ }
        return assembled;
      }
    };
    wrapped._dshGoPurgeWrapped = true;
    wrapped._dshGoPurgeSlot = slot;
    return wrapped;
  };
  try {
    let inner = wrap(current);
    Object.defineProperty(prompt, GUARD, { value: slot, configurable: true, writable: true });
    Object.defineProperty(prompt, 'assemble', {
      configurable: true,
      enumerable: true,
      get: () => inner,
      set: (next) => { inner = wrap(next); },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {object} ctx
 * @param {object} config
 * @param {() => Promise<string>} loadText 异步读取当前人设正文
 * @param {() => object} snapshot 同步取当前快照（mode/strip/capability）
 */
export function installPrompt(ctx, config, loadText, snapshot) {
  let cached = '';
  const refresh = async () => {
    try { cached = await loadText(); } catch { cached = ''; }
    return cached;
  };
  const rewrite = (assembled, context) => {
    const cfg = snapshot();
    if (!cfg.enabled || cfg.mode === 'off') return assembled;
    return rewriteAssembly(assembled, { ...cfg, text: cached, context });
  };

  // 段本身让官方 assemble 也能看到人设；interpolate:false 避免 {{ }} 被当模板变量。
  try {
    const prompt = ctx?.systemPrompt;
    if (prompt && typeof prompt.section === 'function') {
      prompt.section({
        name: PERSONA_SECTION,
        order: ORDER,
        interpolate: false,
        text: () => (snapshot().enabled && snapshot().mode !== 'off' ? cached : ''),
      });
    }
  } catch { /* 宿主尚未注入服务 */ }

  installGuard(ctx?.systemPrompt, rewrite);
  const rewrap = () => {
    try { installGuard(ctx?.systemPrompt, rewrite); } catch { /* ignore */ }
  };

  if (typeof ctx?.on === 'function') {
    try {
      ctx.on('system-prompt/assemble', async (...args) => {
        const [assembly] = args;
        const next = args.length >= 3 ? args[args.length - 1] : null;
        let assembled = assembly;
        if (typeof next === 'function') {
          try { assembled = await next(); } catch { assembled = assembly; }
        }
        await refresh();
        try { return rewrite(assembled, args[1]); } catch { return assembled; }
      }, { global: true, prepend: true });
    } catch { /* 老宿主签名 */ }
    try {
      ctx.on('agent/pre-step', async (payload, next) => {
        await refresh();
        rewrap();
        return typeof next === 'function' ? next() : payload;
      }, { global: true, prepend: true });
    } catch { /* ignore */ }
    try { ctx.on('session/created', () => { refresh().then(rewrap).catch(() => {}); }); } catch { /* ignore */ }
    try {
      ctx.on('agent-preset/selected', () => { refresh().then(rewrap).catch(() => {}); }, { global: true });
    } catch { /* ignore */ }
  }

  const timer = setInterval(() => { refresh().then(rewrap).catch(() => {}); }, 1000);
  if (typeof timer.unref === 'function') timer.unref();
  try { ctx?.effect?.(() => () => clearInterval(timer)); } catch { /* ignore */ }
  refresh().then(rewrap).catch(() => {});
  return { refresh, rewrite };
}
