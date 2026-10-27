import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import PageShell from '../../components/layout/PageShell';
import { Panel, Table, Flash } from '../../components/ui/Misc';
import { Field, TextInput, NumberInput, Select } from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import StatusPill from '../../components/ui/StatusPill';
import * as api from '../../lib/apiClient';
import { ACCESSORY_CATEGORIES } from '../../lib/constants';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AccessoryItem } from '../../types';

function stockStatus(item: AccessoryItem): 'OUT' | 'LOW' | 'OK' {
  if (item.stock === 0) return 'OUT';
  if (item.stock <= item.reorder) return 'LOW';
  return 'OK';
}

// Small pill list for a row's available sizes — keeps a 6-size brush like
// "B-44 (B)" readable in one table cell instead of a raw comma-string.
function SizePills({ sizes }: { sizes: string[] }) {
  if (!sizes || sizes.length === 0) return <span className="text-ink-soft">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {sizes.map((s) => (
        <span key={s} className="inline-block px-1.5 py-0.5 rounded-md bg-line/40 text-[11px] font-semibold text-ink-soft">
          {s}
        </span>
      ))}
    </div>
  );
}

export default function AccessoriesPage() {
  const [items, setItems] = useState<AccessoryItem[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [search, setSearch] = useState('');
  // Debounced so filtering the ~60-item catalog runs once per pause in
  // typing, not on every keystroke.
  const debouncedSearch = useDebouncedValue(search, 200);

  const refresh = useCallback(async () => {
    setItems(await api.listAccessories());
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const categories = useMemo(() => {
    const fromItems = new Set(items.map((it) => it.category).filter(Boolean));
    return ['All', ...new Set([...ACCESSORY_CATEGORIES, ...fromItems])];
  }, [items]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return items.filter((it) => {
      const matchesCategory = categoryFilter === 'All' || it.category === categoryFilter;
      const matchesSearch = it.name.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [items, categoryFilter, debouncedSearch]);

  async function handlePriceUpdate(sku: string, price: string | number) {
    setError('');
    setMsg('');
    try {
      await api.updateAccessoryItem({ sku, updates: { price: Number(price) } });
      onQuietRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update price.');
    }
  }

  async function onQuietRefresh() {
    setItems(await api.listAccessories());
  }

  return (
    <PageShell>
      <AddItemPanel onAdded={refresh} setMsg={setMsg} setError={setError} />
      <StockInPanel items={items} onDone={refresh} setMsg={setMsg} setError={setError} />
      <SellPanel items={items} onDone={refresh} setMsg={setMsg} setError={setError} />

      <Panel
        title="Accessories Inventory"
        subtitle={`${filtered.length} of ${items.length} items — brushes, rollers & textures, and tools all live here.`}
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            <TextInput placeholder="Search item…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
        }
      >
        <Flash kind="err">{error}</Flash>
        <Flash kind="ok">{msg}</Flash>
        <Table columns={['SKU', 'Name', 'Category', 'Sizes', 'Price', 'Stock', 'Reorder Level', 'Status']} isEmpty={filtered.length === 0}>
          {filtered.map((it) => (
            <tr key={it.sku} className="border-b border-line align-top">
              <td className="py-2 px-2.5 mono">{it.sku}</td>
              <td className="py-2 px-2.5">{it.name}</td>
              <td className="py-2 px-2.5">{it.category}</td>
              <td className="py-2 px-2.5"><SizePills sizes={it.sizes} /></td>
              <td className="py-2 px-2.5">
                <div className="flex items-center gap-1">
                  <span>₹</span>
                  <input
                    type="number"
                    min={0}
                    defaultValue={it.price}
                    onBlur={(e) => {
                      if (Number(e.target.value) !== it.price) handlePriceUpdate(it.sku, e.target.value);
                    }}
                    className="w-20 px-1.5 py-1 border border-line rounded-md text-sm"
                  />
                </div>
              </td>
              <td className="py-2 px-2.5">{it.stock}</td>
              <td className="py-2 px-2.5">{it.reorder}</td>
              <td className="py-2 px-2.5"><StatusPill status={stockStatus(it)}>{stockStatus(it)}</StatusPill></td>
            </tr>
          ))}
        </Table>
      </Panel>
    </PageShell>
  );
}

interface SubPanelProps {
  onAdded?: () => void;
  onDone?: () => void;
  setMsg: (msg: string) => void;
  setError: (msg: string) => void;
}

function AddItemPanel({ onAdded, setMsg, setError }: SubPanelProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState(ACCESSORY_CATEGORIES[0]);
  const [sizesText, setSizesText] = useState('');
  const [price, setPrice] = useState(50);
  const [stock, setStock] = useState(0);
  const [reorder, setReorder] = useState(10);

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const sizes = sizesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const item = await api.addAccessoryItem({
        name,
        category,
        sizes,
        price: Number(price),
        stock: Number(stock),
        reorder: Number(reorder),
      });
      setMsg(`Added ${item.name} (${item.sku}).`);
      setName('');
      setSizesText('');
      onAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add item.');
    }
  }

  return (
    <Panel title="Add Accessory Item" subtitle="Give it every size it comes in, comma-separated — they'll show as a dropdown-style list on that row.">
      <form onSubmit={handleAdd} className="flex flex-wrap gap-4 items-end">
        <Field label="Item name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {ACCESSORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Sizes (comma separated)">
          <TextInput
            placeholder={'e.g. 1", 2", 3", 4"'}
            value={sizesText}
            onChange={(e) => setSizesText(e.target.value)}
          />
        </Field>
        <Field label="Price (₹)">
          <NumberInput min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} required />
        </Field>
        <Field label="Opening stock">
          <NumberInput min={0} value={stock} onChange={(e) => setStock(Number(e.target.value))} required />
        </Field>
        <Field label="Reorder level">
          <NumberInput min={0} value={reorder} onChange={(e) => setReorder(Number(e.target.value))} required />
        </Field>
        <Button type="submit" variant="blue">Add Item</Button>
      </form>
    </Panel>
  );
}

function StockInPanel({ items, onDone, setMsg, setError }: SubPanelProps & { items: AccessoryItem[] }) {
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState(10);

  useEffect(() => {
    if (items[0] && !sku) setSku(items[0].sku);
  }, [items, sku]);

  async function handleStockIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const item = await api.stockInAccessory({ sku, qty: Number(qty) });
      setMsg(`Stocked in ${qty} — ${item.name} now at ${item.stock}.`);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stock-in failed.');
    }
  }

  return (
    <Panel title="Stock In">
      <form onSubmit={handleStockIn} className="flex flex-wrap gap-4 items-end">
        <Field label="Item">
          <Select value={sku} onChange={(e) => setSku(e.target.value)}>
            {items.map((it) => (
              <option key={it.sku} value={it.sku}>
                {it.name}{it.sizes?.length ? ` — ${it.sizes.join(', ')}` : ''} ({it.sku})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity received">
          <NumberInput min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
        </Field>
        <Button type="submit" variant="green">Stock In</Button>
      </form>
    </Panel>
  );
}

function SellPanel({ items, onDone, setMsg, setError }: SubPanelProps & { items: AccessoryItem[] }) {
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState(1);
  const [customer, setCustomer] = useState('');

  useEffect(() => {
    if (items[0] && !sku) setSku(items[0].sku);
  }, [items, sku]);

  async function handleSell(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const item = await api.sellAccessory({ sku, qty: Number(qty), customer });
      setMsg(`Sold ${qty} × ${item.name}. Remaining stock: ${item.stock}.`);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sale failed.');
    }
  }

  return (
    <Panel title="Sell Accessory">
      <form onSubmit={handleSell} className="flex flex-wrap gap-4 items-end">
        <Field label="Item">
          <Select value={sku} onChange={(e) => setSku(e.target.value)}>
            {items.map((it) => (
              <option key={it.sku} value={it.sku}>
                {it.name}{it.sizes?.length ? ` — ${it.sizes.join(', ')}` : ''} ({it.sku}) — {it.stock} in stock
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity">
          <NumberInput min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
        </Field>
        <Field label="Customer (optional)">
          <TextInput value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </Field>
        <Button type="submit" variant="ochre">Sell</Button>
      </form>
    </Panel>
  );
}
