import { useCallback, useEffect, useRef, useState } from 'react'
import api, { errMessage } from '../../api/client'
import { fmtINR, itemImage } from '../../constants'

const EMPTY_FORM = {
  name: '',
  price: '',
  category_id: '',
  description: '',
  is_available: true,
  image_url: '',
}

export default function ManageMenuPage() {
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)

  const load = useCallback(
    () =>
      api
        .get('/menu/categories')
        .then((r) => setCategories(r.data.categories))
        .catch((e) => setError(errMessage(e))),
    [],
  )

  useEffect(() => {
    load()
  }, [load])

  const flash = (msg) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 4000)
  }

  const addItem = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api.post('/admin/menu-items', {
        ...form,
        price: Number(form.price),
        category_id: Number(form.category_id),
      })
      setForm(EMPTY_FORM)
      flash('✅ Item added to the menu')
      load()
    } catch (err) {
      setError(errMessage(err))
    }
  }

  const saveEdit = async (item) => {
    try {
      await api.put(`/admin/menu-items/${item.id}`, {
        name: item.name,
        description: item.description || '',
        price: Number(item.price),
        category_id: Number(item.category_id),
        is_available: item.is_available,
        image_url: item.image_url || '',
      })
      flash(`✏️ ${item.name} updated`)
      setEditing(null)
      load()
    } catch (err) {
      alert(errMessage(err))
    }
  }

  const toggleAvailability = async (item) => {
    try {
      await api.put(`/admin/menu-items/${item.id}`, { is_available: !item.is_available })
      load()
    } catch (err) {
      alert(errMessage(err))
    }
  }

  const removeItem = async (item) => {
    if (!window.confirm(`Remove '${item.name}' from the menu permanently?`)) return
    try {
      await api.delete(`/admin/menu-items/${item.id}`)
      flash(`🗑️ ${item.name} removed`)
      load()
    } catch (err) {
      alert(errMessage(err))
    }
  }

  const addCategory = async () => {
    const name = window.prompt('New category name:')
    if (!name) return
    try {
      await api.post('/admin/categories', { name })
      load()
    } catch (err) {
      alert(errMessage(err))
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Manage Menu</h1>
        <button onClick={addCategory} className="btn-secondary !py-2 text-xs">
          + Category
        </button>
      </div>

      {message && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <form onSubmit={addItem} className="card mb-6 grid gap-3 p-4 sm:grid-cols-2">
        <input
          className="input sm:col-span-2"
          placeholder="Item name (e.g. Chilli Paneer Pizza)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className="input"
          type="number"
          min="1"
          step="0.01"
          placeholder="Price (₹)"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          required
        />
        <select
          className="input"
          value={form.category_id}
          onChange={(e) => setForm({ ...form, category_id: e.target.value })}
          required
        >
          <option value="">Select category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          className="input sm:col-span-2"
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <button className="btn-primary sm:col-span-2">+ Add Menu Item</button>
        <p className="sm:col-span-2 -mt-1 text-xs text-neutral-500">
          💡 New items get an auto-assigned image. Click ✏️ Edit on any row to change name, price, or upload a custom image.
        </p>
      </form>

      {categories.map((cat) => (
        <section key={cat.id} className="mb-6">
          <h2 className="mb-2 font-display text-lg font-bold">{cat.name}</h2>
          <div className="card divide-y divide-neutral-100">
            {cat.items.map((item) => (
              <MenuRow
                key={item.id}
                item={item}
                onToggle={toggleAvailability}
                onRemove={removeItem}
                onEdit={() => setEditing(item)}
              />
            ))}
          </div>
        </section>
      ))}

      {editing && (
        <ItemEditModal
          item={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}
    </main>
  )
}

function MenuRow({ item, onToggle, onRemove, onEdit }) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-3">
      <img
        src={itemImage(item)}
        alt={item.name}
        className="h-14 w-14 flex-shrink-0 rounded-lg object-cover ring-1 ring-neutral-200"
        onError={(e) => { e.currentTarget.src = '/assets/menu/pizza_01.png' }}
      />
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${item.is_available ? '' : 'text-neutral-400 line-through'}`}>
          {item.name}
        </p>
        {item.description && <p className="truncate text-xs text-neutral-500">{item.description}</p>}
        <p className="text-xs text-neutral-400">{fmtINR(item.price)}</p>
      </div>

      <button
        onClick={onToggle}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
          item.is_available
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : 'bg-red-100 text-red-600 hover:bg-red-200'
        }`}
      >
        {item.is_available ? 'Available' : 'Sold out'}
      </button>

      <button
        onClick={onEdit}
        className="rounded-lg bg-brand-dark px-2.5 py-1.5 text-xs font-bold text-brand-gold hover:opacity-90"
        title="Edit name, price, image"
      >
        ✏️ Edit
      </button>

      <button
        onClick={() => onRemove(item)}
        className="text-neutral-400 transition hover:text-red-500"
        title="Delete item"
      >
        🗑️
      </button>
    </div>
  )
}

