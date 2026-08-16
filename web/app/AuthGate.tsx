"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import type { ApiErrorBody } from "@/lib/types";
import { CourseLibrary } from "./CourseLibrary";

interface ApiKeyStatus {
  configured: boolean;
  keyHint: string | null;
  updatedAt: string | null;
}

type GateState = "loading-auth" | "signed-out" | "loading-key" | "needs-key" | "ready" | "error";

export function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<GateState>("loading-auth");
  const [keyStatus, setKeyStatus] = useState<ApiKeyStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isManagingKey, setIsManagingKey] = useState(false);

  useEffect(() => {
    let current = true;
    let unsubscribe: (() => void) | undefined;

    Promise.resolve().then(() => {
      const supabase = getSupabaseBrowserClient();
      supabase.auth.getSession().then(({ data, error }) => {
        if (!current) return;
        if (error || !data.session) {
          setSession(null);
          setState("signed-out");
          return;
        }
        setSession(data.session);
        setState("loading-key");
      });

      const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (!current) return;
        setSession(nextSession);
        if (!nextSession) {
          setKeyStatus(null);
          setState("signed-out");
        } else if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED") {
          setKeyStatus(null);
          setState("loading-key");
        }
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    }).catch((error: unknown) => {
      if (!current) return;
      setErrorMessage(error instanceof Error ? error.message : "Herbert 的登录服务尚未配置完成。");
      setState("error");
    });

    return () => {
      current = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!session || state !== "loading-key") return;
    let current = true;

    authenticatedFetch("/api/account/api-key").then(async (response) => {
      const body = await response.json() as ApiKeyStatus | ApiErrorBody;
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error.message : "账号设置暂时无法读取。");
      }
      if (!current) return;
      setKeyStatus(body);
      setState(body.configured ? "ready" : "needs-key");
    }).catch((error: unknown) => {
      if (!current) return;
      setErrorMessage(error instanceof Error ? error.message : "账号设置暂时无法读取。");
      setState("error");
    });

    return () => {
      current = false;
    };
  }, [session, state]);

  const signOut = async () => {
    await getSupabaseBrowserClient().auth.signOut({ scope: "local" });
  };

  if (state === "loading-auth" || state === "loading-key") {
    return <AccountLoading message={state === "loading-auth" ? "正在确认登录状态" : "正在打开密钥保险箱"} />;
  }
  if (state === "error") {
    return (
      <AccountFrame>
        <div className="account-message is-error" role="alert">
          <span>!</span><h1>账号服务暂时不可用</h1><p>{errorMessage}</p>
          <button type="button" onClick={() => setState(session ? "loading-key" : "loading-auth")}>重新读取</button>
          {session ? <button className="account-text-button" type="button" onClick={() => void signOut()}>退出登录</button> : null}
        </div>
      </AccountFrame>
    );
  }
  if (state === "signed-out" || !session) {
    return <MagicLinkSignIn />;
  }
  if (state === "needs-key" || !keyStatus?.configured) {
    return (
      <ApiKeySetup
        email={session.user.email ?? "Herbert 用户"}
        onSaved={(nextStatus) => {
          setKeyStatus(nextStatus);
          setState("ready");
        }}
        onSignOut={() => void signOut()}
      />
    );
  }

  return (
    <>
      <CourseLibrary
        ownerId={session.user.id}
        accountEmail={session.user.email ?? "Herbert 用户"}
        keyHint={keyStatus.keyHint ?? "已连接"}
        onManageKey={() => setIsManagingKey(true)}
        onSignOut={() => void signOut()}
      />
      {isManagingKey ? (
        <ApiKeyDialog
          status={keyStatus}
          onClose={() => setIsManagingKey(false)}
          onUpdated={(nextStatus) => {
            setKeyStatus(nextStatus);
            setIsManagingKey(false);
            if (!nextStatus.configured) setState("needs-key");
          }}
        />
      ) : null}
    </>
  );
}

function MagicLinkSignIn() {
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const sendLink = async () => {
    if (!email.trim() || isSending) return;
    setIsSending(true);
    setErrorMessage("");
    const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    });
    if (error) {
      setErrorMessage(error.message.includes("rate") ? "登录邮件发送太频繁，请稍后再试。" : "登录邮件暂时无法发送，请检查邮箱后重试。");
      setIsSending(false);
      return;
    }
    setSent(true);
    setIsSending(false);
  };

  return (
    <AccountFrame>
      <div className="auth-card">
        <p className="account-kicker">YOUR PRIVATE STUDY SPACE</p>
        <h1>登录 Herbert，<br /><em>使用自己的 AI。</em></h1>
        <p className="auth-description">输入邮箱，我们会发送一次性登录链接。第一次登录会自动建立账号，不需要记住新密码。</p>
        {sent ? (
          <div className="mail-sent" role="status">
            <span>✓</span><div><strong>登录链接已经发送</strong><p>请在邮箱中打开链接。完成后会自动回到 Herbert。</p></div>
          </div>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); void sendLink(); }}>
            <label htmlFor="account-email">邮箱地址</label>
            <input id="account-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
            <button type="submit" disabled={!email.trim() || isSending}>{isSending ? "正在发送" : "发送登录链接"}<span>→</span></button>
          </form>
        )}
        {errorMessage ? <p className="account-error" role="alert">{errorMessage}</p> : null}
        <div className="account-security-note"><i />登录由 Supabase 安全验证；Herbert 不保存你的密码。</div>
      </div>
    </AccountFrame>
  );
}

