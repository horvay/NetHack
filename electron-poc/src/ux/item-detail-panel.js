(function initUxItemDetailPanel(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./item-presentation'));
  else root.NetHackUxItemDetailPanel = factory(root.NetHackUxItemPresentation);
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory(ItemPresentation) {
  const version = 'nethack-ux-item-detail-panel/v1';

  function text(node, value) { node.textContent = String(value == null ? '' : value); return node; }
  function element(doc, tag, className, value) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (value != null) text(node, value);
    return node;
  }
  function visibleShortcut(shortcut) {
    const value = String(shortcut || '');
    if (!value || value.length > 2 || /[\n\u001b]/.test(value)) return '';
    return value;
  }
  function primaryAction(actions = []) {
    // A consumable's defining action remains primary even when NetHack marks it
    // as cautionary; generic safe actions such as wielding must not displace it.
    return actions.find((action) => action.enabled && ['item.quaff', 'item.read.scroll', 'item.study'].includes(action.id))
      || actions.find((action) => action.enabled && action.section === 'primary' && action.danger === 'safe')
      || actions.find((action) => action.enabled && action.section === 'primary' && action.danger !== 'caution')
      || null;
  }
  function actionSection(actions = [], primary) {
    return {
      secondary: actions.filter((action) => action !== primary && action.enabled && !['caution', 'serious', 'dangerous'].includes(action.danger)),
      dangerous: actions.filter((action) => action.enabled && ['caution', 'serious', 'dangerous'].includes(action.danger)),
      blocked: actions.filter((action) => !action.enabled),
    };
  }

  function renderDetailPanel(container, options = {}) {
    if (!container?.ownerDocument) throw new TypeError('Item detail panel requires a DOM container');
    const doc = container.ownerDocument;
    const item = options.item || null;
    const compareItem = options.compareItem || null;
    const pending = Boolean(options.pending);
    const onAction = typeof options.onAction === 'function' ? options.onAction : () => {};
    container.textContent = '';
    container.classList.add('uxm-item-detail');

    if (!item) {
      container.append(
        element(doc, 'h3', 'uxm-detail-title', 'Item details'),
        element(doc, 'p', 'uxm-detail-empty', options.emptyMessage || 'Select an item or equipment slot to see known details and actions.'),
      );
      return Object.freeze({ item: null, buttons: Object.freeze([]) });
    }

    const heading = element(doc, 'div', 'uxm-detail-heading');
    const titleWrap = element(doc, 'div', 'uxm-detail-title-wrap');
    titleWrap.append(element(doc, 'span', 'uxm-detail-kicker', options.slotLabel || 'Selected item'), element(doc, 'h3', 'uxm-detail-title', item.displayName));
    if (item.quantity > 1) titleWrap.append(element(doc, 'span', 'uxm-detail-quantity', `Quantity ${item.quantity}`));
    heading.append(titleWrap);
    if (item.knownState === 'appearance') heading.append(element(doc, 'span', 'uxm-identity-state', 'Unidentified'));
    container.appendChild(heading);

    const facts = ItemPresentation.factRows(item);
    if (facts.length) {
      const factsList = element(doc, 'dl', 'uxm-known-facts');
      for (const fact of facts) {
        const row = element(doc, 'div', 'uxm-known-fact');
        row.append(element(doc, 'dt', '', fact.label), element(doc, 'dd', '', fact.value));
        factsList.appendChild(row);
      }
      container.appendChild(factsList);
    } else {
      container.appendChild(element(doc, 'p', 'uxm-detail-muted', 'No additional known facts. NetHack will reveal more through play.'));
    }

    const comparison = ItemPresentation.compareItems(item, compareItem);
    if (compareItem) {
      const compare = element(doc, 'section', 'uxm-item-compare');
      compare.appendChild(element(doc, 'h4', '', `Compare with ${compareItem.displayName}`));
      if (comparison.length) {
        const table = element(doc, 'div', 'uxm-compare-table');
        const header = element(doc, 'div', 'uxm-compare-row uxm-compare-header');
        header.append(element(doc, 'span', '', 'Known fact'), element(doc, 'span', '', 'Selected'), element(doc, 'span', '', 'Equipped'));
        table.appendChild(header);
        for (const rowModel of comparison) {
          const row = element(doc, 'div', 'uxm-compare-row');
          row.append(element(doc, 'span', '', rowModel.label), element(doc, 'span', '', rowModel.selected), element(doc, 'span', '', rowModel.equipped));
          table.appendChild(row);
        }
        compare.appendChild(table);
      } else compare.appendChild(element(doc, 'p', 'uxm-detail-muted', 'No aligned public values are available for comparison.'));
      container.appendChild(compare);
    }

    const primary = primaryAction(item.actions);
    const sections = actionSection(item.actions, primary);
    const actionsRoot = element(doc, 'div', 'uxm-detail-actions');
    const buttons = [];
    function addButton(action, className) {
      const button = element(doc, 'button', className, action.label);
      button.type = 'button';
      button.dataset.actionId = action.id;
      button.disabled = pending || !action.enabled;
      const shortcut = visibleShortcut(action.shortcut);
      if (shortcut) {
        const keycap = element(doc, 'kbd', 'uxm-action-key', shortcut);
        button.append(' ', keycap);
      }
      button.addEventListener('click', () => { if (!button.disabled) onAction(action, item, button); });
      actionsRoot.appendChild(button);
      buttons.push(button);
    }
    if (primary) addButton(primary, 'uxm-action-primary');
    for (const action of sections.secondary) addButton(action, 'uxm-action-secondary');
    if (sections.dangerous.length) {
      const dangerous = element(doc, 'section', 'uxm-dangerous-actions');
      dangerous.appendChild(element(doc, 'h4', '', 'Dangerous actions'));
      const dangerButtons = element(doc, 'div', 'uxm-dangerous-buttons');
      for (const action of sections.dangerous) {
        const button = element(doc, 'button', 'uxm-action-danger', action.label);
        button.type = 'button';
        button.dataset.actionId = action.id;
        button.disabled = pending;
        button.addEventListener('click', () => { if (!button.disabled) onAction(action, item, button); });
        dangerButtons.appendChild(button);
        buttons.push(button);
      }
      dangerous.appendChild(dangerButtons);
      actionsRoot.appendChild(dangerous);
    }
    if (sections.blocked.length) {
      const blocked = element(doc, 'section', 'uxm-blocked-actions');
      blocked.appendChild(element(doc, 'h4', '', 'Why unavailable'));
      for (const action of sections.blocked) {
        const row = element(doc, 'div', 'uxm-blocked-row');
        row.append(element(doc, 'strong', '', action.label), element(doc, 'span', '', action.disabledReason || 'NetHack cannot safely offer this action from the current public state.'));
        blocked.appendChild(row);
      }
      actionsRoot.appendChild(blocked);
    }
    if (pending) actionsRoot.prepend(element(doc, 'p', 'uxm-action-pending', 'Waiting for NetHack…'));
    container.appendChild(actionsRoot);
    return Object.freeze({ item, buttons: Object.freeze(buttons) });
  }

  return Object.freeze({ version, renderDetailPanel, primaryAction });
}));
