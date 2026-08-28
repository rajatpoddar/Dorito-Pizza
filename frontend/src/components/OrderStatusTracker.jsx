import { STATUS_FLOW } from '../constants'

/** Vertical live status tracker used on the customer tracking page. */
export default function OrderStatusTracker({ status }) {
  if (status === 'cancelled') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
        ❌ This order was cancelled.
      </div>
    )
  }

  const activeIndex = STATUS_FLOW.findIndex((s) => s.key === status)

  return (
    <ol className="space-y-0">
      {STATUS_FLOW.map((step, idx) => {
        const done = idx < activeIndex
        const active = idx === activeIndex
        return (
          <li key={step.key} className="relative flex gap-3 pb-6 last:pb-0">
            {/* connector */}
            {idx < STATUS_FLOW.length - 1 && (
              <span
                className={`absolute left-[15px] top-8 h-full w-0.5 ${done ? 'bg-green-500' : 'bg-neutral-200'}`}
              />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition ${
                done
                  ? 'bg-green-500 text-white'
                  : active
                    ? 'bg-brand-red text-white ring-4 ring-red-100'
                    : 'bg-neutral-200 text-neutral-500'
              }`}
            >
              {done ? '✓' : step.icon}
            </span>
            <div className="pt-1">
              <p className={`text-sm font-semibold ${active ? 'text-brand-red' : done ? 'text-green-700' : 'text-neutral-500'}`}>
                {step.label}
                {active && <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-brand-red" />}
              </p>
              {active && (
                <p className="text-xs text-neutral-400">Current status — updating live…</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
