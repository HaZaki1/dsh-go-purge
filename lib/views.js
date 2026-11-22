// dsh-go 原生视图：只用官方组件目录里的稳定组件，全部是纯 JSON。
export function toolCard(build) {
  return (args, value) => {
    try {
      const view = build(args, value);
      if (!view) return {};
      const json = JSON.stringify(view);
      if (!json || Buffer.byteLength(json, 'utf8') > 8 * 1024) return {};
      return { 'dsh-go/view': JSON.parse(json) };
    } catch {
      return {};
    }
  };
}

export function statusView(st) {
  return {
    type: 'stack',
    title: '破甲 · 状态',
    children: [
      { type: 'text', text: '手机上只接管提示词与规则；不 patch 宿主、不写 shim、不碰审批。' },
      { type: 'row', children: [
        { type: 'metric', label: '生效人设', value: String(st.effective || st.active || '-') },
        { type: 'metric', label: '模式', value: String(st.mode || '-') },
      ] },
      { type: 'keyValue', items: [
        ['开关', st.enabled ? '已开启' : '已关闭'],
        ['当前模型', st.model ? String(st.model) : '未识别（用全局人设）'],
        ['人设数量', String(st.personas?.length || 0)],
        ['状态目录', String(st.stateDir || '')],
      ] },
      { type: 'text', text: '点下面的人设即可切换；新会话生效。' },
      { type: 'list', items: (st.personas || []).slice(0, 12).map((p) => ({
        title: String(p.name || p.id),
        subtitle: String(p.id),
        trailing: p.id === st.effective ? '生效' : '',
        action: { id: 'usePersona', args: { id: String(p.id) } },
      })) },
      { type: 'actions', items: [
        { label: '切换模式', action: 'cycleMode' },
        { label: '刷新', action: 'refresh' },
        { label: '复制规则', action: 'copyRules' },
      ] },
      { type: 'callout', tone: 'info', text: '人设正文随请求发送给模型；请勿放入密钥或隐私数据。' },
    ],
  };
}

export function personaEditorView(data) {
  const ids = Array.isArray(data?.ids) ? data.ids : [];
  return {
    v: 2,
    accent: 'app',
    type: 'form',
    submit: 'savePersona',
    submitLabel: '保存人设',
    children: [
      { type: 'callout', tone: 'info', text: '手机表单上限 2000 字；原始 21K 默认人设请直接用，不必重录。' },
      { type: 'select', label: '目标人设', bind: 'data.form.id', options: ids.length ? ids : [{ label: 'custom', value: 'custom' }] },
      { type: 'textField', label: '名称', bind: 'data.form.name', maxLength: 80 },
      { type: 'textField', label: '正文', bind: 'data.form.text', multiline: true, maxLines: 8, maxLength: 2000 },
    ],
  };
}

export function resultView(title, lines) {
  return {
    type: 'stack',
    title: String(title),
    children: [
      { type: 'text', text: (Array.isArray(lines) ? lines : [String(lines || '')]).join('\n').slice(0, 1800) },
    ],
  };
}
