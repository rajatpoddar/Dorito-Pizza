import { useCallback, useEffect, useState } from 'react'
import api, { errMessage } from '../../api/client'
import { fmtINR } from '../../constants'

export default function ManageComboPacksPage() {
  const [combos, setCombos] = useState([])
  const [allItems, setAllItems] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)  // null = not editing
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(() => {
    Promise.all([
      api.get('/admin/combo-packs').catch(() => ({ data: { combo_packs: [] } })),
      api.get('/menu/categories').catch(() => ({ data: { categories: [] } })),
    ]).then(([c, cats]) => {
      setCombos(c.data.combo_packs || [])
      const items = (cats.data.categories || []).flatMap((cat) =>
        (cat.items || []).map((i) => ({ ...i, category_name: cat.name })),
      )
      setAllItems(items)
    })
  }, [])

  useEffect(() => { load() }, [load])

  const flash = (msg) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 4000)
  }

  const deleteCombo = async (combo) => {
    if (!window.confirm(`Delete combo '${combo.name}'?`)) return
    try {
      await api.delete(`/admin/combo-packs/${combo.id}`)
      flash(`🗑️ ${combo.name} deleted`)
      load()
    } catch (err) {
      alert(errMessage(err))
    }
  }

  const toggleActive = async (combo) => {
    try {
      await api.put(`/admin/combo-packs/${combo.id}`, { is_active: !combo.is_active })
      load()
    } catch (err) {
      alert(errMessage(err))
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Manage Combo Packs</h1>
        <button onClick={() => { setShowCreate(true); setEditing(null) }} className="btn-secondary !py-2 text-xs">
          + New Combo
        </button>
      </div>

      {message && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {combos.length === 0 ? (
        <div className="card py-16 text-center text-neutral-400">
          <p className="text-5xl">📦</p>
          <p className="mt-3 text-lg font-semibold">No combo packs yet</p>
          <p className="mt-1 text-sm">Create your first combo to offer bundled savings!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {combos.map((combo) => (
            <div key={combo.id} className="card flex flex-wrap items-center gap-3 p-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{combo.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    combo.is_active ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-400'
                  }`}>
                    {combo.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {combo.description && <p className="text-xs text-neutral-500">{combo.description}</p>}
                <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
                  <span className="font-bold text-brand-red">{fmtINR(combo.combo_price)}</span>
                  <span className="line-through">{fmtINR(combo.original_total)}</span>
                  <span className="text-green-600 font-semibold">Save {fmtINR(combo.savings)}</span>
                  <span>{combo.item_count} item{combo.item_count !== 1 ? 's' : ''}</span>
                </div>
                {/* Show items */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(combo.items || []).map((ci, idx) => (
                    <span key={idx} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">
                      {ci.item_name} × {ci.quantity}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={() => toggleActive(combo)}
                className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${
                  combo.is_active ? 'bg-green-500' : 'bg-neutral-300'
                }`}
                role="switch"
                aria-checked={combo.is_active}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform duration-200 ${
                  combo.is_active ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>

              <button
                onClick={() => { setEditing(combo); setShowCreate(true) }}
                className="rounded-lg bg-brand-dark px-2.5 py-1.5 text-xs font-bold text-brand-gold hover:opacity-90"
              >
                ✏️ Edit
              </button>
              <button
                onClick={() => deleteCombo(combo)}
                className="text-neutral-400 transition hover:text-red-500"
                title="Delete"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}

      {(showCreate || editing) && (
        <ComboForm
          combo={editing}
          allItems={allItems}
          onClose={() => { setShowCreate(false); setEditing(null) }}
          onSaved={(msg) => { flash(msg); setShowCreate(false); setEditing(null); load() }}
        />
      )}
    </main>
  )
}

function ComboForm({ combo, allItems, onClose, onSaved }) {
  const [draft, setDraft] = useState({
    name: combo?.name || '',
    description: combo?.description || '',
    combo_price: combo?.combo_price || '',
    items: combo?.items?.map((ci) => ({
      menu_item_id: ci.menu_item_id,
      quantity: ci.quantity,
      item_name: ci.item_name,
      item_price: ci.item_price,
    })) || [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const addItem = (item) => {
    if (draft.items.find((ci) => ci.menu_item_id === item.id)) return
    setDraft({
      ...draft,
      items: [...draft.items, {
        menu_item_id: item.id,
        quantity: 1,
        item_name: item.name,
        item_price: item.price,
      }],
    })
  }

  const removeItem = (idx) => {
    setDraft({ ...draft, items: draft.items.filter((_, i) => i !== idx) })
  }

  const updateQty = (idx, qty) => {
    const items = [...draft.items]
    items[idx] = { ...items[idx], quantity: Math.max(1, Math.min(5, qty)) }
    setDraft({ ...draft, items })
  }

  const save = async () => {
    if (!draft.name.trim()) { setError('Combo name is required'); return }
    if (draft.items.length === 0) { setError('Add at least one item'); return }
    try {
      setLoading(true)
      setError('')
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        combo_price: Number(draft.combo_price),
        items: draft.items.map((ci) => ({
          menu_item_id: ci.menu_item_id,
          quantity: ci.quantity,
        })),
      }
      if (combo) {
        await api.put(`/admin/combo-packs/${combo.id}`, payload)
        onSaved(`✏️ ${draft.name} updated`)
      } else {
        await api.post('/admin/combo-packs', payload)
        onSaved(`✅ ${draft.name} created`)
      }
    } catch (err) {
      setError(errMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const originalTotal = draft.items.reduce((s, ci) => s + (ci.item_price || 0) * ci.quantity, 0)
  const savings = Math.max(0, originalTotal - Number(draft.combo_price || 0))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{combo ? 'Edit Combo' : 'New Combo Pack'}</h2>
          <button onClick={onClose} className="text-2xl text-neutral-400 hover:text-neutral-700">×</button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="space-y-3">
          <input className="input" placeholder="Combo name" value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="input" placeholder="Description (optional)" value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <input className="input" type="number" min="1" step="1" placeholder="Combo price (₹)"
            value={draft.combo_price}
            onChange={(e) => setDraft({ ...draft, combo_price: e.target.value })} />

          {Number(draft.combo_price) > 0 && draft.items.length > 0 && (
            <div className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-500">
              Items total: <span className="font-semibold">{fmtINR(originalTotal)}</span>
              {' · '}
              Combo price: <span className="font-semibold text-brand-red">{fmtINR(draft.combo_price)}</span>
              {savings > 0 && (
                <span className="ml-2 font-bold text-green-600">Save {fmtINR(savings)}</span>
              )}
            </div>
          )}

          {/* Selected items */}
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
              Items in combo ({draft.items.length})
            </p>
            {draft.items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-300 p-3 text-center text-xs text-neutral-400">
                Select items from the list below
              </p>
            ) : (
              <div className="space-y-1.5">
                {draft.items.map((ci, idx) => (
                  <div key={ci.menu_item_id} className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2.5 py-2">
                    <span className="min-w-0 flex-1 text-sm font-medium truncate">{ci.item_name}</span>
                    <span className="text-xs text-neutral-400">{fmtINR(ci.item_price)}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(idx, ci.quantity - 1)}
                        className="h-6 w-6 rounded border border-neutral-300 text-xs font-bold hover:bg-red-50">−</button>
                      <span className="w-5 text-center text-sm font-semibold">{ci.quantity}</span>
                      <button onClick={() => updateQty(idx, ci.quantity + 1)}
                        className="h-6 w-6 rounded border border-neutral-300 text-xs font-bold hover:bg-red-50">+</button>
                    </div>
                    <button onClick={() => removeItem(idx)}
                      className="text-neutral-400 hover:text-red-500 text-xs">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Item picker */}
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-neutral-500">Add items</p>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-neutral-200 p-2 space-y-1">
              {allItems.map((item) => {
                const added = draft.items.find((ci) => ci.menu_item_id === item.id)
                return (
                  <button
                    key={item.id}
                    onClick={() => !added && addItem(item)}
                    disabled={!!added}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                      added
                        ? 'bg-green-50 text-green-600 cursor-default'
                        : 'hover:bg-neutral-50'
                    }`}
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="ml-2 shrink-0 text-neutral-400">{fmtINR(item.price)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={save} disabled={loading} className="btn-primary flex-1">
            {loading ? 'Saving…' : combo ? 'Save Changes' : 'Create Combo'}
          </button>
        </div>
      </div>
    </div>
  )
}
