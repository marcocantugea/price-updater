/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        outer: '#707A68',
        surface: '#FAFBF6',
        sidebar: '#F4F7ED',
        header: '#DDECC8',
        active: '#E8F2D9',
        forest: '#314534',
        olive: '#66745C',
        line: '#DDE4D2',
        positive: '#7FA36B',
        contrast: '#C6A15B',
        danger: '#C96B5B'
      },
      boxShadow: {
        soft: '0 4px 20px -2px rgba(49, 69, 52, 0.05)',
        app: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      },
      fontFamily: {
        // 'Inter' is used when the font is installed locally; otherwise the
        // system stack applies. No remote font is fetched (offline builds).
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
};
