/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary Action Color
        primary: '#2563EB',
        
        // Backgrounds
        'background-light': '#F9FAFB',
        'background-dark': '#111827',
        
        // Surfaces (cards, bubbles, inputs)
        'surface-light': '#FFFFFF',
        'surface-dark': '#1F2937',
        
        // Text
        'text-light': '#1F2937',
        'text-dark': '#E2E8F0',
        
        // Muted / Hint
        'muted-light': '#6B7280',
        'muted-dark': '#9CA3AF',
        'hint-light': '#EFF6FF',
        'hint-dark': 'rgba(37, 99, 235, 0.1)',

        // Legacy
        secondary: '#00C48C',
        
        // Borders
        'divider-light': '#E5E7EB',
        'divider-dark': '#374151',
      },
      fontFamily: {
        sans: ["-apple-system", "SF Pro Text", "Inter", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        khmer: ['Noto Sans Khmer', 'sans-serif'],
      },
      borderRadius: {
        sm: '10px',
        md: '14px',
        lg: '18px',
        xl: '22px',
      },
      boxShadow: {
        'elev-1': '0 6px 20px rgba(12, 16, 24, 0.06)',
        'elev-2': '0 10px 30px rgba(12, 16, 24, 0.08)',
        'focus-ring': '0 0 0 3px rgba(37, 99, 235, 0.3)',
        'inner-sm': 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
      transitionTimingFunction: {
        'ios': 'cubic-bezier(.2, .9, .3, 1)',
      },
      transitionDuration: {
        'fast': '200ms',
        'normal': '300ms',
        'slow': '400ms',
      },
      fontSize: {
        'base': ['15px', '1.45'],
      },
    },
  },
  plugins: [],
}