import z from '@deepseek-ai/schemastery';
import * as store from './store.js';
import { installPrompt } from './prompt.js';
import { personaEditorView, resultView, statusView, toolCard } from './views.js';

export const name = 'dsh-go-purge';
// 不要把 dshGo 放进顶层 inject：桥接缺失时整个插件会 pending。
export const inject = ['systemPrompt', 'tools'];

const editable = (schema) => schema.volatile();
export const Config = z.object({
  enabled: editable(z.boolean().default(true)).description({ zh: '启用提示词接管', en: 'Enable prompt takeover' }),
  mode: z.string().default('replace').description({ zh: '注入模式：replace / strict / append / off', en: 'Injection mode' }),
  stripHostIdentity: editable(z.boolean().default(true)).description({ zh: '剥掉官方身份行', en: 'Strip host identity lines' }),
  capabilityProtocol: editable(z.boolean().default(true)).description({ zh: '追加能力选用协议', en: 'Append capability protocol' }),
  personaText: z.string().default('').description({ zh: '直接指定人设正文（留空用文件）', en: 'Inline persona text' }),
}).loose();

const DEFAULTS = {
  enabled: true,
  mode: 'replace',
  stripHostIdentity: true,
  capabilityProtocol: true,
  personaText: '',
};

let refreshPrompt = async () => {};
let lastContext = null;

function configOf(config) {
  return { ...DEFAULTS, ...(config || {}) };
}

function sendText(value, ok = true) {
  return { kind: ok ? 'success' : 'error', text: String(value || '') };
}

async function statusText(home, context, cfg) {
  const st = await store.status(home, context);
  const text = await store.activeText(home, context, cfg);
  return [
    'dsh-go-purge 状态 / Status',
    `手机适配版 · 引擎内注入，不 patch 宿主`,
    `状态目录: ${st.stateDir}`,
    `生效人设: ${st.effective}${st.model ? ` (模型 ${st.model})` : ''}`,
    `模式: ${st.mode} · 开关: ${st.enabled ? '开' : '关'}`,
    `人设: ${st.personas.map((p) => `${p.id}${p.id === st.effective ? '*' : ''}`).join(', ') || '(空)'}`,
    `正文长度: ${text.length} 字`,
  ].join('\n');
}

