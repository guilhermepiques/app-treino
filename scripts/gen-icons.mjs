// Gera os ícones PNG do app a partir de um SVG. Rodar com: npm run icons
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = '#141210'
const FG = '#ffb000'

const dumbbell = `
  <rect x="64" y="240" width="384" height="32" rx="10" fill="${FG}"/>
  <rect x="96" y="176" width="40" height="160" rx="12" fill="${FG}"/>
  <rect x="144" y="136" width="48" height="240" rx="14" fill="${FG}"/>
  <rect x="320" y="136" width="48" height="240" rx="14" fill="${FG}"/>
  <rect x="376" y="176" width="40" height="160" rx="12" fill="${FG}"/>`

const svg = ({ radius = 0, scale = 1 } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${BG}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${dumbbell}</g>
</svg>`

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/favicon.svg', svg({ radius: 112 }).trim())

const out = [
  ['apple-touch-icon.png', 180, svg({ scale: 0.86 })],
  ['icon-192.png', 192, svg({ radius: 42, scale: 0.86 })],
  ['icon-512.png', 512, svg({ radius: 112, scale: 0.86 })],
  ['icon-512-maskable.png', 512, svg({ scale: 0.7 })],
]
for (const [name, size, s] of out) {
  await sharp(Buffer.from(s)).resize(size, size).png().toFile(`public/icons/${name}`)
}
console.log('ícones gerados em public/icons')
