# Tuloy Inn — Budget Hotel Website

A multi-page budget-inn website built with Vite + React + React Router.

## Pages
- **Home** — hero with a signature "price board", the honesty promise, room preview, amenities, testimonials
- **Rooms & Rates** — all 4 room types with full comparison + FAQ
- **Booking** — interactive form with a live rate calculator (nights × room rate) and a confirmation screen
- **About** — the inn's story, values, and neighborhood info
- **Contact** — contact form + direct info

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL (usually http://localhost:5173).

## Build for production

```bash
npm run build
```

Output goes to `dist/`. Deploy that folder to Vercel, Netlify, or any static host.

> If deploying to Vercel from a zip/subfolder, set **Root Directory** to the folder containing `package.json` in the project settings.

## Editing content

All room data (names, prices, beds, perks) lives in `src/data/rooms.js` — edit it once and it updates the price board, room cards, and booking dropdown everywhere.

## Design notes

- Palette: cream base, deep denim blue, marigold accent, kalamansi green, rust — chosen to feel warm and budget-honest rather than luxury-dark.
- Fonts: Fraunces (display), DM Sans (body), Space Mono (prices/labels), loaded via Google Fonts in `index.css`.
- Signature element: the "banig" (woven mat) stripe pattern used as section dividers, and the chalk-style price board on the homepage — nods to sari-sari store rate boards and honest, visible pricing.
