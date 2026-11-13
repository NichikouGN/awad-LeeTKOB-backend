import { customType, timestamp } from "drizzle-orm/pg-core";
import { uuid } from "drizzle-orm/cockroach-core";

export const identity = (name: string) =>
  uuid(name).defaultRandom().primaryKey();
export const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
export const bytes = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
