export function createWebMarketplaceSearch({request, criteria, update}) {
  let enabled = false;
  let timer;
  let generation = 0;
  let key;
  let items = [];
  let cursor;
  let pending = false;
  let failed = false;

  function refresh({immediate = false, force = false} = {}) {
    if (!enabled) return;
    const input = criteria();
    const nextKey = JSON.stringify(input);
    if (nextKey === key && !force) return;
    key = nextKey;
    clearTimeout(timer);
    generation++;
    pending = true;
    failed = false;
    items = [];
    cursor = undefined;
    update();
    if (immediate) void load(input, generation);
    else timer = setTimeout(() => void load(input, generation), 260);
  }

  async function load(input, version, pageCursor) {
    try {
      const page = await request('searchListings', pageCursor ? {...input, cursor: pageCursor} : input);
      if (!enabled || version !== generation) return;
      if (!Array.isArray(page?.items)) throw new Error('Invalid search response');
      const unique = new Map(items.map(item => [item.id, item]));
      for (const item of page.items) {
        if (item?.id && item.status === 'active' && item.category === 'vehicles') unique.set(item.id, item);
      }
      items = [...unique.values()];
      cursor = page.nextCursor || undefined;
    } catch (error) {
      if (!enabled || version !== generation) return;
      if (pageCursor && (error.details?.reason === 'cursor-expired' || error.details?.reason === 'cursor-invalid')) cursor = undefined;
      failed = true;
    }
    if (!enabled || version !== generation) return;
    pending = false;
    update();
  }

  function more() {
    if (!enabled || pending) return;
    if (!cursor && failed) {
      refresh({immediate: true, force: true});
      return;
    }
    if (!cursor) return;
    pending = true;
    failed = false;
    update();
    void load(criteria(), generation, cursor);
  }

  function setEnabled(value) {
    if (enabled === value) return;
    enabled = value;
    if (enabled) refresh({immediate: true});
    else {
      clearTimeout(timer);
      generation++;
      key = cursor = undefined;
      items = [];
      pending = failed = false;
      update();
    }
  }

  return {setEnabled, refresh, more, get enabled() { return enabled; }, get items() { return items; },
    get pending() { return pending; }, get failed() { return failed; }, get hasMore() { return Boolean(cursor); }};
}
