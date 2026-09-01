import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const deepSeekKey = process.env.DEEPSEEK_API_KEY;

if (!supabaseUrl || !publishableKey || !secretKey || !deepSeekKey) {
  throw new Error("Missing local credentials required for the disposable end-to-end test.");
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const browserLikeClient = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const email = `herbert-e2e-${Date.now()}@example.com`;
const password = `Herbert-${crypto.randomUUID()}-test`;
let userId = null;

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError || new Error("Test user was not created.");
  userId = created.user.id;

  const { data: signedIn, error: signInError } = await browserLikeClient.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) throw signInError || new Error("Test session was not created.");
  const authorization = `Bearer ${signedIn.session.access_token}`;

  const saveResponse = await fetch("http://localhost:3000/api/account/api-key", {
    method: "PUT",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "deepseek", model: "deepseek-v4-flash", apiKey: deepSeekKey }),
  });
  const saveBody = await saveResponse.json();
  if (saveResponse.status !== 400 || saveBody?.error?.code !== "INVALID_PROVIDER_KEY") {
    throw new Error(`Invalid provider key was not rejected safely (${saveResponse.status}).`);
  }

  const syntheticSecret = `herbert-disposable-${crypto.randomUUID()}`;
  const { error: vaultWriteError } = await admin.rpc("herbert_store_ai_credential", {
    p_user_id: userId,
    p_provider: "deepseek",
    p_model: "deepseek-v4-flash",
    p_secret: syntheticSecret,
    p_hint: "Disposable ••••test",
  });
  if (vaultWriteError) throw vaultWriteError;

  const statusResponse = await fetch("http://localhost:3000/api/account/api-key", {
    headers: { Authorization: authorization },
  });
  const statusBody = await statusResponse.json();
  if (!statusResponse.ok || !statusBody.configured || !statusBody.keyHint) {
    throw new Error(`Status failed with ${statusResponse.status}.`);
  }

  const deleteResponse = await fetch("http://localhost:3000/api/account/api-key", {
    method: "DELETE",
    headers: { Authorization: authorization },
  });
  const deleteBody = await deleteResponse.json();
  if (!deleteResponse.ok || deleteBody.configured !== false) {
    throw new Error(`Delete failed with ${deleteResponse.status}.`);
  }

  console.log(JSON.stringify({
    login: true,
    invalidKeyRejected: true,
    vaultWrite: true,
    maskedStatus: true,
    delete: true,
  }));
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
}
