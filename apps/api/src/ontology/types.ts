export type OntologyConceptKind = "entity_type" | "field_role" | "relation_type" | "event_category";
export type OntologyConceptState = "draft" | "tentative" | "confirmed" | "rejected" | "superseded";

export type OntologyConcept = {
  id: string;
  kind: OntologyConceptKind;
  label: string;
  description: string;
  capabilities: string[];
  examples: string[];
  confidence: number;
  state: OntologyConceptState;
  source: string;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
};
