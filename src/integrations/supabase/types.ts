export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      customer_notes: {
        Row: {
          note: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          note?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          note?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          commune: string
          created_at: string
          department: string
          id: string
          is_active: boolean
          delivery_fee: number
          free_from: number | null
          region: string
          sort_order: number
        }
        Insert: {
          commune: string
          created_at?: string
          department: string
          id?: string
          is_active?: boolean
          delivery_fee?: number
          free_from?: number | null
          region?: string
          sort_order?: number
        }
        Update: {
          commune?: string
          created_at?: string
          department?: string
          id?: string
          is_active?: boolean
          delivery_fee?: number
          free_from?: number | null
          region?: string
          sort_order?: number
        }
        Relationships: []
      }
      farm_settings: {
        Row: {
          about_body: string
          about_eyebrow: string | null
          about_image_url: string | null
          about_title: string
          address: string | null
          description: string
          email: string | null
          facebook_url: string | null
          hero_subtitle: string
          hero_title: string
          id: number
          instagram_url: string | null
          legal_name: string | null
          legal_updated_at: string | null
          ninea: string | null
          privacy_body: string | null
          rccm: string | null
          terms_body: string | null
          location: string
          name: string
          opening_hours: string | null
          phone: string | null
          tagline: string
          tiktok_url: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          about_body?: string
          about_eyebrow?: string | null
          about_image_url?: string | null
          about_title?: string
          address?: string | null
          description?: string
          email?: string | null
          facebook_url?: string | null
          hero_subtitle?: string
          hero_title?: string
          id?: number
          instagram_url?: string | null
          legal_name?: string | null
          legal_updated_at?: string | null
          ninea?: string | null
          privacy_body?: string | null
          rccm?: string | null
          terms_body?: string | null
          location?: string
          name?: string
          opening_hours?: string | null
          phone?: string | null
          tagline?: string
          tiktok_url?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          about_body?: string
          about_eyebrow?: string | null
          about_image_url?: string | null
          about_title?: string
          address?: string | null
          description?: string
          email?: string | null
          facebook_url?: string | null
          hero_subtitle?: string
          hero_title?: string
          id?: number
          instagram_url?: string | null
          legal_name?: string | null
          legal_updated_at?: string | null
          ninea?: string | null
          privacy_body?: string | null
          rccm?: string | null
          terms_body?: string | null
          location?: string
          name?: string
          opening_hours?: string | null
          phone?: string | null
          tagline?: string
          tiktok_url?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_from_admin: boolean
          read_at: string | null
          sender_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_from_admin?: boolean
          read_at?: string | null
          sender_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_from_admin?: boolean
          read_at?: string | null
          sender_id?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          actual_quantity: number | null
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          sold_by_weight: boolean
          unit_price: number
        }
        Insert: {
          actual_quantity?: number | null
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price: number
        }
        Update: {
          actual_quantity?: number | null
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sold_by_weight?: boolean
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          delivered_at: string | null
          confirmation_email_sent_at: string | null
          confirmation_sms_sent_at: string | null
          created_at: string
          delivery_fee: number
          delivery_zone_id: string | null
          id: string
          notes: string | null
          processing_at: string | null
          ready_at: string | null
          cancel_reason: string | null
          cancelled_by: string | null
          shipped_at: string | null
          paid_at: string | null
          payment_method: string
          payment_session_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          shipping_address: string
          shipping_city: string
          shipping_full_name: string
          shipping_phone: string
          shipping_postal_code: string
          status: Database["public"]["Enums"]["order_status"]
          slaughter_date: string | null
          stripe_session_id: string | null
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          delivered_at?: string | null
          confirmation_email_sent_at?: string | null
          confirmation_sms_sent_at?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_zone_id?: string | null
          id?: string
          notes?: string | null
          processing_at?: string | null
          ready_at?: string | null
          cancel_reason?: string | null
          cancelled_by?: string | null
          shipped_at?: string | null
          paid_at?: string | null
          payment_method?: string
          payment_session_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          shipping_address: string
          shipping_city: string
          shipping_full_name: string
          shipping_phone: string
          shipping_postal_code: string
          status?: Database["public"]["Enums"]["order_status"]
          slaughter_date?: string | null
          stripe_session_id?: string | null
          total_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          delivered_at?: string | null
          confirmation_email_sent_at?: string | null
          confirmation_sms_sent_at?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_zone_id?: string | null
          id?: string
          notes?: string | null
          processing_at?: string | null
          ready_at?: string | null
          cancel_reason?: string | null
          cancelled_by?: string | null
          shipped_at?: string | null
          paid_at?: string | null
          payment_method?: string
          payment_session_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          shipping_address?: string
          shipping_city?: string
          shipping_full_name?: string
          shipping_phone?: string
          shipping_postal_code?: string
          status?: Database["public"]["Enums"]["order_status"]
          slaughter_date?: string | null
          stripe_session_id?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          discount_label: string | null
          discount_price: number | null
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          name: string
          price: number
          slug: string
          stock: number
          unit: string
          updated_at: string
          needs_slaughter: boolean
          season_months: number[] | null
          sold_by_weight: boolean
          variant_group: string | null
          variant_label: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          discount_label?: string | null
          discount_price?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name: string
          price: number
          slug: string
          stock?: number
          unit?: string
          updated_at?: string
          needs_slaughter?: boolean
          season_months?: number[] | null
          sold_by_weight?: boolean
          variant_group?: string | null
          variant_label?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          discount_label?: string | null
          discount_price?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name?: string
          price?: number
          slug?: string
          stock?: number
          unit?: string
          updated_at?: string
          needs_slaughter?: boolean
          season_months?: number[] | null
          sold_by_weight?: boolean
          variant_group?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          postal_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          product_id: string
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id: string
          rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      slaughter_days: {
        Row: {
          created_at: string
          day: string
          id: string
          note: string | null
          order_deadline: string
        }
        Insert: {
          created_at?: string
          day: string
          id?: string
          note?: string | null
          order_deadline: string
        }
        Update: {
          created_at?: string
          day?: string
          id?: string
          note?: string | null
          order_deadline?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delivery_fee: {
        Args: { _subtotal: number; _zone_id: string }
        Returns: number
      }
      can_review: {
        Args: { _product_id: string }
        Returns: boolean
      }
      set_item_weight: {
        Args: { _item_id: string; _weight: number | null }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      cancel_order: {
        Args: { _order_id: string; _reason?: string }
        Returns: undefined
      }
      place_order: {
        Args: { _items: Json; _payment_method?: string; _shipping: Json }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "customer"
      order_status:
        | "pending"
        | "processing"
        | "ready"
        | "shipped"
        | "delivered"
        | "cancelled"
      payment_status: "unpaid" | "paid" | "refunded" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "customer"],
      order_status: [
        "pending",
        "processing",
        "ready",
        "shipped",
        "delivered",
        "cancelled",
      ],
      payment_status: ["unpaid", "paid", "refunded", "failed"],
    },
  },
} as const
