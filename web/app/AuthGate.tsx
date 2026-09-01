"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  AI_PROVIDER_OPTIONS,
  getAiProviderOption,
  type AiCredentialStatus,
  type AiProviderId,
} from "@/lib/ai-provider-catalog";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { authSendErrorMessage, authVerifyErrorMessage } from "@/lib/auth-error-message.mjs";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import type { ApiErrorBody } from "@/lib/types";
import { HERBERT_VERSION } from "@/lib/version";
import { CourseLibrary } from "./CourseLibrary";

type ApiKeyStatus = AiCredentialStatus;

type GateState = "loading-auth" | "signed-out" | "loading-key" | "needs-key" | "ready" | "error";

const EMAIL_OTP_LENGTH = 8;

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
    return <EmailOtpSignIn />;
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
        aiModelLabel={`${keyStatus.providerLabel ?? "AI"} · ${keyStatus.model ?? "默认模型"}`}
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

function EmailOtpSignIn() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [resendAvailableIn, setResendAvailableIn] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (resendAvailableIn <= 0) return;
    const timer = window.setTimeout(() => {
      setResendAvailableIn((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [resendAvailableIn]);

  const sendCode = async () => {
    if (!email.trim() || isSending) return;
    setIsSending(true);
    setErrorMessage("");
    const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    if (error) {
      setErrorMessage(authSendErrorMessage(error));
      setIsSending(false);
      return;
    }
    setCodeSent(true);
    setResendAvailableIn(60);
    setIsSending(false);
  };

  const verifyCode = async () => {
    const token = otp.replace(/\D/g, "");
    if (token.length !== EMAIL_OTP_LENGTH || isVerifying) return;
    setIsVerifying(true);
    setErrorMessage("");
    const { data, error } = await getSupabaseBrowserClient().auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    });
    if (error || !data.session) {
      setErrorMessage(authVerifyErrorMessage(error));
      setIsVerifying(false);
    }
  };

  const changeEmail = () => {
    setCodeSent(false);
    setOtp("");
    setResendAvailableIn(0);
    setErrorMessage("");
  };

  return (
    <AccountFrame>
      <div className="auth-card">
        <p className="account-kicker">YOUR PRIVATE STUDY SPACE</p>
        <h1>登录 Herbert，<br /><em>使用自己的 AI。</em></h1>
        <p className="auth-description">输入邮箱获取 {EMAIL_OTP_LENGTH} 位验证码，然后留在这个页面完成登录。第一次登录会自动建立账号，不需要记住新密码。</p>
        {codeSent ? (
          <>
            <div className="mail-sent" role="status">
              <span>{EMAIL_OTP_LENGTH}</span><div><strong>验证码已经发送</strong><p>请查看 {email.trim()} 的邮件，并把 {EMAIL_OTP_LENGTH} 位数字输入下方。不要点击旧的登录链接。</p></div>
            </div>
            <form className="otp-form" onSubmit={(event) => { event.preventDefault(); void verifyCode(); }}>
              <label htmlFor="account-otp">{EMAIL_OTP_LENGTH} 位验证码</label>
              <input
                id="account-otp"
                className="otp-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern={`[0-9]{${EMAIL_OTP_LENGTH}}`}
                maxLength={EMAIL_OTP_LENGTH}
                required
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, EMAIL_OTP_LENGTH))}
                placeholder={"0".repeat(EMAIL_OTP_LENGTH)}
                aria-describedby="otp-help"
              />
              <small id="otp-help">验证码默认 1 小时内有效；同一个验证码只能使用一次。</small>
              <button type="submit" disabled={otp.length !== EMAIL_OTP_LENGTH || isVerifying}>{isVerifying ? "正在验证" : "验证并登录"}<span>→</span></button>
            </form>
            <div className="auth-secondary-actions">
              <button type="button" onClick={changeEmail}>换一个邮箱</button>
              <button type="button" onClick={() => void sendCode()} disabled={isSending || resendAvailableIn > 0}>{isSending ? "正在重发" : resendAvailableIn > 0 ? `${resendAvailableIn} 秒后可重发` : "重新发送验证码"}</button>
            </div>
          </>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); void sendCode(); }}>
            <label htmlFor="account-email">邮箱地址</label>
            <input id="account-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
            <button type="submit" disabled={!email.trim() || isSending}>{isSending ? "正在发送" : `发送 ${EMAIL_OTP_LENGTH} 位验证码`}<span>→</span></button>
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
          <h1>连接你的<br /><em>AI 服务。</em></h1>
          <p>Herbert 支持多家 AI 服务商。模型费用直接计入你选择的服务商账户，我们不代收模型费用。</p>
          <ol><li><span>01</span>选择服务商和模型</li><li><span>02</span>服务器验证后存入 Supabase Vault</li><li><span>03</span>网页以后只显示 Key 末尾四位</li></ol>
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
    if (!window.confirm("删除保存在保险箱中的 AI API Key 吗？删除后 AI 功能会暂停。")) return;
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
        <p>AI CONNECTION</p><h2 id="api-key-dialog-title">管理 AI 服务</h2>
        <div className="connected-key">
          <span>当前连接</span><strong>{status.keyHint}</strong>
          <small>{status.providerLabel} · {status.model}{status.updatedAt ? ` · 更新于 ${formatAccountDate(status.updatedAt)}` : ""}</small>
        </div>
        <ApiKeyForm
          initialProvider={status.provider ?? "deepseek"}
          initialModel={status.model ?? undefined}
          submitLabel="验证并替换"
          onSaved={onUpdated}
        />
        {errorMessage ? <p className="account-error" role="alert">{errorMessage}</p> : null}
        <footer><button type="button" onClick={onClose} disabled={isDeleting}>关闭</button><button className="remove-key" type="button" onClick={() => void remove()} disabled={isDeleting}>{isDeleting ? "正在删除" : "删除密钥"}</button></footer>
      </div>
    </div>
  );
}

