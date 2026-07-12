const CATEGORY_LABELS = { costume: '服裝', wig: '假髮', shoes: '鞋子', prop: '道具', lens: '隱眼', other: '其他' };

function itemToLine(item) {
  const isLent = item.status === 'lent_out';
  const where = item.status === 'in_storage'
    ? `收納於：${item.location}`
    : isLent
      ? `借給：${item.borrower}`
      : '尚未指定位置';
  return `
    <li class="flex items-center justify-between gap-3 flex-wrap px-3 py-2 text-sm rounded-xl" style="background:#F2ECDE;border:1px solid #E4DBC5">
      <span>
        <span class="category-tag inline-block text-xs font-semibold px-2 py-0.5 rounded-full" style="background:#F6E2C9;color:#D98A4E">${CATEGORY_LABELS[item.category] || item.category}</span>
        ${item.name}
      </span>
      <span class="status-line text-sm ${isLent ? 'lent font-semibold' : ''}" style="color:${isLent ? '#D98A4E' : '#8B8374'}">${where}</span>
    </li>
  `;
}
