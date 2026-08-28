import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/** Registration moved to the OTP flow — this page redirects there. */
export default function RegisterPage() {
  const navigate = useNavigate()
  useEffect(() => navigate('/login', { replace: true }), [navigate])
  return null
}
