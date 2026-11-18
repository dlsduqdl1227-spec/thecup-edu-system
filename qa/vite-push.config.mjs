import {fileURLToPath} from 'node:url';
import config from './vite.config.mjs';
const pushConfig={...config,resolve:{...config.resolve,alias:{'cloudflare:workers':fileURLToPath(new URL('./push-env.mjs',import.meta.url))}},server:{...config.server,port:5177}};
export default pushConfig;
