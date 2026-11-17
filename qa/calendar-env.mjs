// Local-only two-app QA. Never imported by the production build.
import {env as databaseEnv} from './sqlite-env.mjs';
export const env={...databaseEnv,BOOKING_AUTOMATION_ENABLED:'true',FLOW_CALENDAR_SECRET:'local-two-app-calendar-qa-secret-only',
 FLOW_CALENDAR:{fetch:(_input,options)=>fetch('http://127.0.0.1:5176/api/integrations/thecup-edu/calendar',options)}};
