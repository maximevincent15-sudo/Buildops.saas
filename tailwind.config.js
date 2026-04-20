/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-2': 'var(--bg2)',
        'bg-3': 'var(--bg3)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink2)',
        'ink-3': 'var(--ink3)',
        acc: 'var(--acc)',
        'acc-2': 'var(--acc2)',
        wht: 'var(--wht)',
        brd: 'var(--brd)',
        'brd-2': 'var(--brd2)',
        grn: 'var(--grn)',
        'grn-lt': 'var(--grn-lt)',
        org: 'var(--org)',
        'org-lt': 'var(--org-lt)',
        red: 'var(--red)',
        'red-lt': 'var(--red-lt)',
        brn: 'var(--brn)',
        'brn-lt': 'var(--brn-lt)',
        gry: 'var(--gry)',
        'gry-lt': 'var(--gry-lt)',
      },
      fontFamily: {
        display: ['"Syne"', 'sans-serif'],
        sans: ['"DM Sans"', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '10px',
        lg: '18px',
      },
      boxShadow: {
        acc: '0 4px 18px rgba(58,92,168,.28)',
        'acc-lg': '0 7px 24px rgba(58,92,168,.35)',
      },
    },
  },
  plugins: [],
}
