import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: '#E9426C', // Pink-Red
        accent: '#BC358B', // Purple-Magenta
        dark: '#191919', // Dark Charcoal
        light: '#FAFAFA', // White
        navy: '#2A4E7B',
        indigo: '#4D519E',
        violet: '#8C4E99',
        cyanblue: '#3B92B3',
        sky: '#64C6E6'
      },
      boxShadow: {
        'elevated': '0 10px 30px rgba(0,0,0,0.25)'
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem'
      }
    }
  },
  plugins: []
};

export default config;



