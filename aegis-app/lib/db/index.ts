import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// During build, DATABASE_URL may not be set — use a placeholder to avoid crash
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://placeholder:placeholder@placeholder.neon.tech/placeholder";

const sql = neon(databaseUrl);

export const db = drizzle(sql, { schema });

export type DB = typeof db;
