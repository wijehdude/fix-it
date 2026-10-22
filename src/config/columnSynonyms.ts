/** Canonical fields a source column can be mapped to. */
export const CANONICAL_FIELDS = [
  "description",
  "location",
  "reportedAt",
  "respondedAt",
  "completedAt",
  "status",
  "reportedBy",
  "assetOrEquipment",
  "actionTaken",
  "originalPriority",
  "legacyCategory",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export const DATE_FIELDS: CanonicalField[] = ["reportedAt", "respondedAt", "completedAt"];
export const REQUIRED_FIELDS: CanonicalField[] = ["description", "reportedAt"];

export const FIELD_LABELS: Record<CanonicalField, string> = {
  description: "Description",
  location: "Location",
  reportedAt: "Reported at",
  respondedAt: "Responded at",
  completedAt: "Completed at",
  status: "Status",
  reportedBy: "Reported by",
  assetOrEquipment: "Asset / equipment",
  actionTaken: "Action taken / remarks",
  originalPriority: "Original priority",
  legacyCategory: "Legacy category column",
};

/**
 * Header synonyms. `strong` synonyms identify the field on their own;
 * `weak` synonyms are generic words (e.g. "date") that only win when nothing stronger matches.
 * Matching is case-insensitive and ignores punctuation.
 */
export const COLUMN_SYNONYMS: Record<CanonicalField, { strong: string[]; weak: string[] }> = {
  description: {
    strong: ["description", "defect", "fault", "issue", "problem", "feedback", "details", "complaint", "nature of complaint", "defect description", "fault description"],
    weak: ["remarks", "subject", "summary", "comments"],
  },
  location: {
    strong: ["location", "area", "level", "floor", "room", "zone", "block", "unit", "venue", "site"],
    weak: ["place", "building"],
  },
  reportedAt: {
    strong: ["reported", "date reported", "report date", "reported date", "created", "logged", "received", "date time reported", "reported on", "report time", "time reported"],
    weak: ["date time", "date", "time", "timestamp", "datetime"],
  },
  respondedAt: {
    strong: ["responded", "response", "attended", "acknowledged", "arrival", "arrived", "response time", "attended time"],
    weak: ["ack"],
  },
  completedAt: {
    strong: ["completed", "closed", "rectified", "resolved", "finish", "finished", "done", "completion", "close date", "date completed"],
    weak: ["end"],
  },
  status: {
    strong: ["status", "state", "job status", "case status"],
    weak: ["progress", "open closed"],
  },
  reportedBy: {
    strong: ["reported by", "requestor", "requester", "reporter", "complainant", "raised by", "contact person", "caller", "user"],
    weak: ["name", "contact"],
  },
  assetOrEquipment: {
    strong: ["asset", "equipment", "asset no", "equipment id", "asset tag", "system", "item"],
    weak: ["tag", "model"],
  },
  actionTaken: {
    strong: ["action taken", "action", "rectification", "work done", "resolution", "technician remarks", "follow up", "rectification notes"],
    weak: ["remarks", "notes", "comments"],
  },
  originalPriority: {
    strong: ["priority", "urgency", "severity", "criticality"],
    weak: ["level of urgency"],
  },
  legacyCategory: {
    strong: ["category", "type", "defect type", "fault type", "trade", "discipline"],
    weak: ["group", "class"],
  },
};

/** Synonyms that look like a time-only column (used to offer date + time combination). */
export const TIME_ONLY_HINTS = ["time", "hour", "hh mm"];
