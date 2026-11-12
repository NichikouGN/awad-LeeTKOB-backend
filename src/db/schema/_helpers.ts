import { bigint, customType, timestamp } from "drizzle-orm/pg-core";

export const identity = (name: string) =>
  bigint(name, { mode: "number" }).generatedByDefaultAsIdentity().primaryKey();
export const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
export const bytes = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
