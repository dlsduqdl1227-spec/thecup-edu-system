// Input: user-owned rendered PDF pages. Output is ignored; never commit licensed originals.
// Provision the resulting SQL only after reviewing the three asset IDs and hashes.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const directory = resolve(process.argv[2] || 'outputs/sca-assets');
const ids = ['flavor-wheel-ko', 'sca-brewing-2019', 'sca-water'];
const statements = [], manifest = [];
for (const id of ids) {
  const data = await readFile(join(directory, `${id}.png`));
  if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || data.length > 1900000) throw new Error(`Invalid or oversized PNG: ${id}`);
  const sha = createHash('sha256').update(data).digest('hex');
  // Remains unavailable until the last statement marks the upload complete.
  statements.push(`INSERT INTO edu_assets (id,mime,data,sha256) VALUES ('${id}','image/png',X'','') ON CONFLICT(id) DO UPDATE SET data=X'',sha256='';`);
  for (let i=0;i<data.length;i+=20000) statements.push(`UPDATE edu_assets SET data=CAST(data||X'${data.subarray(i,i+20000).toString('hex')}' AS BLOB) WHERE id='${id}';`);
  statements.push(`UPDATE edu_assets SET sha256='${sha}' WHERE id='${id}' AND length(data)=${data.length};`);
  manifest.push({ id, bytes:data.length, sha256:sha });
}
await mkdir(directory,{recursive:true});
await writeFile(join(directory,'provision.sql'), statements.join('\n'));
await writeFile(join(directory,'manifest.json'), JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest,null,2));
