import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** POST only: a GET sign-out could be triggered by any <img src>. */
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login?signed_out=1", request.nextUrl.origin), {
    status: 303,
  });
}
