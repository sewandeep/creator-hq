import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
export type Brand = Tables["brands"]["Row"];
export type Contact = Tables["contacts"]["Row"];
export type Deal = Tables["deals"]["Row"];
export type Deliverable = Tables["deliverables"]["Row"];
export type Activity = Tables["activities"]["Row"];
export type DealFile = Tables["deal_files"]["Row"];
