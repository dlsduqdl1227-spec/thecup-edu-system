// Rasterize the existing coffee-cup favicon; no replacement logo or external artwork.
import {readFile,mkdir} from 'node:fs/promises';
import sharp from 'sharp';
await mkdir('public/icons',{recursive:true});
const svg=await readFile('public/favicon.svg');
for(const size of [192,512])await sharp(svg,{density:384}).resize(size,size).png().toFile(`public/icons/app-${size}.png`);
await sharp(svg,{density:384}).resize(180,180).png().toFile('public/icons/apple-touch-180.png');
const badge=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M16 19h28v17c0 8-6 13-14 13s-14-5-14-13V19zm28 4h5c7 0 7 15 0 15h-6M13 53h35" fill="none" stroke="white" stroke-width="4" stroke-linejoin="round"/></svg>');
await sharp(badge,{density:192}).resize(96,96).png().toFile('public/icons/badge-96.png');
console.log('Existing favicon rasterized into install and notification icons.');