function ApiKeyForm({
  onSaved,
  submitLabel = "验证并保存",
  initialProvider = "deepseek",
  initialModel,
}: {
  onSaved: (status: ApiKeyStatus) => void;
  submitLabel?: string;
  initialProvider?: AiProviderId;
  initialModel?: string;
}) {
  const [provider, setProvider] = useState<AiProviderId>(initialProvider);
  const [model, setModel] = useState(initialModel ?? getAiProviderOption(initialProvider).defaultModel);
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const providerOption = getAiProviderOption(provider);

  const save = async () => {
    if (!apiKey.trim() || isSaving) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      const response = await authenticatedFetch("/api/account/api-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model: model.trim(), apiKey: apiKey.trim() }),
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
      <label htmlFor="ai-provider">AI 服务商</label>
      <select
        id="ai-provider"
        value={provider}
        onChange={(event) => {
          const nextProvider = event.target.value as AiProviderId;
          setProvider(nextProvider);
          setModel(getAiProviderOption(nextProvider).defaultModel);
          setErrorMessage("");
        }}
      >
        {AI_PROVIDER_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <p className="provider-description">{providerOption.description}</p>
      <label htmlFor="ai-model">模型</label>
      <input id="ai-model" type="text" autoComplete="off" spellCheck={false} value={model} onChange={(event) => setModel(event.target.value)} placeholder={providerOption.defaultModel} />
      <small>{providerOption.modelHelp}</small>
      <label htmlFor="ai-api-key">{providerOption.label} API Key</label>
      <input id="ai-api-key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={providerOption.keyPlaceholder} />
      <button type="submit" disabled={!apiKey.trim() || !model.trim() || isSaving}>{isSaving ? `正在验证 ${providerOption.label}` : submitLabel}<span>→</span></button>
      <small>保存前只验证密钥，不会生成内容。Key 会加密保存在 Supabase Vault。</small>
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
      <footer className="site-footer account-footer">
        <span>HERBERT · {HERBERT_VERSION}</span>
        <nav aria-label="Herbert 帮助链接">
          <a href="/privacy">隐私与数据</a>
          <a href="https://github.com/Kevinzzz-hub/herbert/issues/new" target="_blank" rel="noreferrer">反馈问题</a>
        </nav>
      </footer>
    </main>
  );
}

function formatAccountDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}
