import { STATUS_COLORS, STATUS_LABELS } from '../constants'

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[status] || 'bg-neutral-100 text-neutral-700 border-neutral-200'}`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  )
}
