import { seedDatabase } from "./seed/index";

await seedDatabase();
console.log("Database seeds applied");
process.exit(0);
