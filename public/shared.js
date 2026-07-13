const BUILTIN_CATEGORY_ICONS = {
  costume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4a2 2 0 1 1 4 0"/><path d="M12 4a2 2 0 1 0-4 0"/><path d="M12 4v3"/><path d="M4 20v-4.5c0-2 6-5.5 8-5.5s8 3.5 8 5.5V20H4Z"/></svg>',
  wig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14c0-6 3.5-9 8-9s8 3 8 9"/><path d="M6 12c1-2 2-3 2-6M18 12c-1-2-2-3-2-6M12 6v3"/><path d="M4 14v3a1 1 0 0 0 1 1h1M20 14v3a1 1 0 0 1-1 1h-1"/></svg>',
  shoes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-4c2-.5 3-1.5 4-3 1.5 1.5 3 2 5 2h2c2.5 0 4.5 1 6 3v2H3Z"/></svg>',
  prop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z"/><path d="M4 8.5 12 13l8-4.5M12 13v7"/></svg>',
  lens: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg>',
};

const DEFAULT_CATEGORY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>';

function categoryIcon(slug) {
  return BUILTIN_CATEGORY_ICONS[slug] || DEFAULT_CATEGORY_ICON;
}

function itemToLine(item, categoryLabels) {
  const isLent = item.status === 'lent_out';
  const where = item.status === 'in_storage'
    ? `收納於：${item.location}`
    : isLent
      ? `借給：${item.borrower}`
      : '尚未指定位置';
  return `
    <li class="flex items-center justify-between gap-3 flex-wrap px-3 py-2 text-sm rounded-xl" style="background:#F2ECDE;border:1px solid #E4DBC5">
      <span>
        <span class="category-tag inline-block text-xs font-semibold px-2 py-0.5 rounded-full" style="background:#F6E2C9;color:#D98A4E">${categoryLabels[item.category] || item.category}</span>
        ${item.name}
      </span>
      <span class="status-line text-sm ${isLent ? 'lent font-semibold' : ''}" style="color:${isLent ? '#D98A4E' : '#8B8374'}">${where}</span>
    </li>
  `;
}
