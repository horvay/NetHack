(function initStatusHud(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetHackStatusHud = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const STATUS_FIELDS = Object.freeze([
    ['BL_TITLE', 0, 'Title'],
    ['BL_STR', 1, 'Str'], ['BL_DX', 2, 'Dex'], ['BL_CO', 3, 'Con'], ['BL_IN', 4, 'Int'], ['BL_WI', 5, 'Wis'], ['BL_CH', 6, 'Cha'],
    ['BL_ALIGN', 7, 'Align'], ['BL_SCORE', 8, 'Score'], ['BL_CAP', 9, 'Carry'], ['BL_GOLD', 10, 'Gold'],
    ['BL_ENE', 11, 'Power'], ['BL_ENEMAX', 12, 'Power max'], ['BL_XP', 13, 'XP'], ['BL_AC', 14, 'AC'], ['BL_HD', 15, 'HD'],
    ['BL_TIME', 16, 'Time'], ['BL_HUNGER', 17, 'Hunger'], ['BL_HP', 18, 'HP'], ['BL_HPMAX', 19, 'HP max'],
    ['BL_LEVELDESC', 20, 'Dungeon'], ['BL_EXP', 21, 'Exp'], ['BL_CONDITION', 22, 'Conditions'], ['BL_WEAPON', 23, 'Weapon'],
    ['BL_ARMOR', 24, 'Armor'], ['BL_TERRAIN', 25, 'Terrain'], ['BL_VERS', 26, 'Version'],
  ].map(([id, field, label]) => Object.freeze({ id, field, label })));
  const STATUS_FIELD_BY_INDEX = Object.freeze(Object.fromEntries(STATUS_FIELDS.map((field) => [field.field, field])));

  // Keep this table synchronized with include/botl.h enum blconditions and BL_MASK_* definitions.
  const CONDITION_BITS = Object.freeze([
    ['BL_MASK_BAREH', 0x00000001, 'Bare hands', 'combat', 'info', 'Deprecated: BL_WEAPON is the primary structured equipment source.'],
    ['BL_MASK_BLIND', 0x00000002, 'Blind', 'senses', 'warning'],
    ['BL_MASK_BUSY', 0x00000004, 'Busy', 'activity', 'warning'],
    ['BL_MASK_CONF', 0x00000008, 'Confused', 'mind', 'warning'],
    ['BL_MASK_DEAF', 0x00000010, 'Deaf', 'senses', 'info'],
    ['BL_MASK_ELF_IRON', 0x00000020, 'Iron', 'body', 'warning'],
    ['BL_MASK_FLY', 0x00000040, 'Flying', 'movement', 'info'],
    ['BL_MASK_FOODPOIS', 0x00000080, 'Food poison', 'fatal', 'danger'],
    ['BL_MASK_GLOWHANDS', 0x00000100, 'Glowing hands', 'body', 'warning'],
    ['BL_MASK_GRAB', 0x00000200, 'Grabbed', 'restraint', 'danger'],
    ['BL_MASK_HALLU', 0x00000400, 'Hallucinating', 'mind', 'warning'],
    ['BL_MASK_HELD', 0x00000800, 'Held', 'restraint', 'warning'],
    ['BL_MASK_ICY', 0x00001000, 'Icy', 'terrain', 'warning', 'BL_TERRAIN is the primary structured terrain source when present.'],
    ['BL_MASK_INLAVA', 0x00002000, 'In lava', 'fatal', 'danger'],
    ['BL_MASK_LEV', 0x00004000, 'Levitating', 'movement', 'info'],
    ['BL_MASK_PARLYZ', 0x00008000, 'Paralyzed', 'activity', 'danger'],
    ['BL_MASK_RIDE', 0x00010000, 'Riding', 'movement', 'info'],
    ['BL_MASK_SLEEPING', 0x00020000, 'Asleep', 'activity', 'danger'],
    ['BL_MASK_SLIME', 0x00040000, 'Slimed', 'fatal', 'danger'],
    ['BL_MASK_SLIPPERY', 0x00080000, 'Slippery', 'body', 'warning'],
    ['BL_MASK_STONE', 0x00100000, 'Stoning', 'fatal', 'danger'],
    ['BL_MASK_STRNGL', 0x00200000, 'Strangled', 'fatal', 'danger'],
    ['BL_MASK_STUN', 0x00400000, 'Stunned', 'mind', 'warning'],
    ['BL_MASK_SUBMERGED', 0x00800000, 'Submerged', 'terrain', 'danger', 'BL_TERRAIN is the primary structured terrain source when present.'],
    ['BL_MASK_TERMILL', 0x01000000, 'Ill', 'fatal', 'danger'],
    ['BL_MASK_TETHERED', 0x02000000, 'Tethered', 'restraint', 'warning'],
    ['BL_MASK_TRAPPED', 0x04000000, 'Trapped', 'restraint', 'warning'],
    ['BL_MASK_UNCONSC', 0x08000000, 'Unconscious', 'activity', 'danger'],
    ['BL_MASK_WOUNDEDL', 0x10000000, 'Wounded legs', 'movement', 'warning'],
    ['BL_MASK_HOLDING', 0x20000000, 'Holding', 'restraint', 'info'],
  ].map(([id, mask, label, group, severity, note]) => Object.freeze({ id, mask, label, group, severity, note: note || '' })));
  const CONDITION_MASK_LIMIT = 0x3fffffff;
  const CONDITION_GROUP_LABELS = Object.freeze({ fatal: 'Danger', mind: 'Mind', senses: 'Senses', movement: 'Move', restraint: 'Held', activity: 'Action', terrain: 'Terrain', body: 'Body', combat: 'Combat' });
  const CONDITION_GROUP_ORDER = Object.freeze(['fatal', 'activity', 'restraint', 'mind', 'senses', 'movement', 'terrain', 'body', 'combat']);
  const SEVERITY_RANK = Object.freeze({ info: 0, healthy: 0, warning: 1, danger: 2 });

  const ATTRIBUTE_FIELDS = Object.freeze([1, 2, 3, 4, 5, 6]);
  const REPRESENTED_STATUS_FIELDS = Object.freeze([0, 7, 8, 1, 2, 3, 4, 5, 6, 18, 19, 11, 12, 14, 13, 21, 15, 20, 10, 16, 17, 9, 25, 22, 23, 24, 26]);

  function cleanStatusValue(field, value) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (field === 10 && typeof value === 'string') return text.replace(/^\\G[0-9A-Fa-f]+:/, '').trim() || '0';
    if (field === 20) return text.replace(/^Dlvl:\s*/i, '').trim();
    if (field === 22 && /^mask\s+0$/.test(text)) return '';
    if (field === 22 && /^0+$/.test(text)) return '';
    return text;
  }

  function parseConditionMask(raw) {
    if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 && raw <= CONDITION_MASK_LIMIT ? raw : 0;
    const text = String(raw ?? '').trim();
    const match = /^mask\s+(\d+)$/i.exec(text) || /^(\d+)$/.exec(text);
    if (!match) return 0;
    const mask = Number(match[1]);
    return Number.isSafeInteger(mask) && mask >= 0 && mask <= CONDITION_MASK_LIMIT ? mask : 0;
  }

  function conditionLabels(mask) {
    const n = parseConditionMask(mask);
    return CONDITION_BITS.filter((condition) => n & condition.mask).map((condition) => condition.label);
  }

  function decodeConditionMask(mask) {
    const n = parseConditionMask(mask);
    const active = CONDITION_BITS.filter((condition) => n & condition.mask);
    const groups = CONDITION_GROUP_ORDER
      .map((group) => {
        const conditions = active.filter((condition) => condition.group === group);
        if (!conditions.length) return undefined;
        const severity = conditions.reduce((worst, condition) => (SEVERITY_RANK[condition.severity] > SEVERITY_RANK[worst] ? condition.severity : worst), 'info');
        return Object.freeze({ group, label: CONDITION_GROUP_LABELS[group] || group, severity, conditions: Object.freeze(conditions) });
      })
      .filter(Boolean);
    return Object.freeze({ mask: n, active: Object.freeze(active), groups: Object.freeze(groups), unknownMask: n & ~CONDITION_BITS.reduce((bits, condition) => bits | condition.mask, 0) });
  }

  function hpSeverity(hp, max) {
    const current = Number(hp);
    const limit = Number(max);
    if (!Number.isFinite(current) || !Number.isFinite(limit) || limit <= 0) return '';
    const ratio = current / limit;
    if (ratio <= 0.25) return 'danger';
    if (ratio <= 0.5) return 'warning';
    return 'healthy';
  }

  function hungerSeverity(text) {
    const value = String(text || '').trim().toLowerCase();
    if (!value) return '';
    if (/starv|faint|weak/.test(value)) return 'danger';
    if (/hungry/.test(value)) return 'warning';
    if (/satiated/.test(value)) return 'info';
    return '';
  }

  function carrySeverity(text) {
    const value = String(text || '').trim().toLowerCase();
    if (!value) return '';
    if (/overloaded|overtaxed|strained/.test(value)) return 'danger';
    if (/stressed|burdened/.test(value)) return 'warning';
    return '';
  }

  function terrainChipValue(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return '';
    if (/^(room|corridor|floor|lit corridor|dark corridor)$/i.test(value)) return '';
    return value;
  }

  function statusGetter(values) {
    if (values instanceof Map) return (field) => cleanStatusValue(field, values.get(field));
    return (field) => cleanStatusValue(field, values?.[field]);
  }

  function mergeSeverity(a = '', b = '') {
    if (!a) return b || '';
    if (!b) return a || '';
    return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a;
  }

  function makeItem(label, value, options = {}) {
    const cleaned = typeof value === 'string' ? value : String(value ?? '');
    if (cleaned == null || cleaned === '') return undefined;
    return Object.freeze({ label, value: cleaned, field: options.field, important: Boolean(options.important), severity: options.severity || '', className: options.className || '' });
  }

  function addItem(items, label, value, options) {
    const item = makeItem(label, value, options);
    if (item) items.push(item);
  }

  function makeGroup(id, label, items) {
    return Object.freeze({ id, label, items: Object.freeze(items.filter(Boolean)) });
  }

  function buildStatusGroups(values) {
    const get = statusGetter(values);
    const groups = [];

    const identity = [];
    addItem(identity, 'Name / role', get(0), { field: 0, important: true, className: 'identity-title' });
    addItem(identity, 'Align', get(7), { field: 7 });
    addItem(identity, 'Score', get(8), { field: 8 });
    groups.push(makeGroup('identity', 'Hero', identity));

    const attributes = [];
    for (const field of ATTRIBUTE_FIELDS) addItem(attributes, STATUS_FIELD_BY_INDEX[field].label, get(field), { field, important: true, className: 'attribute' });
    groups.push(makeGroup('attributes', 'Attributes', attributes));

    const vitals = [];
    const hpValue = get(18) || get(19) ? `${get(18) || '?'} / ${get(19) || '?'}` : '';
    const pwValue = get(11) || get(12) ? `${get(11) || '?'} / ${get(12) || '?'}` : '';
    const xl = get(13);
    const exp = get(21);
    addItem(vitals, 'HP', hpValue, { field: 18, important: true, severity: hpSeverity(get(18), get(19)) });
    addItem(vitals, 'Pw', pwValue, { field: 11 });
    addItem(vitals, 'AC', get(14), { field: 14 });
    addItem(vitals, 'XL', xl, { field: 13 });
    addItem(vitals, 'XP', exp, { field: 21 });
    addItem(vitals, 'Poly HD', get(15), { field: 15, important: true, severity: 'info' });
    groups.push(makeGroup('vitals', 'Vitals', vitals));

    const dungeon = [];
    addItem(dungeon, 'Dlvl', get(20), { field: 20, important: true });
    addItem(dungeon, 'Gold', get(10), { field: 10 });
    addItem(dungeon, 'Time', get(16), { field: 16 });
    groups.push(makeGroup('dungeon', 'Dungeon', dungeon));

    const state = [];
    addItem(state, 'Hunger', get(17), { field: 17, severity: hungerSeverity(get(17)) });
    addItem(state, 'Carry', get(9), { field: 9, severity: carrySeverity(get(9)) });
    addItem(state, 'On', terrainChipValue(get(25)), { field: 25, severity: 'info', className: 'terrain-context' });
    const conditionMask = parseConditionMask(get(22));
    for (const group of decodeConditionMask(conditionMask).groups) {
      if (group.group === 'fatal') {
        for (const condition of group.conditions) addItem(state, condition.label, 'critical', { field: 22, important: true, severity: 'danger', className: 'condition-fatal' });
      } else {
        addItem(state, group.label, group.conditions.map((condition) => condition.label).join(', '), { field: 22, important: group.severity === 'danger', severity: group.severity, className: `condition-${group.group}` });
      }
    }
    groups.push(makeGroup('state', 'State', state));

    const gear = [];
    addItem(gear, 'Wield', get(23), { field: 23 });
    addItem(gear, 'Armor', get(24), { field: 24 });
    groups.push(makeGroup('gear', 'Gear', gear));

    const system = [];
    addItem(system, 'Version', get(26), { field: 26 });
    groups.push(makeGroup('system', 'System', system));

    const represented = new Set(REPRESENTED_STATUS_FIELDS);
    const other = [];
    for (const field of STATUS_FIELDS.map((entry) => entry.field)) {
      if (represented.has(field)) continue;
      addItem(other, STATUS_FIELD_BY_INDEX[field]?.label || `Field ${field}`, get(field), { field });
    }
    groups.push(makeGroup('other', 'Other', other));

    return Object.freeze(groups.filter((group) => group.items.length));
  }

  function buildHudChips(values) {
    return Object.freeze(buildStatusGroups(values).flatMap((group) => group.items.map((item) => Object.freeze({ ...item }))));
  }

  return Object.freeze({
    version: 'nethack-status-hud/v2',
    STATUS_FIELDS,
    STATUS_FIELD_BY_INDEX,
    CONDITION_BITS,
    CONDITION_GROUP_LABELS,
    CONDITION_GROUP_ORDER,
    ATTRIBUTE_FIELDS,
    REPRESENTED_STATUS_FIELDS,
    cleanStatusValue,
    parseConditionMask,
    conditionLabels,
    decodeConditionMask,
    hpSeverity,
    hungerSeverity,
    carrySeverity,
    terrainChipValue,
    buildStatusGroups,
    buildHudChips,
  });
}));
