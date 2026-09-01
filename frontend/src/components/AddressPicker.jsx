/**
 * AddressPicker — Leaflet + OpenStreetMap pin selector.
 *
 * Used by CheckoutPage and AccountPage. The customer drags the pin (or
 * taps a saved address) → we capture lat/lng → optionally reverse-geocode
 * to a human-readable address via /api/geocode/reverse.
 *
 * Why we wrap react-leaflet:
 *  - v4 dropped the default icon assets path, so the marker pin is broken
 *    unless you set `L.Icon.Default.imagePath` or pass an explicit icon.
 *    We use the explicit icon (`buildPinIcon`) so the marker is visible.
 *  - We also debounce reverse-geocode so dragging doesn't hit Nominatim
 *    at the 60 fps the marker fires during a drag.
 *
 * No API keys, no paid tile providers — OpenStreetMap tiles + Nominatim
 * geocoding are free under the OSM usage policy. Rate-limited to 1 RPS
 * upstream; our /api/geocode/reverse proxy also caches by lat/lng.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api, { errMessage } from '../api/client'

// Shop default (Palojori, Jharkhand) — used when the picker first opens
// without an existing pin so the map lands on the shop's neighbourhood.
const SHOP_FALLBACK = { lat: 24.42, lng: 86.71 }

/** Build a fresh Leaflet DivIcon for the customer pin (red, brand-coloured). */
function buildPinIcon() {
  return L.divIcon({
    className: 'dorito-pin',
    html: `
      <div style="
        width:32px;height:32px;border-radius:50% 50% 50% 0;
        background:#e11d2e;transform:rotate(-45deg);
        box-shadow:0 4px 10px rgba(0,0,0,0.25);
        border:3px solid #fff;
      "></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  })
}

/**
 * ClickCapture — invisible child of <MapContainer> that listens for
 * map clicks (without marker drag) so we can drop the pin on tap.
 */
function ClickCapture({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

/**
 * @param {object}  props
 * @param {{lat:number|null, lng:number|null}} [props.value]
 *        Current pin location (controlled). Null = no pin yet.
 * @param {(loc:{lat:number, lng:number}) => void} props.onChange
 *        Fires on every pin drop (drag, click, or external sync).
 * @param {(address:string) => void} [props.onAddress]
 *        Optional. When the user drops a pin we fire reverse-geocode and
 *        pass the human-readable address string to the parent so it can
 *        pre-fill its textarea.
 * @param {number} [props.zoom]  Initial zoom (default 16 = street level).
 * @param {string}  [props.height] CSS height (default "260px").
 */
export default function AddressPicker({ value, onChange, onAddress, zoom = 16, height = '260px' }) {
  // Where the map opens on first render — prefer the existing pin,
  // otherwise the shop's neighbourhood so the customer immediately sees
  // a relevant area instead of the world view.
  const initialCenter = useMemo(() => {
    if (value && Number.isFinite(value.lat) && Number.isFinite(value.lng)) {
      return [value.lat, value.lng]
    }
    return [SHOP_FALLBACK.lat, SHOP_FALLBACK.lng]
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Current pin position (internal). When `value` changes from outside
  // (e.g. parent loaded a saved address), we sync the marker.
  const [position, setPosition] = useState(() =>
    value && Number.isFinite(value.lat) && Number.isFinite(value.lng)
      ? [value.lat, value.lng]
      : null,
  )
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState('')
  const debounceRef = useRef(null)
  const onAddressRef = useRef(onAddress)
  const onChangeRef = useRef(onChange)

  // Keep latest callback refs so the drag-end handler doesn't have to
  // depend on them (which would re-create the handler on every render).
  useEffect(() => {
    onAddressRef.current = onAddress
    onChangeRef.current = onChange
  }, [onAddress, onChange])

  // External sync: when the parent gives us a new pin (e.g. saved address
  // tapped), move the marker without firing onChange (would cause loops).
  useEffect(() => {
    if (
      value &&
      Number.isFinite(value.lat) &&
      Number.isFinite(value.lng) &&
      (!position || position[0] !== value.lat || position[1] !== value.lng)
    ) {
      setPosition([value.lat, value.lng])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  /**
   * Drop the pin + fire parent callbacks. Reverse-geocode is debounced
   * because Leaflet fires dragend every frame during a fast drag.
   */
  const handlePick = useCallback((lat, lng) => {
    const latN = Number(lat)
    const lngN = Number(lng)
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return

    setPosition([latN, lngN])
    setResolveError('')
    onChangeRef.current?.({ lat: latN, lng: lngN })

    // Debounce the reverse-geocode call so dragging doesn't spam Nominatim.
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!onAddressRef.current) return

    debounceRef.current = setTimeout(async () => {
      setResolving(true)
      try {
        const res = await api.get('/geocode/reverse', {
          params: { lat: latN, lng: lngN },
        })
        const name = res.data?.display_name || ''
        if (name) onAddressRef.current(name)
      } catch (err) {
        // Network / Nominatim errors: we don't want to break the UX.
        // The customer can still type the address manually.
        setResolveError(errMessage(err, 'Could not resolve address'))
      } finally {
        setResolving(false)
      }
    }, 600)
  }, [])

  const pinIcon = useMemo(buildPinIcon, [])

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-neutral-300" style={{ height }}>
        <MapContainer
          center={initialCenter}
          zoom={zoom}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <ClickCapture onPick={handlePick} />
          {position && (
            <Marker
              position={position}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng()
                  handlePick(lat, lng)
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <p className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          {position
            ? `📍 ${position[0].toFixed(5)}, ${position[1].toFixed(5)}`
            : '📍 Pin tap ya drag karein — address auto-fill ho jayega.'}
        </span>
        <span aria-live="polite">
          {resolving && '⏳ address lookup…'}
          {resolveError && <span className="text-red-600">⚠️ {resolveError}</span>}
        </span>
      </p>
    </div>
  )
}
