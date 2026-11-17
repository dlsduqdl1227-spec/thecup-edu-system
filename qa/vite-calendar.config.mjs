import config from './vite.config.mjs';
import {fileURLToPath} from 'node:url';
const calendarConfig={...config,resolve:{...config.resolve,alias:{'cloudflare:workers':fileURLToPath(new URL('./calendar-env.mjs',import.meta.url))}}};
export default calendarConfig;