const GALLERY_FILES = [
  'pizza_01.png','pizza_02.png','pizza_03.png','pizza_04.png','pizza_05.png','pizza_06.png','pizza_07.png',
  'burger_01.png','burger_02.png','burger_03.png','burger_04.png','burger_05.png',
  'fried_food_01.png','fried_food_02.png','fried_food_03.png','fried_food_04.png',
  'fried_food_05.png','fried_food_06.png','fried_food_07.png',
  'pasta_wrap_01.png','pasta_wrap_02.png','pasta_wrap_03.png','pasta_wrap_04.png','pasta_wrap_05.png',
  'dessert_01.png','dessert_02.png','dessert_03.png','dessert_04.png','dessert_05.png',
  'drink_01.png','drink_02.png','drink_03.png','drink_04.png','drink_05.png',
]

function ItemEditModal({ item, categories, onClose, onSave }) {
  const [draft, setDraft] = useState({ ...item, price: String(item.price) })
  const [tab, setTab] = useState('gallery')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post(`/admin/menu-items/${draft.id}/image`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setDraft({ ...draft, image_url: res.data.image_url })
      setTab('gallery')
    } catch (err) {
      setUploadError(errMessage(err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Edit Item</h2>
          <button onClick={onClose} className="text-2xl text-neutral-400 hover:text-neutral-700">×</button>
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-xl bg-neutral-50 p-3">
          <img
            src={itemImage(draft)}
            alt="preview"
            className="h-20 w-20 flex-shrink-0 rounded-lg object-cover ring-1 ring-neutral-200"
            onError={(e) => { e.currentTarget.src = '/assets/menu/pizza_01.png' }}
          />
          <div>
            <p className="font-semibold">{draft.name || '(no name)'}</p>
            <p className="text-sm text-brand-red">{fmtINR(draft.price || 0)}</p>
            <p className="text-xs text-neutral-500">
              {draft.image_url ? `📁 ${draft.image_url}` : '🎨 Auto-assigned'}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Image</p>
          <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-neutral-100 p-1 text-xs">
            <TabBtn active={tab === 'gallery'} onClick={() => setTab('gallery')}>🎨 Gallery</TabBtn>
            <TabBtn active={tab === 'upload'} onClick={() => setTab('upload')}>📤 Upload</TabBtn>
            <TabBtn active={tab === 'url'} onClick={() => setTab('url')}>🔗 URL</TabBtn>
          </div>

          {tab === 'gallery' && (
            <div className="grid max-h-48 grid-cols-6 gap-1.5 overflow-y-auto rounded-lg border border-neutral-200 p-2">
              {GALLERY_FILES.map((f) => {
                const url = `/assets/menu/${f}`
                const selected = draft.image_url === url
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setDraft({ ...draft, image_url: url })}
                    className={`relative aspect-square overflow-hidden rounded-md ring-2 transition ${
                      selected ? 'ring-brand-red' : 'ring-transparent hover:ring-brand-gold'
                    }`}
                  >
                    <img src={url} alt={f} className="h-full w-full object-cover" />
                  </button>
                )
              })}
            </div>
          )}

          {tab === 'upload' && (
            <div className="rounded-lg border-2 border-dashed border-neutral-300 p-4 text-center">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFile}
                className="hidden"
                id="img-upload"
              />
              <label htmlFor="img-upload" className="btn-primary inline-block cursor-pointer !py-2 text-sm">
                {uploading ? 'Uploading…' : '📤 Choose Image (≤5 MB)'}
              </label>
              <p className="mt-2 text-xs text-neutral-500">PNG, JPG, WebP, GIF</p>
              {uploadError && (
                <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600">{uploadError}</p>
              )}
            </div>
          )}

          {tab === 'url' && (
            <input
              className="input"
              placeholder="https://example.com/image.jpg"
              value={draft.image_url?.startsWith('/uploads/') || draft.image_url?.startsWith('/assets/') ? '' : draft.image_url || ''}
              onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
            />
          )}

          {draft.image_url && (
            <button
              type="button"
              onClick={() => setDraft({ ...draft, image_url: '' })}
              className="mt-2 text-xs font-semibold text-neutral-500 hover:text-red-600"
            >
              ✕ Remove image (use auto-assigned)
            </button>
          )}
        </div>

        <div className="space-y-3">
          <input
            className="input"
            placeholder="Item name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input"
              type="number"
              min="1"
              step="0.01"
              placeholder="Price"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            />
            <select
              className="input"
              value={draft.category_id}
              onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <textarea
            className="input min-h-[60px]"
            placeholder="Description"
            value={draft.description || ''}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.is_available}
              onChange={(e) => setDraft({ ...draft, is_available: e.target.checked })}
            />
            Available for ordering
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => onSave(draft)} className="btn-primary flex-1">Save Changes</button>
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-1.5 font-semibold transition ${
        active ? 'bg-white text-brand-dark shadow' : 'text-neutral-500 hover:text-neutral-700'
      }`}
    >
      {children}
    </button>
  )
}



