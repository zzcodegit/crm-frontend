import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { ProductCharItem, ProductRefItem } from "../api";

export default function ProductCharacteristicsRef() {
  const [items, setItems] = useState<ProductCharItem[]>([]);
  const [products, setProducts] = useState<ProductRefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [productFilter, setProductFilter] = useState<number | "">("");
  const [editId, setEditId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newProductId, setNewProductId] = useState<number | "">("");
  const [editName, setEditName] = useState("");

  const load = () => {
    setError("");
    Promise.all([
      api.ref.productCharacteristics.list(productFilter || undefined),
      api.ref.products.list(),
    ]).then(([chars, prods]) => { setItems(chars); setProducts(prods); }).catch((e) => setError(e instanceof Error ? e.message : "Ошибка")).finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    api.ref.productCharacteristics.list(productFilter || undefined).then(setItems).catch((e) => setError(e instanceof Error ? e.message : "Ошибка")).finally(() => setLoading(false));
  }, [productFilter]);

  useEffect(() => {
    api.ref.products.list().then(setProducts);
  }, []);

  const productName = (id: number) => products.find((p) => p.id === id)?.name ?? id;

  if (loading && items.length === 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">Характеристики товаров</h1>
        <p className="text-slate-500 dark:text-slate-400 py-8">Загрузка…</p>
      </div>
    );
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || newProductId === "") return;
    setError("");
    api.ref.productCharacteristics.create({ product_id: Number(newProductId), name: newName.trim() }).then(() => { setNewName(""); setNewProductId(""); load(); }).catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (editId == null || !editName.trim()) return;
    setError("");
    api.ref.productCharacteristics.update(editId, { name: editName.trim() }).then(() => { setEditId(null); load(); }).catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
  };

  const handleDelete = (id: number) => {
    if (!confirm("Удалить?")) return;
    setError("");
    api.ref.productCharacteristics.delete(id).then(load).catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
  };

  return (
    <div className="max-w-2xl">
      <Link to="/settings/references" className="text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 mb-4 inline-block">← Справочники</Link>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Характеристики товаров</h1>
      {error && <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{error}</div>}
      <div className="mb-4">
        <label className="text-sm text-slate-600 dark:text-slate-400 mr-2">Товар:</label>
        <select value={productFilter} onChange={(e) => setProductFilter(e.target.value ? Number(e.target.value) : "")} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[280px]">
          <option value="">Все</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <form onSubmit={handleCreate} className="flex flex-wrap gap-2 mb-6">
        <select value={newProductId} onChange={(e) => setNewProductId(e.target.value ? Number(e.target.value) : "")} required className="px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[200px]">
          <option value="">Товар</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Название характеристики" className="flex-1 min-w-[160px] px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="submit" className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium">Добавить</button>
      </form>
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.id} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap items-center justify-between gap-3">
            {editId === it.id ? (
              <form onSubmit={handleUpdate} className="flex flex-wrap items-center gap-2 flex-1">
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 min-w-[120px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">Сохранить</button>
                <button type="button" onClick={() => setEditId(null)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm">Отмена</button>
              </form>
            ) : (
              <>
                <span className="font-medium text-slate-900 dark:text-white">{it.name} <span className="text-slate-500 dark:text-slate-400 text-sm">({productName(it.product_id)})</span></span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setEditId(it.id); setEditName(it.name); }} className="px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm font-medium">Изменить</button>
                  <button type="button" onClick={() => handleDelete(it.id)} className="px-4 py-2 rounded-xl text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20">Удалить</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
