import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const organizationUnits = sqliteTable("organization_units", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const workUnits = sqliteTable("work_units", {
  id: text("id").primaryKey(),
  organizationUnitId: text("organization_unit_id").notNull().references(() => organizationUnits.id),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
}, (table) => [index("work_units_org_idx").on(table.organizationUnitId)]);

export const rkaDocuments = sqliteTable("rka_documents", {
  id: text("id").primaryKey(),
  fiscalYear: integer("fiscal_year").notNull(),
  organizationUnitId: text("organization_unit_id").notNull().references(() => organizationUnits.id),
  workUnitId: text("work_unit_id").notNull().references(() => workUnits.id),
  revisionNumber: integer("revision_number").notNull().default(0),
  status: text("status").notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
}, (table) => [index("rka_documents_unit_idx").on(table.workUnitId)]);

export const rkaItems = sqliteTable("rka_items", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => rkaDocuments.id),
  basCode: text("bas_code").notNull(),
  program: text("program").notNull(),
  activity: text("activity").notNull(),
  description: text("description").notNull(),
  quantity: real("quantity").notNull(),
  unit: text("unit").notNull(),
  unitPrice: integer("unit_price").notNull(),
  totalAmount: integer("total_amount").notNull(),
  evaluationStatus: text("evaluation_status").notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
}, (table) => [index("rka_items_document_idx").on(table.documentId), index("rka_items_status_idx").on(table.evaluationStatus)]);

export const priceReferences = sqliteTable("price_references", {
  id: text("id").primaryKey(),
  fiscalYear: integer("fiscal_year").notNull(),
  itemName: text("item_name").notNull(),
  unit: text("unit").notNull(),
  referencePrice: integer("reference_price").notNull(),
  sourceName: text("source_name").notNull(),
  isSynthetic: integer("is_synthetic", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const riskAssessments = sqliteTable("risk_assessments", {
  id: text("id").primaryKey(),
  rkaItemId: text("rka_item_id").notNull().references(() => rkaItems.id),
  score: integer("score").notNull(),
  category: text("category").notNull(),
  engineVersion: text("engine_version").notNull(),
  dataCompleteness: text("data_completeness").notNull(),
  assessedAt: integer("assessed_at", { mode: "timestamp_ms" }).notNull()
}, (table) => [uniqueIndex("risk_assessment_item_unique").on(table.rkaItemId), index("risk_assessment_category_idx").on(table.category)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  detail: text("detail").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
}, (table) => [index("audit_logs_entity_idx").on(table.entityType, table.entityId)]);
