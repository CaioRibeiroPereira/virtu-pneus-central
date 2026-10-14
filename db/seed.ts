// Uso: npm run db:seed  (lê DATABASE_URL do .env.local)
import { getDb } from "./index";
import { resetDemoData } from "./reset";

const summary = await resetDemoData(getDb());
console.log("Seed aplicado para o dia", summary.today);
console.table(summary);
