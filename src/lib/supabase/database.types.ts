
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activities": {
                  Row: {
                    "body": string,"brand_id": string | null,"created_at": string,"deal_id": string | null,"id": string,"kind": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"brand_id"?: string | null,"created_at"?: string,"deal_id"?: string | null,"id"?: string,"kind": string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string,"brand_id"?: string | null,"created_at"?: string,"deal_id"?: string | null,"id"?: string,"kind"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activities_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activities_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["id"]
    }
                  ]
                },"brands": {
                  Row: {
                    "billing_address": string | null,"category": string | null,"created_at": string,"gstin": string | null,"id": string,"instagram": string | null,"legal_name": string | null,"name": string,"notes": string | null,"pan": string | null,"tan": string | null,"updated_at": string,"user_id": string,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_address"?: string | null,"category"?: string | null,"created_at"?: string,"gstin"?: string | null,"id"?: string,"instagram"?: string | null,"legal_name"?: string | null,"name": string,"notes"?: string | null,"pan"?: string | null,"tan"?: string | null,"updated_at"?: string,"user_id"?: string,"website"?: string | null
                  }
                  Update: {
                    "billing_address"?: string | null,"category"?: string | null,"created_at"?: string,"gstin"?: string | null,"id"?: string,"instagram"?: string | null,"legal_name"?: string | null,"name"?: string,"notes"?: string | null,"pan"?: string | null,"tan"?: string | null,"updated_at"?: string,"user_id"?: string,"website"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"contacts": {
                  Row: {
                    "brand_id": string | null,"created_at": string,"email": string | null,"id": string,"name": string,"notes": string | null,"phone": string | null,"role": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"phone"?: string | null,"role"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "brand_id"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"phone"?: string | null,"role"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contacts_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    }
                  ]
                },"deal_files": {
                  Row: {
                    "created_at": string,"deal_id": string,"id": string,"kind": string,"mime_type": string | null,"name": string,"size_bytes": number | null,"storage_path": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deal_id": string,"id"?: string,"kind"?: string,"mime_type"?: string | null,"name": string,"size_bytes"?: number | null,"storage_path": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"deal_id"?: string,"id"?: string,"kind"?: string,"mime_type"?: string | null,"name"?: string,"size_bytes"?: number | null,"storage_path"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deal_files_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["id"]
    }
                  ]
                },"deals": {
                  Row: {
                    "amount": number | null,"barter_value": number | null,"brand_id": string,"contact_id": string | null,"created_at": string,"deal_date": string,"due_date": string | null,"id": string,"is_barter": boolean,"lost_reason": string | null,"next_follow_up": string | null,"notes": string | null,"platform": string | null,"source": string | null,"stage": string,"stage_changed_at": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"barter_value"?: number | null,"brand_id": string,"contact_id"?: string | null,"created_at"?: string,"deal_date"?: string,"due_date"?: string | null,"id"?: string,"is_barter"?: boolean,"lost_reason"?: string | null,"next_follow_up"?: string | null,"notes"?: string | null,"platform"?: string | null,"source"?: string | null,"stage"?: string,"stage_changed_at"?: string,"title": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number | null,"barter_value"?: number | null,"brand_id"?: string,"contact_id"?: string | null,"created_at"?: string,"deal_date"?: string,"due_date"?: string | null,"id"?: string,"is_barter"?: boolean,"lost_reason"?: string | null,"next_follow_up"?: string | null,"notes"?: string | null,"platform"?: string | null,"source"?: string | null,"stage"?: string,"stage_changed_at"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deals_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deals_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    }
                  ]
                },"deliverables": {
                  Row: {
                    "created_at": string,"deal_id": string,"due_date": string | null,"id": string,"link": string | null,"notes": string | null,"platform": string | null,"posted_date": string | null,"quantity": number,"status": string,"type": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deal_id": string,"due_date"?: string | null,"id"?: string,"link"?: string | null,"notes"?: string | null,"platform"?: string | null,"posted_date"?: string | null,"quantity"?: number,"status"?: string,"type": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"deal_id"?: string,"due_date"?: string | null,"id"?: string,"link"?: string | null,"notes"?: string | null,"platform"?: string | null,"posted_date"?: string | null,"quantity"?: number,"status"?: string,"type"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deliverables_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["id"]
    }
                  ]
                },"email_log": {
                  Row: {
                    "attachment_name": string | null,"body": string,"brand_id": string | null,"cc_addresses": string | null,"created_at": string,"deal_id": string | null,"error": string | null,"id": string,"invoice_id": string | null,"status": string,"subject": string,"to_addresses": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attachment_name"?: string | null,"body": string,"brand_id"?: string | null,"cc_addresses"?: string | null,"created_at"?: string,"deal_id"?: string | null,"error"?: string | null,"id"?: string,"invoice_id"?: string | null,"status": string,"subject": string,"to_addresses": string,"user_id"?: string
                  }
                  Update: {
                    "attachment_name"?: string | null,"body"?: string,"brand_id"?: string | null,"cc_addresses"?: string | null,"created_at"?: string,"deal_id"?: string | null,"error"?: string | null,"id"?: string,"invoice_id"?: string | null,"status"?: string,"subject"?: string,"to_addresses"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_log_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "email_log_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "email_log_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    }
                  ]
                },"email_templates": {
                  Row: {
                    "attach_invoice": boolean,"body": string,"created_at": string,"id": string,"name": string,"position": number,"subject": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attach_invoice"?: boolean,"body": string,"created_at"?: string,"id"?: string,"name": string,"position"?: number,"subject": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "attach_invoice"?: boolean,"body"?: string,"created_at"?: string,"id"?: string,"name"?: string,"position"?: number,"subject"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"invoice_items": {
                  Row: {
                    "amount": number | null,"description": string,"id": string,"invoice_id": string,"position": number,"quantity": number,"rate": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: never,"description": string,"id"?: string,"invoice_id": string,"position"?: number,"quantity"?: number,"rate": number,"user_id"?: string
                  }
                  Update: {
                    "amount"?: never,"description"?: string,"id"?: string,"invoice_id"?: string,"position"?: number,"quantity"?: number,"rate"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_items_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "bill_to_address": string | null,"bill_to_gstin": string | null,"bill_to_name": string,"bill_to_pan": string | null,"brand_id": string,"created_at": string,"deal_id": string | null,"due_date": string | null,"fy": number,"id": string,"invoice_number": string,"issue_date": string,"notes": string | null,"paid_at": string | null,"sent_at": string | null,"seq": number,"status": string,"subtotal": number,"tds_rate": number | null,"tds_section": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_to_address"?: string | null,"bill_to_gstin"?: string | null,"bill_to_name": string,"bill_to_pan"?: string | null,"brand_id": string,"created_at"?: string,"deal_id"?: string | null,"due_date"?: string | null,"fy": number,"id"?: string,"invoice_number": string,"issue_date"?: string,"notes"?: string | null,"paid_at"?: string | null,"sent_at"?: string | null,"seq": number,"status"?: string,"subtotal"?: number,"tds_rate"?: number | null,"tds_section"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "bill_to_address"?: string | null,"bill_to_gstin"?: string | null,"bill_to_name"?: string,"bill_to_pan"?: string | null,"brand_id"?: string,"created_at"?: string,"deal_id"?: string | null,"due_date"?: string | null,"fy"?: number,"id"?: string,"invoice_number"?: string,"issue_date"?: string,"notes"?: string | null,"paid_at"?: string | null,"sent_at"?: string | null,"seq"?: number,"status"?: string,"subtotal"?: number,"tds_rate"?: number | null,"tds_section"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "brand_id": string,"created_at": string,"deal_id": string | null,"gross_amount": number,"id": string,"invoice_id": string | null,"mode": string | null,"net_amount": number | null,"notes": string | null,"received_date": string,"reference": string | null,"tds_amount": number,"tds_section": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"created_at"?: string,"deal_id"?: string | null,"gross_amount": number,"id"?: string,"invoice_id"?: string | null,"mode"?: string | null,"net_amount"?: never,"notes"?: string | null,"received_date": string,"reference"?: string | null,"tds_amount"?: number,"tds_section"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "brand_id"?: string,"created_at"?: string,"deal_id"?: string | null,"gross_amount"?: number,"id"?: string,"invoice_id"?: string | null,"mode"?: string | null,"net_amount"?: never,"notes"?: string | null,"received_date"?: string,"reference"?: string | null,"tds_amount"?: number,"tds_section"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    }
                  ]
                },"profile": {
                  Row: {
                    "address": string | null,"bank_account_name": string | null,"bank_account_number": string | null,"bank_ifsc": string | null,"bank_name": string | null,"default_tds_rate": number,"default_tds_section": string,"display_name": string | null,"email": string | null,"invoice_footer": string | null,"invoice_prefix": string,"legal_name": string | null,"pan": string | null,"payment_terms_days": number,"phone": string | null,"updated_at": string,"upi_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"bank_account_name"?: string | null,"bank_account_number"?: string | null,"bank_ifsc"?: string | null,"bank_name"?: string | null,"default_tds_rate"?: number,"default_tds_section"?: string,"display_name"?: string | null,"email"?: string | null,"invoice_footer"?: string | null,"invoice_prefix"?: string,"legal_name"?: string | null,"pan"?: string | null,"payment_terms_days"?: number,"phone"?: string | null,"updated_at"?: string,"upi_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "address"?: string | null,"bank_account_name"?: string | null,"bank_account_number"?: string | null,"bank_ifsc"?: string | null,"bank_name"?: string | null,"default_tds_rate"?: number,"default_tds_section"?: string,"display_name"?: string | null,"email"?: string | null,"invoice_footer"?: string | null,"invoice_prefix"?: string,"legal_name"?: string | null,"pan"?: string | null,"payment_terms_days"?: number,"phone"?: string | null,"updated_at"?: string,"upi_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_card": {
                  Row: {
                    "id": string,"notes": string | null,"platform": string,"price": number,"type": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"notes"?: string | null,"platform"?: string,"price": number,"type": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "id"?: string,"notes"?: string | null,"platform"?: string,"price"?: number,"type"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tds_checks": {
                  Row: {
                    "amount_in_26as": number | null,"brand_id": string,"checked_on": string,"fy": number,"id": string,"notes": string | null,"tds_in_26as": number | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_in_26as"?: number | null,"brand_id": string,"checked_on"?: string,"fy": number,"id"?: string,"notes"?: string | null,"tds_in_26as"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "amount_in_26as"?: number | null,"brand_id"?: string,"checked_on"?: string,"fy"?: number,"id"?: string,"notes"?: string | null,"tds_in_26as"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tds_checks_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "refresh_invoice":
{ Args: { "p_invoice": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