export async function apply(ctx, config) {
  const cfg = configOf(config);
  const home = store.findDshHome();
  await store.ensureInitial(home);

  const snapshot = () => ({
    enabled: cfg.enabled !== false,
    mode: cfg.mode,
    stripIdentity: cfg.stripHostIdentity !== false,
    capability: cfg.capabilityProtocol !== false,
  });
  const controller = installPrompt(
    ctx,
    cfg,
    async () => store.activeText(home, lastContext, cfg),
    snapshot,
  );
  refreshPrompt = controller.refresh;

  let cache = { status: await store.status(home, lastContext), ids: [] };
  const refreshCache = async () => {
    try {
      const st = await store.status(home, lastContext);
      cache = { status: st, ids: st.personas.map((p) => p.id) };
    } catch { /* keep last good snapshot */ }
    return cache;
  };
  await refreshCache();
  const cacheTimer = setInterval(() => { refreshCache().catch(() => {}); }, 5000);
  if (typeof cacheTimer.unref === 'function') cacheTimer.unref();
  ctx?.effect?.(() => () => clearInterval(cacheTimer));

  if (typeof ctx?.on === 'function') {
    try { ctx.on('agent/pre-step', (payload) => { lastContext = payload || null; }); } catch { /* ignore */ }
  }

  const commands = ctx.get?.('commands') || null;
  if (commands?.register) {
    commands.register({
      name: 'purge',
      description: '破甲手机适配：status | use <id> | list | mode <replace|append|off> | reset | help',
      input: { hint: 'status | use <id> | list | mode <mode> | help' },
      handler: async (invocation) => {
        const args = String(invocation?.rawInput || '').trim().split(/\s+/).filter(Boolean);
        const sub = (args[0] || 'status').toLowerCase();
        if (sub === 'status' || sub === 's') return sendText(await statusText(home, lastContext, cfg));
        if (sub === 'list' || sub === 'ls') {
          const st = await store.status(home, lastContext);
          return sendText(st.personas.map((p) => `${p.id === st.effective ? '▶' : '·'} ${p.id} — ${p.name}`).join('\n') || '(暂无)');
        }
        if (sub === 'use' || sub === 'u') {
          const id = args[1];
          if (!id) return sendText('用法: /purge use <人设 id>', false);
          try {
            await store.setActive(home, id);
            await refreshPrompt();
            await refreshCache();
            return sendText(`✓ 已切换到 ${id}；新会话生效。`);
          } catch (e) { return sendText(`切换失败: ${e.message}`, false); }
        }
        if (sub === 'mode' || sub === 'm') {
          const mode = args[1];
          if (!['replace', 'strict', 'append', 'off'].includes(mode)) {
            return sendText('用法: /purge mode replace|strict|append|off', false);
          }
          await store.writeState(home, { mode });
          await refreshPrompt();
          await refreshCache();
          return sendText(`✓ 模式已设为 ${mode}。`);
        }
        if (sub === 'reset') {
          await store.writeState(home, { active: 'little-code-sauce', mode: 'replace', byModel: {} });
          await refreshPrompt();
          await refreshCache();
          return sendText('✓ 已恢复默认人设与 replace 模式。');
        }
        return sendText(
          '用法：\n/purge status  状态\n/purge list    人设列表\n/purge use <id> 切换\n/purge mode <replace|strict|append|off>\n/purge reset    恢复默认',
        );
      },
    });
  }

  if (ctx?.tools?.register) {
    const output = {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } } },
      render: (_args, value) => [{ type: 'text', text: String(value?.text || '') }],
    };
    ctx.tools.register({
      name: 'purge_status',
      description: '查看 dsh-go-purge 状态：人设、模式、目录与正文长度。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: {
        ...output,
        presentationMeta: toolCard((_args, value) => statusView(cache.status)),
      },
      execute: async () => ({ text: await statusText(home, lastContext, cfg) }),
    });
    ctx.tools.register({
      name: 'purge_use',
      description: '切换当前生效的人设（新会话生效）。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'string', description: '人设 id' } },
        required: ['id'],
      },
      output: {
        ...output,
        presentationMeta: toolCard((args, value) => resultView('切换人设', [`${args.id} → ${value.text}`])),
      },
      execute: async (args) => {
        try {
          await store.setActive(home, args.id);
          await refreshPrompt();
          await refreshCache();
          return { text: `已切换到 ${args.id}` };
        } catch (e) { return { text: `失败: ${e.message}` }; }
      },
    });
  }

  // 原生界面：只有装了 dsh-go 桥接的主机才会进入这里。
  ctx.inject(['dshGo'], (host) => {
    const dsh = host.dshGo;
    if (!dsh) return;

    dsh.on('purge.status', () => ({ open: 'panel:purge.main', toast: '破甲状态' }));
    dsh.on('purge.setpersona', () => ({ open: 'panel:purge.persona' }));
    dsh.on('purge.copy', async () => {
      const text = await store.activeText(home, lastContext, cfg);
      return { copy: text.slice(0, 8000), toast: '已复制当前人设' };
    });

    dsh.strip('purge.strip', (_scope, emit) => {
      const push = () => {
        const label = String(cache.status?.effective || '-').slice(0, 18);
        emit({ text: `人设 ${label}` });
      };
      push();
      const timer = setInterval(push, 5000);
      if (typeof timer.unref === 'function') timer.unref();
      return () => clearInterval(timer);
    });

    dsh.panel('purge.main', {
      view: () => statusView(cache.status),
      data: (_scope, emit) => { emit({ ids: cache.ids, active: cache.status.active }); return () => {}; },
      actions: {
        usePersona: async (_scope, event) => {
          const id = String(event?.value?.id || '');
          try {
            await store.setActive(home, id);
            await refreshPrompt();
            await refreshCache();
            return { patch: { active: id }, toast: `已切换到 ${id}` };
          } catch (e) { return { toast: String(e.message || e).slice(0, 40) }; }
        },
        cycleMode: async () => {
          const modes = ['replace', 'append', 'off'];
          const next = modes[(modes.indexOf(cache.status.mode) + 1) % modes.length];
          await store.writeState(home, { mode: next });
          await refreshPrompt();
          await refreshCache();
          return { refresh: 'purge.main', toast: `模式 ${next}` };
        },
        refresh: async () => { await refreshCache(); return { refresh: 'purge.main' }; },
        copyRules: async () => {
          const text = await store.activeText(home, lastContext, cfg);
          return { copy: text.slice(0, 8000), toast: '已复制当前人设' };
        },
      },
    });

    dsh.panel('purge.persona', {
      view: () => personaEditorView({ ids: cache.ids }),
      data: (_scope, emit) => {
        emit({ form: { id: cache.status.active, name: '', text: '' }, ids: cache.ids });
        return () => {};
      },
      actions: {
        savePersona: async (_scope, event) => {
          const values = event?.value?.values || {};
          const id = String(values['data.form.id'] || '').trim();
          const name = String(values['data.form.name'] || '').trim();
          const text = String(values['data.form.text'] || '');
          if (!store.validId(id)) return { toast: 'id 不合规' };
          if (!text.trim()) return { toast: '正文不能为空' };
          try {
            await store.savePersona(home, id, text, { name: name || id });
            await store.setActive(home, id);
            await refreshPrompt();
            await refreshCache();
            return { patch: { form: { id, name: name || id, text } }, toast: '已保存并切换' };
          } catch (e) { return { toast: String(e.message || e).slice(0, 40) }; }
        },
      },
    });
  });
}

export default { name, inject, Config, apply };
