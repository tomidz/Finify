export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type: Database["public"]["Enums"]["account_type"]
          created_at?: string
          currency: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      budget_categories: {
        Row: {
          category_type: Database["public"]["Enums"]["budget_category_type"]
          created_at: string
          display_order: number
          id: string
          monthly_amount: number
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_type: Database["public"]["Enums"]["budget_category_type"]
          created_at?: string
          display_order?: number
          id?: string
          monthly_amount?: number
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_type?: Database["public"]["Enums"]["budget_category_type"]
          created_at?: string
          display_order?: number
          id?: string
          monthly_amount?: number
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budget_lines: {
        Row: {
          category_id: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_month_plans: {
        Row: {
          created_at: string
          id: string
          line_id: string
          month_id: string
          planned_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_id: string
          month_id: string
          planned_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          line_id?: string
          month_id?: string
          planned_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_month_plans_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_month_plans_month_id_fkey"
            columns: ["month_id"]
            isOneToOne: false
            referencedRelation: "months"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_recurrence_rules: {
        Row: {
          amount: number
          created_at: string
          end_month_id: string | null
          id: string
          is_active: boolean
          line_id: string
          mode: Database["public"]["Enums"]["budget_rule_mode"]
          start_month_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          end_month_id?: string | null
          id?: string
          is_active?: boolean
          line_id: string
          mode?: Database["public"]["Enums"]["budget_rule_mode"]
          start_month_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          end_month_id?: string | null
          id?: string
          is_active?: boolean
          line_id?: string
          mode?: Database["public"]["Enums"]["budget_rule_mode"]
          start_month_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_recurrence_rules_end_month_id_fkey"
            columns: ["end_month_id"]
            isOneToOne: false
            referencedRelation: "months"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_recurrence_rules_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_recurrence_rules_start_month_id_fkey"
            columns: ["start_month_id"]
            isOneToOne: false
            referencedRelation: "months"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_years: {
        Row: {
          id: string
          user_id: string
          year: number
        }
        Insert: {
          id?: string
          user_id: string
          year: number
        }
        Update: {
          id?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      currencies: {
        Row: {
          code: string
          currency_type: Database["public"]["Enums"]["currency_type"]
          decimals: number
          name: string
          symbol: string
        }
        Insert: {
          code: string
          currency_type: Database["public"]["Enums"]["currency_type"]
          decimals?: number
          name: string
          symbol: string
        }
        Update: {
          code?: string
          currency_type?: Database["public"]["Enums"]["currency_type"]
          decimals?: number
          name?: string
          symbol?: string
        }
        Relationships: []
      }
      debt_activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["debt_activity_type"]
          amount: number
          amount_base: number | null
          created_at: string
          date: string
          description: string | null
          id: string
          nw_item_id: string
          transaction_id: string | null
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["debt_activity_type"]
          amount: number
          amount_base?: number | null
          created_at?: string
          date: string
          description?: string | null
          id?: string
          nw_item_id: string
          transaction_id?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["debt_activity_type"]
          amount?: number
          amount_base?: number | null
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          nw_item_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debt_activities_nw_item_id_fkey"
            columns: ["nw_item_id"]
            isOneToOne: false
            referencedRelation: "nw_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_activities_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          nw_item_id: string | null
          original_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          nw_item_id?: string | null
          original_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          nw_item_id?: string | null
          original_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "debts_nw_item_id_fkey"
            columns: ["nw_item_id"]
            isOneToOne: false
            referencedRelation: "nw_items"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          created_at: string
          from_currency: string
          id: string
          rate: number
          rate_date: string
          source: string
          to_currency: string
        }
        Insert: {
          created_at?: string
          from_currency: string
          id?: string
          rate: number
          rate_date: string
          source?: string
          to_currency: string
        }
        Update: {
          created_at?: string
          from_currency?: string
          id?: string
          rate?: number
          rate_date?: string
          source?: string
          to_currency?: string
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_from_currency_fkey"
            columns: ["from_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fx_rates_to_currency_fkey"
            columns: ["to_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      investment_sales: {
        Row: {
          account_id: string
          asset_name: string
          asset_type: string
          cost_basis: number
          created_at: string
          currency: string
          fees: number
          id: string
          isin: string | null
          notes: string | null
          price_per_unit: number
          quantity_sold: number
          realized_pnl: number
          sale_date: string
          tax: number
          ticker: string | null
          total_proceeds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          asset_name: string
          asset_type: string
          cost_basis: number
          created_at?: string
          currency: string
          fees?: number
          id?: string
          isin?: string | null
          notes?: string | null
          price_per_unit: number
          quantity_sold: number
          realized_pnl: number
          sale_date: string
          tax?: number
          ticker?: string | null
          total_proceeds: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          asset_name?: string
          asset_type?: string
          cost_basis?: number
          created_at?: string
          currency?: string
          fees?: number
          id?: string
          isin?: string | null
          notes?: string | null
          price_per_unit?: number
          quantity_sold?: number
          realized_pnl?: number
          sale_date?: string
          tax?: number
          ticker?: string | null
          total_proceeds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_sales_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_sales_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      investments: {
        Row: {
          account_id: string
          asset_name: string
          asset_type: string
          created_at: string
          currency: string
          id: string
          isin: string | null
          notes: string | null
          price_per_unit: number
          purchase_date: string
          quantity: number
          ticker: string | null
          total_cost: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          asset_name: string
          asset_type?: string
          created_at?: string
          currency: string
          id?: string
          isin?: string | null
          notes?: string | null
          price_per_unit: number
          purchase_date: string
          quantity: number
          ticker?: string | null
          total_cost: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          asset_name?: string
          asset_type?: string
          created_at?: string
          currency?: string
          id?: string
          isin?: string | null
          notes?: string | null
          price_per_unit?: number
          purchase_date?: string
          quantity?: number
          ticker?: string | null
          total_cost?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investments_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      months: {
        Row: {
          created_at: string
          id: string
          month: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          month: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          month?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      nw_items: {
        Row: {
          account_id: string | null
          created_at: string
          currency: string
          display_order: number
          id: string
          name: string
          side: Database["public"]["Enums"]["nw_item_side"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          currency: string
          display_order?: number
          id?: string
          name: string
          side: Database["public"]["Enums"]["nw_item_side"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          currency?: string
          display_order?: number
          id?: string
          name?: string
          side?: Database["public"]["Enums"]["nw_item_side"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nw_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nw_items_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      nw_snapshots: {
        Row: {
          amount: number
          amount_base: number | null
          created_at: string
          id: string
          month: number
          nw_item_id: string
          year: number
        }
        Insert: {
          amount: number
          amount_base?: number | null
          created_at?: string
          id?: string
          month: number
          nw_item_id: string
          year: number
        }
        Update: {
          amount?: number
          amount_base?: number | null
          created_at?: string
          id?: string
          month?: number
          nw_item_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "nw_snapshots_nw_item_id_fkey"
            columns: ["nw_item_id"]
            isOneToOne: false
            referencedRelation: "nw_items"
            referencedColumns: ["id"]
          },
        ]
      }
      opening_balances: {
        Row: {
          account_id: string
          created_at: string
          id: string
          month_id: string
          opening_amount: number
          opening_base_amount: number
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          month_id: string
          opening_amount?: number
          opening_base_amount?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          month_id?: string
          opening_amount?: number
          opening_base_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "opening_balances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opening_balances_month_id_fkey"
            columns: ["month_id"]
            isOneToOne: false
            referencedRelation: "months"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_transactions: {
        Row: {
          account_id: string
          amount: number
          base_amount: number | null
          category_id: string | null
          created_at: string | null
          currency: string
          day_of_month: number | null
          day_of_week: number | null
          description: string
          end_date: string | null
          exchange_rate: number | null
          id: string
          is_active: boolean | null
          notes: string | null
          recurrence: string
          start_date: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          base_amount?: number | null
          category_id?: string | null
          created_at?: string | null
          currency: string
          day_of_month?: number | null
          day_of_week?: number | null
          description: string
          end_date?: string | null
          exchange_rate?: number | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          recurrence: string
          start_date: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          base_amount?: number | null
          category_id?: string | null
          created_at?: string | null
          currency?: string
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string
          end_date?: string | null
          exchange_rate?: number | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          recurrence?: string
          start_date?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      savings_goals: {
        Row: {
          account_id: string | null
          color: string | null
          created_at: string | null
          currency: string
          current_amount: number | null
          deadline: string | null
          id: string
          is_completed: boolean | null
          name: string
          target_amount: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          color?: string | null
          created_at?: string | null
          currency?: string
          current_amount?: number | null
          deadline?: string | null
          id?: string
          is_completed?: boolean | null
          name: string
          target_amount: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          color?: string | null
          created_at?: string | null
          currency?: string
          current_amount?: number | null
          deadline?: string | null
          id?: string
          is_completed?: boolean | null
          name?: string
          target_amount?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_goals_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      transaction_amounts: {
        Row: {
          account_id: string
          amount: number
          base_amount: number
          created_at: string
          exchange_rate: number
          id: string
          original_currency: string
          transaction_id: string
        }
        Insert: {
          account_id: string
          amount: number
          base_amount: number
          created_at?: string
          exchange_rate?: number
          id?: string
          original_currency: string
          transaction_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          base_amount?: number
          created_at?: string
          exchange_rate?: number
          id?: string
          original_currency?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_amounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_amounts_original_currency_fkey"
            columns: ["original_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transaction_amounts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_rules: {
        Row: {
          action_account_id: string | null
          action_category_id: string | null
          action_rename: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          match_field: string
          match_type: string
          match_value: string
          name: string
          priority: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_account_id?: string | null
          action_category_id?: string | null
          action_rename?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          match_field: string
          match_type: string
          match_value: string
          name: string
          priority?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_account_id?: string | null
          action_category_id?: string | null
          action_rename?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          match_field?: string
          match_type?: string
          match_value?: string
          name?: string
          priority?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_rules_action_account_id_fkey"
            columns: ["action_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_rules_action_category_id_fkey"
            columns: ["action_category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          category_id: string | null
          created_at: string
          date: string
          debt_id: string | null
          deleted_at: string | null
          description: string
          fee: number
          id: string
          month_id: string | null
          notes: string | null
          source_investment_id: string | null
          source_investment_sale_id: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          date: string
          debt_id?: string | null
          deleted_at?: string | null
          description: string
          fee?: number
          id?: string
          month_id?: string | null
          notes?: string | null
          source_investment_id?: string | null
          source_investment_sale_id?: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          date?: string
          debt_id?: string | null
          deleted_at?: string | null
          description?: string
          fee?: number
          id?: string
          month_id?: string | null
          notes?: string | null
          source_investment_id?: string | null
          source_investment_sale_id?: string | null
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_month_id_fkey"
            columns: ["month_id"]
            isOneToOne: false
            referencedRelation: "months"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_source_investment_id_fkey"
            columns: ["source_investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_source_investment_sale_id_fkey"
            columns: ["source_investment_sale_id"]
            isOneToOne: false
            referencedRelation: "investment_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          base_currency: string
          created_at: string
          fx_source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_currency: string
          created_at?: string
          fx_source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          fx_source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_base_currency_fkey"
            columns: ["base_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_net_worth_year: {
        Args: { p_base_currency?: string; p_year: number }
        Returns: {
          account_id: string
          account_name: string
          account_type: string
          balance: number
          balance_base: number
          currency: string
          currency_symbol: string
          investment_value: number
          investment_value_base: number
          month: number
          year: number
        }[]
      }
      budget_summary_vs_actual: {
        Args: { p_base_currency?: string; p_month_id: string }
        Returns: {
          actual_amount: number
          category_id: string
          category_name: string
          category_type: Database["public"]["Enums"]["budget_category_type"]
          planned_amount: number
          variance: number
        }[]
      }
      budget_summary_vs_actual_range: {
        Args: {
          p_base_currency?: string
          p_end_month_id: string
          p_start_month_id: string
        }
        Returns: {
          actual_amount: number
          category_id: string
          category_name: string
          category_type: Database["public"]["Enums"]["budget_category_type"]
          planned_amount: number
          variance: number
        }[]
      }
      latest_fx_rate: {
        Args: {
          p_from_currency: string
          p_reference_date: string
          p_to_currency: string
        }
        Returns: number
      }
      liabilities_year: {
        Args: { p_base_currency?: string; p_year: number }
        Returns: {
          amount: number
          amount_base: number
          currency: string
          currency_symbol: string
          item_id: string
          name: string
        }[]
      }
      net_worth_evolution_year: {
        Args: { p_base_currency?: string; p_year: number }
        Returns: {
          assets: number
          liabilities: number
          month: number
          net_worth: number
        }[]
      }
      opening_balances_with_current_base: {
        Args: { p_base_currency?: string; p_month_id: string }
        Returns: {
          account_currency: string
          account_currency_symbol: string
          account_id: string
          account_name: string
          created_at: string
          current_opening_base_amount: number
          id: string
          month_id: string
          opening_amount: number
          opening_base_amount: number
        }[]
      }
      resolve_base_currency: {
        Args: { p_base_currency?: string }
        Returns: string
      }
      transactions_feed: {
        Args: {
          p_account_id?: string
          p_category_id?: string
          p_category_type?: Database["public"]["Enums"]["budget_category_type"]
          p_limit?: number
          p_month_id: string
          p_offset?: number
          p_search?: string
          p_transaction_type?: Database["public"]["Enums"]["transaction_type"]
        }
        Returns: {
          amounts: Json
          category_id: string
          category_name: string
          category_type: Database["public"]["Enums"]["budget_category_type"]
          created_at: string
          date: string
          description: string
          fee: number
          id: string
          month_id: string
          notes: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
        }[]
      }
      usage_counts: {
        Args: never
        Returns: {
          entity_id: string
          entity_type: string
          usage_count: number
        }[]
      }
    }
    Enums: {
      account_type:
        | "bank"
        | "investment_broker"
        | "crypto_exchange"
        | "crypto_wallet"
        | "cash"
        | "other"
      budget_category_type:
        | "income"
        | "essential_expenses"
        | "discretionary_expenses"
        | "debt_payments"
        | "savings"
        | "investments"
      budget_rule_mode: "set" | "add"
      currency_type: "fiat" | "crypto" | "etf"
      debt_activity_type: "payment" | "interest" | "adjustment"
      nw_item_side: "asset" | "liability"
      transaction_type: "income" | "expense" | "transfer" | "correction"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      account_type: [
        "bank",
        "investment_broker",
        "crypto_exchange",
        "crypto_wallet",
        "cash",
        "other",
      ],
      budget_category_type: [
        "income",
        "essential_expenses",
        "discretionary_expenses",
        "debt_payments",
        "savings",
        "investments",
      ],
      budget_rule_mode: ["set", "add"],
      currency_type: ["fiat", "crypto", "etf"],
      debt_activity_type: ["payment", "interest", "adjustment"],
      nw_item_side: ["asset", "liability"],
      transaction_type: ["income", "expense", "transfer", "correction"],
    },
  },
} as const

