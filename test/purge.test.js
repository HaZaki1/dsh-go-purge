import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as store from '../lib/store.js';
import { rewriteAssembly, escapeInterpolation, stripHostIdentity } from '../lib/prompt.js';
import { toolCard, statusView } from '../lib/views.js';

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-go-purge-test-'));
}

test('首次启动在 $DSH_HOME 下种下人设，不覆盖用户改动', async () => {
  const home = tempHome();
  const first = await store.ensureInitial(home);
  assert.equal(first.seeded, true);
  const id = first.active;
  const original = await store.readPersona(home, id);
  assert.ok(original.length > 1000);
  await store.savePersona(home, 'custom', '用简体中文协作。', { name: '简洁' });
  await store.ensureInitial(home);
  assert.equal(await store.readPersona(home, 'custom'), '用简体中文协作。');
  assert.equal(store.findDshHome().length > 0, true);
});

test('byModel 覆盖全局 active，且只接受已存在的人设', async () => {
  const home = tempHome();
  await store.ensureInitial(home);
  await store.savePersona(home, 'model-a', 'A 人设');
  await store.writeState(home, { active: 'little-code-sauce', byModel: { 'deepseek-chat': 'model-a' } });
  assert.equal(await store.activeText(home, { agent: { session: { header: { model: 'deepseek-chat' } } } }), 'A 人设');
  assert.ok((await store.activeText(home, { agent: { session: { header: { model: 'other' } } } })).includes('Little Code Sauce'));
  await assert.rejects(() => store.setActive(home, 'missing'));
});

test('assemble 改写幂等：人设置顶、剥宿主身份、保留工具面', () => {
  const assembled = {
    sections: [
      { name: 'harness:identity', text: 'You are Claude, made by Anthropic.' },
      { name: 'tools', text: 'You have tools. You are GPT-4.' },
    ],
    contexts: ['c'],
    tools: ['t'],
  };
  const once = rewriteAssembly(assembled, { text: 'Little Code Sauce', mode: 'replace', stripIdentity: true, capability: false });
  assert.equal(once.sections[0].name, 'dshgo-purge:persona');
  assert.equal(once.sections.filter((s) => s.name === 'dshgo-purge:persona').length, 1);
  assert.ok(!once.sections.some((s) => s.name === 'harness:identity'));
  assert.ok(!once.sections.some((s) => /You are Claude|You are GPT-4/.test(s.text || '')));
  assert.deepEqual(once.tools, ['t']);
  const twice = rewriteAssembly(once, { text: 'Little Code Sauce', mode: 'replace', stripIdentity: true, capability: false });
  assert.deepEqual(twice, once);
  assert.deepEqual(assembled.sections.length, 2, '原对象不被污染');
});

test('模板变量与非模板 {{ }} 的处理', () => {
  assert.equal(escapeInterpolation('{{model}} ok'), '{{model}} ok');
  assert.equal(escapeInterpolation('{{secret}}'), '{ {secret}}');
  assert.equal(stripHostIdentity('Keep this\n我是 DeepSeek 的 AI 助手\nAlso keep', true), 'Keep this\nAlso keep');
});

test('工具卡超限或异常时退回空 meta，不炸工具结果', () => {
  assert.deepEqual(toolCard(() => { throw new Error('x'); })({}, {}), {});
  assert.deepEqual(toolCard(() => ({ text: 'x'.repeat(9000) }))({}, {}), {});
  const ok = toolCard((_a, v) => statusView({ effective: v.id, mode: 'replace', personas: [], stateDir: '/tmp' }))({}, { id: 'a' });
  assert.ok(ok['dsh-go/view']);
});

test('apply 在假宿主上注册命令、工具与原生插槽，不执行桌面操作', async () => {
  const { apply } = await import('../lib/index.js');
  const registered = { commands: [], tools: [], slots: {} };
  const ctx = {
    get: (name) => (name === 'commands' ? { register: (c) => registered.commands.push(c) } : null),
    tools: { register: (t) => registered.tools.push(t) },
    systemPrompt: { section: () => {}, assemble: async (a) => a },
    on: () => {},
    effect: (fn) => { registered.dispose = fn(); },
    inject: (names, cb) => {
      if (names.includes('dshGo')) {
        cb({ dshGo: {
          on: (id) => { registered.slots[id] = true; },
          strip: (id) => { registered.slots[id] = true; },
          panel: (id) => { registered.slots[id] = true; },
        } });
      }
    },
  };
  await apply(ctx, {});
  assert.equal(registered.commands.length, 1);
  assert.deepEqual(registered.tools.map((t) => t.name), ['purge_status', 'purge_use']);
  assert.ok(registered.slots['purge.main']);
  assert.ok(registered.slots['purge.persona']);
  assert.ok(registered.slots['purge.strip']);
  registered.dispose?.();
});
