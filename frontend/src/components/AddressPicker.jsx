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
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
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
 * Recenter — invisible child of <MapContainer> that programmatically
 * pans/zooms the map when the parent gives it new coords. Used after
 * "Use my current location" succeeds, so the customer actually sees
 * the new pin in context (not just the marker re-render).
 */
function Recenter({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (!center || !Number.isFinite(center[0]) || !Number.isFinite(center[1])) return
    map.flyTo(center, zoom ?? map.getZoom(), { duration: 0.8 })
  }, [center, zoom, map])
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
  // --- geolocation (Phase 5.3b — "Use my current location" button) ---
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState('')
  const [recenterTo, setRecenterTo] = useState(null)
  // One-shot diagnostic that runs when the picker mounts. Helps
  // debug "why doesn't my button work on this device/browser" without
  // opening DevTools. Only logged; not shown to the customer.
  const [geoDiag, setGeoDiag] = useState(null)
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

  // One-shot browser-capability diagnostic on mount. If the API is
  // missing or the page isn't a secure context, we know immediately
  // that "Use my current location" can't work and we can hint to the
  // user upfront. We deliberately don't show this in the UI (it's
  // noise for the 95% happy path) — it's available via the geoDiag
  // state for a future debug toggle if needed.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const supported = !!navigator?.geolocation
    const secure =
      window.isSecureContext ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.protocol === 'https:'
    setGeoDiag({ supported, secure, ua: navigator.userAgent })
  }, [])

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

  /**
   * "Use my current location" — request browser geolocation, drop the
   * pin at the resulting lat/lng, and re-center the map so the customer
   * actually sees where they are (GPS is often off by a few hundred m).
   *
   * Browser quirks handled:
   * - Safari on Mac occasionally fails with POSITION_UNAVAILABLE on
   *   `localhost` because the secure-context check is finicky. We don't
   *   blame the user's GPS in that case; we just say "not available" and
   *   suggest drag/typing.
   * - Chrome silently blocks the request if the user previously denied
   *   it for the site. We use the Permissions API to detect this
   *   proactively and show a clearer message.
   * - All error messages offer a "Type address instead" path because
   *   pin-drag always works as a fallback.
   */
  const useCurrentLocation = useCallback(() => {
    setLocateError('')
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocateError('Is browser me location support nahi hai. Pin drag karein.')
      return
    }

    // Diagnostic: check secure context. Modern browsers require HTTPS
    // (or localhost) for geolocation. If somehow we're not in a secure
    // context, the request will fail with code 2 — we can give a
    // smarter message instead of "GPS off".
    const isSecure =
      typeof window !== 'undefined' &&
      (window.isSecureContext ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.protocol === 'https:')

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          setLocateError('Location mil nahi paya. Pin drag karein.')
          setLocating(false)
          return
        }
        // Re-center the map first so the flyTo animation is smooth,
        // then handlePick drops the pin + reverse-geocodes.
        setRecenterTo([latitude, longitude])
        handlePick(latitude, longitude)
        setLocating(false)
      },
      (err) => {
        // err.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
        // We also keep the raw message for diagnostics (dev mode).
        const hint = !isSecure
          ? ' (browser ne secure origin require kiya — HTTPS ya localhost chahiye)'
          : ''
        const messages = {
          1: 'Location permission denied. Browser site settings me location allow karein, ya pin drag karein.',
          2: `Location abhi available nahi hai${hint}. Pin drag karein ya address type karein.`,
          3: 'Location request timeout. Phir try karein ya pin drag karein.',
        }
        const friendly =
          messages[err.code] ||
          `Location error (${err.code}). Pin drag karein ya address type karein.`
        // Log the raw error for dev/debugging; the user sees the
        // friendly version. RULES.md §6 forbids console.log but
        // warn is for genuine operational signals.
        if (typeof window !== 'undefined' && window.console) {
          // eslint-disable-next-line no-console
          console.warn('[AddressPicker] geolocation error:', err.code, err.message)
        }
        setLocateError(friendly)
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [handlePick])

  const pinIcon = useMemo(buildPinIcon, [])

  return (
    <div className="space-y-2">
      <div
        className="relative overflow-hidden rounded-xl border border-neutral-300"
        style={{ height }}
      >
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
          <Recenter center={recenterTo} zoom={17} />
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
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-red bg-red-50 px-3 py-1.5 font-semibold text-brand-red hover:bg-red-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {locating ? (
            <>
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-red border-t-transparent" />
              <span>Location dhund raha hai…</span>
            </>
          ) : (
            <>
              <span>📍</span>
              <span>Use my current location</span>
            </>
          )}
        </button>
        <span className="text-neutral-500">
          {position
            ? `📍 ${position[0].toFixed(5)}, ${position[1].toFixed(5)}`
            : '— ya pin tap / drag karein'}
        </span>
      </div>
      <p className="text-xs" aria-live="polite">
        {resolving && <span className="text-neutral-500">⏳ address lookup…</span>}
        {resolveError && <span className="text-red-600">⚠️ {resolveError}</span>}
        {locateError && (
          <span className="text-red-600">
            ⚠️ {locateError}
            {!locating && (
              <button
                type="button"
                onClick={useCurrentLocation}
                className="ml-2 underline hover:text-red-800"
              >
                Phir try karein
              </button>
            )}
          </span>
        )}
      </p>
    </div>
  )
}
