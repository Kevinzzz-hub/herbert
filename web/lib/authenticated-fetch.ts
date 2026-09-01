"use client";

import { getSupabaseBrowserClient } from "./supabase-client";

export class LoginRequiredError extends Error {
  constructor() {
    super("登录状态已失效，请重新登录。");
    this.name = "LoginRequiredError";
  }
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new LoginRequiredError();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}
