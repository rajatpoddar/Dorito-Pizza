import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const CartContext = createContext(null)
const STORAGE_KEY = 'dorito_cart'

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const addItem = (menuItem, qty = 1) =>
    setItems((prev) => {
      const found = prev.find((i) => i.id === menuItem.id)
      if (found) {
        return prev.map((i) =>
          i.id === menuItem.id ? { ...i, quantity: Math.min(20, i.quantity + qty) } : i,
        )
      }
      // Preserve the fields the rest of the UI needs to render this item
      // (image, category). Without these, the order summary on the checkout
      // page falls back to a broken bucket-image URL.
      return [
        ...prev,
        {
          id: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          quantity: qty,
          image_url: menuItem.image_url || null,
          category_name: menuItem.category_name || null,
        },
      ]
    })

  const updateQty = (id, quantity) =>
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.id !== id)
        : prev.map((i) => (i.id === id ? { ...i, quantity: Math.min(20, quantity) } : i)),
    )

  const removeItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id))
  const clear = () => setItems([])

  const count = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items])
  const total = useMemo(
    () => items.reduce((s, i) => s + i.price * i.quantity, 0),
    [items],
  )

  return (
    <CartContext.Provider
      value={{ items, addItem, updateQty, removeItem, clear, count, total }}
    >
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
