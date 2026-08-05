
function buildPageSnapshot(options = {}) {
    const maxDepth = options.maxDepth || 30;
    const interactiveOnly = options.interactive || false;
    const compact = options.compact || false;
    const selector = options.selector || null;

    function isElementHiddenForAria(element) {
        if (!element) return true;
        const tag = element.tagName?.toUpperCase();
        if (['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE'].includes(tag)) return true;
        if (element.getAttribute('aria-hidden') === 'true') return true;

        const style = window.getComputedStyle(element);
        if (!style) return false;

        if (style.visibility === 'hidden' || style.visibility === 'collapse') return true;
        if (style.display === 'none') return true;

        let parent = element.parentElement;
        while (parent && parent !== document.body) {
            if (parent.getAttribute('aria-hidden') === 'true') return true;
            const parentStyle = window.getComputedStyle(parent);
            if (parentStyle?.display === 'none') return true;
            parent = parent.parentElement;
        }

        return false;
    }

    function getTextFromIds(ids) {
        try {
            if (!ids) return '';
            const parts = [];
            ids.split(/\s+/).forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    const t = (el.innerText || el.textContent || '').trim();
                    if (t) parts.push(t);
                }
            });
            return parts.join(' ').trim();
        } catch (_) { return ''; }
    }

    function getVisibleText(el) {
        try {
            const walker = document.createTreeWalker(
                el,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode(node) {
                        if (!node.textContent || !node.textContent.trim()) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        const parent = node.parentElement;
                        if (parent && isElementHiddenForAria(parent)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );
            const parts = [];
            while (walker.nextNode()) {
                const text = walker.currentNode.textContent || '';
                const clean = text.replace(/\s+/g, ' ').trim();
                if (clean) {
                    parts.push(clean);
                    if (parts.join(' ').length > 240) {
                        break;
                    }
                }
            }
            if (parts.length) {
                return parts.join(' ').trim().substring(0, 200);
            }
            const fallback = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
            return fallback.substring(0, 200);
        } catch (_) {
            try {
                const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
                return text.substring(0, 200);
            } catch (_) {
                return '';
            }
        }
    }

    function getLabelsText(el) {
        try {
            const labels = (el.labels && Array.from(el.labels)) || [];
            if (!labels.length) return '';
            const labelText = labels
                .map(label => getVisibleText(label) || (label.textContent || '').trim())
                .filter(Boolean)
                .join(' ')
                .trim();
            return labelText.substring(0, 200);
        } catch (_) {
            return '';
        }
    }

    function getImplicitRole(el) {
        try {
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            switch (tag) {
                case 'a':
                    return el.hasAttribute('href') ? 'link' : null;
                case 'area':
                    return el.hasAttribute('href') ? 'link' : null;
                case 'article':
                    return 'article';
                case 'aside':
                    return 'complementary';
                case 'button':
                    return 'button';
                case 'datalist':
                    return 'listbox';
                case 'details':
                    return 'group';
                case 'dialog':
                    return 'dialog';
                case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
                    return 'heading';
                case 'hr':
                    return 'separator';
                case 'img':
                    return (el.getAttribute('alt') === '' && !el.getAttribute('title')) ? null : 'img';
                case 'input': {
                    const type = (el.type || el.getAttribute('type') || 'text').toLowerCase();
                    if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image') return 'button';
                    if (type === 'checkbox') return 'checkbox';
                    if (type === 'radio') return 'radio';
                    if (type === 'range') return 'slider';
                    if (type === 'number') return 'spinbutton';
                    if (type === 'search') return el.hasAttribute('list') ? 'combobox' : 'searchbox';
                    if (type === 'hidden') return null;
                    if (['email', 'tel', 'text', 'url', 'password', ''].includes(type)) {
                        const list = el.getAttribute('list');
                        if (list) {
                            const datalist = document.getElementById(list);
                            if (datalist && datalist.tagName === 'DATALIST') return 'combobox';
                        }
                        return 'textbox';
                    }
                    return 'textbox';
                }
                case 'li':
                    return 'listitem';
                case 'main':
                    return 'main';
                case 'math':
                    return 'math';
                case 'menu':
                    return 'list';
                case 'meter':
                    return 'meter';
                case 'nav':
                    return 'navigation';
                case 'ol': case 'ul':
                    return 'list';
                case 'optgroup':
                    return 'group';
                case 'option':
                    return 'option';
                case 'output':
                    return 'status';
                case 'progress':
                    return 'progressbar';
                case 'search':
                    return 'search';
                case 'select':
                    return el.hasAttribute('multiple') || (el.size > 1) ? 'listbox' : 'combobox';
                case 'summary':
                    return 'button';
                case 'table':
                    return 'table';
                case 'tbody': case 'tfoot': case 'thead':
                    return 'rowgroup';
                case 'td':
                    return 'cell';
                case 'textarea':
                    return 'textbox';
                case 'th':
                    return 'columnheader';
                case 'tr':
                    return 'row';
                case 'section':
                    return (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) ? 'region' : null;
                case 'form':
                    return (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) ? 'form' : null;
                case 'header':
                    return 'banner';
                case 'footer':
                    return 'contentinfo';
                case 'svg':
                    return 'img';
                default:
                    return null;
            }
        } catch (_) {
            return null;
        }
    }

    function getAriaRole(el) {
        const explicitRole = el.getAttribute('role');
        if (explicitRole) {
            const roles = explicitRole.split(' ').map(r => r.trim()).filter(Boolean);
            if (roles.length > 0) return roles[0];
        }
        return getImplicitRole(el);
    }

    function computeAccessibleName(el, role) {
        try {
            if (!el || el.getAttribute('aria-hidden') === 'true') {
                return '';
            }

            const labelledBy = el.getAttribute('aria-labelledby');
            const fromLabelledBy = getTextFromIds(labelledBy);
            if (fromLabelledBy) return fromLabelledBy.substring(0, 200);

            const ariaLabel = (el.getAttribute('aria-label') || '').trim();
            if (ariaLabel) return ariaLabel.substring(0, 200);

            const ariaPlaceholder = (el.getAttribute('aria-placeholder') || '').trim();
            if (ariaPlaceholder) return ariaPlaceholder.substring(0, 200);

            const labelsText = getLabelsText(el);
            if (labelsText) return labelsText.substring(0, 200);

            const tag = el.tagName ? el.tagName.toLowerCase() : '';

            if (tag === 'img') {
                const alt = (el.getAttribute('alt') || '').trim();
                if (alt) return alt.substring(0, 200);
            }

            if (tag === 'input') {
                const type = (el.getAttribute('type') || 'text').toLowerCase();
                const value = el.value || el.getAttribute('value') || '';
                const placeholder = (el.getAttribute('placeholder') || '').trim();
                if (type === 'button' || type === 'submit' || type === 'reset') {
                    if (value) return String(value).substring(0, 200);
                }
                if (placeholder) return placeholder.substring(0, 200);
                if (value && type !== 'password') return String(value).substring(0, 200);
            }

            if (tag === 'textarea') {
                const placeholder = (el.getAttribute('placeholder') || '').trim();
                if (placeholder) return placeholder.substring(0, 200);
                if (el.value) return String(el.value).substring(0, 200);
            }

            if (tag === 'select') {
                const selected = Array.from(el.selectedOptions || [])
                    .map(option => getVisibleText(option) || (option.textContent || '').trim())
                    .filter(Boolean)
                    .join(', ')
                    .trim();
                if (selected) return selected.substring(0, 200);
            }

            const roleLower = (role || '').toLowerCase();
            const interactiveRoles = new Set(['button', 'link', 'menuitem', 'option', 'tab', 'checkbox', 'radio', 'switch', 'combobox', 'textbox', 'listbox', 'slider', 'spinbutton', 'cell', 'gridcell', 'row', 'columnheader', 'rowheader']);
            const interactiveTags = new Set(['button', 'a', 'summary', 'label', 'option', 'textarea', 'select', 'time']);
            const headingTags = new Set(['h1','h2','h3','h4','h5','h6']);
            if (interactiveRoles.has(roleLower) || interactiveTags.has(tag) || headingTags.has(tag)) {
                const visible = getVisibleText(el);
                if (visible) return visible.substring(0, 200);
            }

            if (tag === 'p' || tag === 'li' || roleLower === 'heading') {
                const visible = getVisibleText(el);
                if (visible) return visible.substring(0, 200);
            }

            const title = (el.getAttribute('title') || '').trim();
            if (title) return title.substring(0, 200);

            return '';
        } catch (_) {
            return '';
        }
    }

    function collectElementStates(el, role) {
        const states = [];
        try {
            if (document.activeElement === el) {
                states.push('active');
                states.push('focused');
            }
            if (el.matches && el.matches(':checked')) states.push('checked');
            const ariaChecked = el.getAttribute('aria-checked');
            if (ariaChecked === 'true') states.push('checked');
            if (ariaChecked === 'mixed') states.push('indeterminate');
            if (el.matches && el.matches(':disabled')) states.push('disabled');
            if (el.disabled) states.push('disabled');
            let parent = el.parentElement;
            while (parent) {
                if (parent.tagName === 'FIELDSET' && parent.disabled) {
                    states.push('disabled');
                    break;
                }
                parent = parent.parentElement;
            }
            if (el.matches && el.matches(':required')) states.push('required');
            if (el.matches && el.matches(':read-only') && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) states.push('readonly');
            if (el.readOnly) states.push('readonly');
            if (el.selected) states.push('selected');
            const ariaSelected = el.getAttribute('aria-selected');
            if (ariaSelected === 'true') states.push('selected');
            const ariaExpanded = el.getAttribute('aria-expanded');
            if (ariaExpanded === 'true') states.push('expanded');
            if (ariaExpanded === 'false') states.push('collapsed');
            const ariaPressed = el.getAttribute('aria-pressed');
            if (ariaPressed === 'true') states.push('pressed');
            if (ariaPressed === 'false') states.push('released');
            if (el.getAttribute && el.getAttribute('aria-current')) states.push('current');
            if (el.getAttribute && el.getAttribute('aria-invalid') === 'true') states.push('invalid');
            if (el.getAttribute && el.getAttribute('aria-busy') === 'true') states.push('busy');
        } catch (_) { }
        return Array.from(new Set(states));
    }

    function collectElementDetails(el, role) {
        const details = {};
        try {
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            const ariaDescription = (el.getAttribute('aria-description') || '').trim();
            if (ariaDescription) {
                details.description = ariaDescription.substring(0, 200);
            }
            const describedBy = getTextFromIds(el.getAttribute('aria-describedby'));
            if (describedBy) {
                details.description = details.description
                    ? (details.description + ' ' + describedBy.substring(0, 200)).trim()
                    : describedBy.substring(0, 200);
            }
            if (tag === 'a' && el.hasAttribute('href')) {
                details.url = el.getAttribute('href');
            }
            if ((tag === 'img' || tag === 'svg') && el.hasAttribute('src')) {
                details.src = el.getAttribute('src');
            }
            if (tag === 'input' || tag === 'textarea') {
                const type = (el.getAttribute('type') || 'text').toLowerCase();
                const value = el.value || el.getAttribute('value') || '';
                if (value && (tag !== 'input' || type !== 'password')) {
                    details.value = String(value).substring(0, 200);
                }
                const placeholder = (el.getAttribute('placeholder') || '').trim();
                if (placeholder) {
                    details.placeholder = placeholder.substring(0, 200);
                }
            }
            if (tag === 'select') {
                const selected = Array.from(el.selectedOptions || [])
                    .map(option => getVisibleText(option) || (option.textContent || '').trim())
                    .filter(Boolean);
                if (selected.length) {
                    details.value = selected.join(', ').substring(0, 200);
                }
                const allOptions = Array.from(el.options || []);
                if (allOptions.length > 0 && allOptions.length <= 20) {
                    details.options = allOptions.map(opt => {
                        const label = (opt.textContent || '').trim();
                        const value = opt.value;
                        const disabled = opt.disabled;
                        let optStr = label;
                        if (value && value !== label) {
                            optStr += ' (value: ' + value + ')';
                        }
                        if (disabled) {
                            optStr += ' [disabled]';
                        }
                        return optStr;
                    }).join(', ');
                } else if (allOptions.length > 20) {
                    details.options = allOptions.slice(0, 10).map(opt => {
                        const label = (opt.textContent || '').trim();
                        return label;
                    }).join(', ') + '... (' + allOptions.length + ' total options)';
                }
            }
            if (role === 'combobox' && el.getAttribute('aria-activedescendant')) {
                details.activeDescendant = el.getAttribute('aria-activedescendant');
            }
        } catch (_) { }
        return details;
    }

    function shouldIncludeElement(el) {
        try {
            if (!el || el.getAttribute('aria-hidden') === 'true') {
                return false;
            }
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            const role = el.getAttribute('role') || getImplicitRole(el);
            const meaningfulTags = new Set(['a', 'button', 'input', 'select', 'textarea', 'img', 'svg', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'nav', 'main', 'header', 'footer', 'section', 'article', 'form', 'label', 'ul', 'ol', 'li', 'p', 'strong', 'em', 'small', 'time', 'option', 'summary', 'details']);
            if (meaningfulTags.has(tag)) {
                return true;
            }
            if (role && role !== 'generic') {
                return true;
            }
            if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) {
                return true;
            }
            if (el.matches && el.matches('[contenteditable=\"true\"]')) {
                return true;
            }
            if (el.querySelector && el.querySelector('a, button, input, select, textarea, [role], [contenteditable=\"true\"]')) {
                return true;
            }
        } catch (_) {
            return true;
        }
        return false;
    }

    const INTERACTIVE_ROLES = new Set([
        'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
        'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'slider',
        'spinbutton', 'switch', 'tab', 'treeitem', 'searchbox'
    ]);

    function isValidRef(ref) {
        return typeof ref === 'string' && /^e\d+$/.test(ref);
    }

    function getMaxRefIndex() {
        let maxIndex = -1;
        const existing = document.querySelectorAll('[data-cursor-ref]');
        for (const el of existing) {
            const ref = el.getAttribute('data-cursor-ref');
            if (isValidRef(ref)) {
                const num = parseInt(ref.substring(1), 10);
                if (!Number.isNaN(num)) {
                    maxIndex = Math.max(maxIndex, num);
                }
            }
        }
        return maxIndex;
    }

    let refCounter = 0;

    class RoleNameTracker {
        constructor() {
            this.counts = new Map();
            this.refsByKey = new Map();
        }
        getKey(role, name) {
            return role + '::' + (name || '');
        }
        getNextIndex(role, name) {
            const key = this.getKey(role, name);
            const current = this.counts.get(key) || 0;
            this.counts.set(key, current + 1);
            return current;
        }
        trackRef(role, name, ref) {
            const key = this.getKey(role, name);
            const refs = this.refsByKey.get(key) || [];
            refs.push(ref);
            this.refsByKey.set(key, refs);
        }
        getDuplicateKeys() {
            const duplicates = new Set();
            for (const [key, refs] of this.refsByKey) {
                if (refs.length > 1) {
                    duplicates.add(key);
                }
            }
            return duplicates;
        }
    }

    function buildInteractiveSnapshot() {
        const tracker = new RoleNameTracker();
        const elements = [];
        const usedRefs = new Set();
        const interactiveSet = new Set();

        const interactiveSelector = [
            'input', 'textarea', 'select', 'button', 'a[href]',
            '[role=\"button\"]', '[role=\"link\"]', '[role=\"textbox\"]', '[role=\"checkbox\"]',
            '[role=\"radio\"]', '[role=\"combobox\"]', '[role=\"listbox\"]', '[role=\"menuitem\"]',
            '[role=\"menuitemcheckbox\"]', '[role=\"menuitemradio\"]', '[role=\"option\"]',
            '[role=\"slider\"]', '[role=\"spinbutton\"]', '[role=\"switch\"]', '[role=\"tab\"]',
            '[role=\"treeitem\"]', '[role=\"searchbox\"]', '[contenteditable=\"true\"]',
            'summary', '[tabindex]:not([tabindex=\"-1\"])'
        ].join(', ');

        const allInteractive = document.querySelectorAll(interactiveSelector);

        for (const el of allInteractive) {
            if (el.getAttribute('aria-hidden') === 'true') continue;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;

            const tag = el.tagName.toLowerCase();
            interactiveSet.add(el);
            const roleAttr = el.getAttribute('role') || '';
            const implicitRole = getImplicitRole(el);
            const role = roleAttr || implicitRole || 'generic';

            if (!INTERACTIVE_ROLES.has(role) && role !== 'generic') continue;

            const name = computeAccessibleName(el, role);
            const existingRef = el.getAttribute('data-cursor-ref');
            let ref = null;
            if (isValidRef(existingRef) && !usedRefs.has(existingRef)) {
                ref = existingRef;
            } else {
                ref = 'e' + refCounter++;
            }
            el.setAttribute('data-cursor-ref', ref);
            usedRefs.add(ref);

            const nth = tracker.getNextIndex(role, name);
            tracker.trackRef(role, name, ref);

            const node = { ref, role, name, tag };

            const states = collectElementStates(el, role);
            if (states.length) node.states = states;

            const details = collectElementDetails(el, role);
            for (const key in details) {
                if (details[key] !== undefined && details[key] !== '') {
                    node[key] = details[key];
                }
            }

            node._nth = nth;

            elements.push(node);
        }

        const duplicateKeys = tracker.getDuplicateKeys();
        for (const el of elements) {
            const key = tracker.getKey(el.role, el.name);
            if (duplicateKeys.has(key) && el._nth > 0) {
                el.nth = el._nth;
            }
            delete el._nth;
        }

        return { elements, tracker, usedRefs, interactiveSet };
    }

    function buildContentElements(interactiveSet, usedRefs) {
        const elements = [];
        const contentSelector = [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'label', '[role=\"heading\"]', 'p', 'li',
            'article', 'nav', 'main', 'header', 'footer', 'section',
            '[role=\"article\"]', '[role=\"region\"]', '[role=\"main\"]', '[role=\"navigation\"]',
            '[role=\"cell\"]', '[role=\"gridcell\"]', '[role=\"columnheader\"]', '[role=\"rowheader\"]',
            '[role=\"listitem\"]'
        ].join(', ');
        const allContent = document.querySelectorAll(contentSelector);

        for (const el of allContent) {
            if (el.getAttribute('aria-hidden') === 'true') continue;
            if (interactiveSet.has(el)) continue;

            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;

            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role') || getImplicitRole(el);
            const name = computeAccessibleName(el, role);

            if (!name) continue;

            const existingRef = el.getAttribute('data-cursor-ref');
            let ref = null;
            if (isValidRef(existingRef) && !usedRefs.has(existingRef)) {
                ref = existingRef;
            } else {
                ref = 'e' + refCounter++;
            }
            el.setAttribute('data-cursor-ref', ref);
            usedRefs.add(ref);

            const node = { ref, role, name, tag };

            if (role === 'heading') {
                const ariaLevel = parseInt(el.getAttribute('aria-level') || '', 10);
                const tagLevelMatch = tag.match(/^h([1-6])$/);
                const tagLevel = tagLevelMatch ? parseInt(tagLevelMatch[1], 10) : undefined;
                const level = !Number.isNaN(ariaLevel) ? ariaLevel : tagLevel;
                if (level) node.level = level;
            }

            elements.push(node);
        }

        return elements;
    }

    refCounter = getMaxRefIndex() + 1;

    const { elements: interactiveElements, tracker, usedRefs, interactiveSet } = buildInteractiveSnapshot();
    const contentElements = interactiveOnly ? [] : buildContentElements(interactiveSet, usedRefs);

    const allElements = [...interactiveElements, ...contentElements];

    document.querySelectorAll('[data-cursor-ref]').forEach(el => {
        const ref = el.getAttribute('data-cursor-ref');
        if (!isValidRef(ref) || !usedRefs.has(ref)) {
            el.removeAttribute('data-cursor-ref');
        }
    });

    const tree = {
        role: 'document',
        ref: 'root',
        name: document.title || '',
        children: allElements
    };

    return {
        tree,
        stats: {
            totalRefs: allElements.length,
            interactiveRefs: interactiveElements.length,
            maxDepth: maxDepth
        }
    };
}
