/** Genera los iconos PNG de la PWA a partir del monograma (npm run icons). */
import sharp from 'sharp';

const mark = (size: number, pad: number) => {
	const inner = size - pad * 2;
	const s = inner / 32;
	return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="#111111"/>
<g transform="translate(${pad} ${pad}) scale(${s})"><path d="M11 24V8h6.2c3.6 0 5.8 2 5.8 5.1S20.8 18.3 17.2 18.3H14V24zm3-8.4h3c1.8 0 2.9-.9 2.9-2.5S18.8 10.7 17 10.7h-3z" fill="#ffffff"/></g></svg>`);
};

const out: [string, number, number][] = [
	['static/icons/icon-192.png', 192, 0],
	['static/icons/icon-512.png', 512, 0],
	// Maskable: el logotipo dentro de la zona segura (80 % central).
	['static/icons/maskable-192.png', 192, 38],
	['static/icons/maskable-512.png', 512, 102],
	['static/icons/apple-touch-icon.png', 180, 18]
];
for (const [file, size, pad] of out) await sharp(mark(size, pad)).png().toFile(file);
console.info(`${out.length} iconos generados`);
