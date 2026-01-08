/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      backgroundImage: {
        'layout-bg': 'linear-gradient(to bottom right, #f8fafc 0%, #f1f5f9 50%, #f8fafc 100%)',
      },
      dark: {
        backgroundImage: {
          'layout-bg': 'linear-gradient(to bottom right, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        },
      },
    },
  },
}
