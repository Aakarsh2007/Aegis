import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL || "postgresql://placeholder:placeholder@localhost/placeholder";
const sql = neon(databaseUrl);

export const db = drizzle(sql, { schema });

export type DB = typeof db;