function ApiKeySetup({
  email,
  onSaved,
  onSignOut,
}: {
  email: string;
  onSaved: (status: ApiKeyStatus) => void;
  onSignOut: () => void;
}) {
  return (
    <AccountFrame>
      <div className="key-setup-layout">
        <div className="key-setup-copy">
          <p className="account-kicker">ONE LAST STEP</p>
          <h1>连接你的<br /><em>DeepSeek API Key。</em></h1>
          <p>Herbert 用你的密钥完成总结、问答和复习材料。模型费用直接计入你自己的 DeepSeek 账户。</p>
          <ol><li><span>01</span>服务器先向 DeepSeek 验证密钥</li><li><span>02</span>通过后存入 Supabase Vault 加密保险箱</li><li><span>03</span>网页以后只显示末尾四位</li></ol>
        </div>
        <div className="key-setup-card">
          <div className="signed-in-as"><span>当前账号</span><strong>{email}</strong></div>
          <ApiKeyForm onSaved={onSaved} />
          <button className="account-text-button" type="button" onClick={onSignOut}>换一个账号</button>
        </div>
      </div>
    </AccountFrame>
  );
}

function ApiKeyDialog({ status, onClose, onUpdated }: { status: ApiKeyStatus; onClose: () => void; onUpdated: (status: ApiKeyStatus) => void }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const remove = async () => {
    if (!window.confirm("删除保存在保险箱中的 DeepSeek API Key 吗？删除后 AI 功能会暂停。")) return;
    setIsDeleting(true);
    setErrorMessage("");
    try {
      const response = await authenticatedFetch("/api/account/api-key", { method: "DELETE" });
      const body = await response.json() as ApiKeyStatus | ApiErrorBody;
      if (!response.ok || "error" in body) throw new Error("error" in body ? body.error.message : "密钥暂时无法删除。");
      onUpdated(body);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "密钥暂时无法删除。");
      setIsDeleting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="api-key-dialog" role="dialog" aria-modal="true" aria-labelledby="api-key-dialog-title">
        <p>AI CONNECTION</p><h2 id="api-key-dialog-title">管理 DeepSeek API Key</h2>
        <div className="connected-key"><span>当前连接</span><strong>{status.keyHint}</strong><small>{status.updatedAt ? `更新于 ${formatAccountDate(status.updatedAt)}` : "已经安全保存"}</small></div>
        <ApiKeyForm submitLabel="验证并替换" onSaved={onUpdated} />
        {errorMessage ? <p className="account-error" role="alert">{errorMessage}</p> : null}
        <footer><button type="button" onClick={onClose} disabled={isDeleting}>关闭</button><button className="remove-key" type="button" onClick={() => void remove()} disabled={isDeleting}>{isDeleting ? "正在删除" : "删除密钥"}</button></footer>
      </div>
    </div>
  );
}

function ApiKeyForm({ onSaved, submitLabel = "验证并保存" }: { onSaved: (status: ApiKeyStatus) => void; submitLabel?: string }) {
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const save = async () => {
    if (!apiKey.trim() || isSaving) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      const response = await authenticatedFetch("/api/account/api-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const body = await response.json() as ApiKeyStatus | ApiErrorBody;
      if (!response.ok || "error" in body) throw new Error("error" in body ? body.error.message : "密钥暂时无法保存。");
      setApiKey("");
      onSaved(body);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "密钥暂时无法保存。");
      setIsSaving(false);
    }
  };

  return (
    <form className="api-key-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label htmlFor="deepseek-api-key">DeepSeek API Key</label>
      <input id="deepseek-api-key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-••••••••••••" />
      <button type="submit" disabled={!apiKey.trim() || isSaving}>{isSaving ? "正在验证" : submitLabel}<span>→</span></button>
      <small>保存前只调用 DeepSeek 的模型列表接口进行验证，不会生成内容或消耗对话额度。</small>
      {errorMessage ? <p className="account-error" role="alert">{errorMessage}</p> : null}
    </form>
  );
}

function AccountLoading({ message }: { message: string }) {
  return <AccountFrame><div className="account-loading" role="status"><i /><strong>{message}</strong><span>Herbert 正在准备你的私人学习空间</span></div></AccountFrame>;
}

function AccountFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="account-shell">
      <header className="account-header"><div className="brand"><span className="brand-mark" aria-hidden="true"><span /></span><span className="brand-copy"><strong>HERBERT</strong><small>PRIVATE AI READING</small></span></div><span>YOUR KEY · YOUR USAGE · YOUR LIBRARY</span></header>
      <section className="account-page">{children}</section>
      <footer className="site-footer"><span>HERBERT · V0.5</span><p>Bring your own intelligence.</p></footer>
    </main>
  );
}

function formatAccountDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}
