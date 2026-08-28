/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#e11d2e',
          'red-dark': '#b31623',
          dark: '#121212',
          'ink': '#1a1a1a',
          gold: '#d4af37',
          goldlight: '#f0d67c',
          cream: '#fff8ed',
        },
      },
      fontFamily: {
        // Premium, modern sans for body (loads from Google Fonts in index.html)
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Premium display serif for headings
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        // Devanagari / Hinglish friendly — fall back to Noto Sans
        hindi: ['"Plus Jakarta Sans"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)',
        'pop': '0 10px 30px rgba(225, 29, 46, 0.18)',
        'gold': '0 6px 22px rgba(212, 175, 55, 0.28)',
      },
      backgroundImage: {
        'hero-pattern': "radial-gradient(circle at 20% 20%, rgba(225,29,46,0.18), transparent 35%), radial-gradient(circle at 80% 70%, rgba(212,175,55,0.18), transparent 35%)",
        'shimmer': "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)",
      },
      animation: {
        'shimmer': 'shimmer 1.6s ease-in-out infinite',
        'marquee': 'marquee 30s linear infinite',
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        pulseSoft: { '0%, 100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.05)' } },
      },
    },
  },
  plugins: [],
}
