import { seedUsers } from "./users.seed";
import { seedClasses } from "./classes.seed";
import { seedLabs } from "./labs.seed";

export async function seedDatabase() {
  await seedUsers();
  await seedClasses();
  await seedLabs();
}
