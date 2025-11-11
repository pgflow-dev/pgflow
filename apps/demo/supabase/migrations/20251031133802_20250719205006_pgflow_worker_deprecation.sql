-- Rename a column from "stopped_at" to "deprecated_at"
ALTER TABLE "pgflow"."workers" RENAME COLUMN "stopped_at" TO "deprecated_at";
