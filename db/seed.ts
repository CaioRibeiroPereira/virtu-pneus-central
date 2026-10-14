// Uso: npm run db:seed  (lê DATABASE_URL do .env.local)
import { withTransactionalDb } from "./index";
import { resetDemoData } from "./reset";

const summary = await withTransactionalDb((db) => resetDemoData(db));
console.log("Seed aplicado para o dia", summary.today);
console.table(summary);
