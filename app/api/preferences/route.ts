import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// GET - Fetch user preferences
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization header required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "not found" - that's okay, we'll create one
      console.error("Error fetching preferences:", error);
      return NextResponse.json(
        { error: "Failed to fetch preferences" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      preferences: data || {
        default_resume: {},
        company_1: null,
        company_2: null,
        company_3: null,
        company_4: null,
        company_5: null,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/preferences:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST/PUT - Save user preferences
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization header required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { default_resume, company_1, company_2, company_3, company_4, company_5 } = body;

    // Check if preferences already exist
    const { data: existing } = await supabase
      .from("user_preferences")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from("user_preferences")
        .update({
          default_resume: default_resume || {},
          company_1: company_1 || null,
          company_2: company_2 || null,
          company_3: company_3 || null,
          company_4: company_4 || null,
          company_5: company_5 || null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating preferences:", error);
        return NextResponse.json(
          { error: "Failed to update preferences" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, preferences: data });
    } else {
      // Insert new
      const { data, error } = await supabase
        .from("user_preferences")
        .insert({
          user_id: user.id,
          default_resume: default_resume || {},
          company_1: company_1 || null,
          company_2: company_2 || null,
          company_3: company_3 || null,
          company_4: company_4 || null,
          company_5: company_5 || null,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating preferences:", error);
        return NextResponse.json(
          { error: "Failed to create preferences" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, preferences: data });
    }
  } catch (error) {
    console.error("Error in POST /api/preferences:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
