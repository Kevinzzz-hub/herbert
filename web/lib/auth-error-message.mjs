/**
 * Convert Supabase Auth errors into stable, actionable copy without exposing
 * provider internals or user data in the interface.
 *
 * @param {{ status?: number, message?: string, name?: string } | null | undefined} error
 */
export function authSendErrorMessage(error) {
  const status = Number(error?.status ?? 0);
  const details = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase();

  if (status === 429 || /rate|too many|over_email_send_rate_limit/.test(details)) {
    return "验证码发送太频繁，请等待 60 秒后再试。";
  }
  if (/failed to fetch|fetch failed|network|authretryablefetcherror/.test(details)) {
    return "无法连接登录服务。请检查网络；如果持续失败，Herbert 管理员需要确认 Supabase 项目正在运行。";
  }
  if (/email_address_not_authorized|email address not authorized|not authorized/.test(details)) {
    return "当前邮件服务还没有允许这个邮箱。Herbert 管理员需要检查 Supabase SMTP 配置。";
  }
  if (/smtp|error sending|confirmation email|email provider|mailer/.test(details)) {
    return "登录邮件服务暂时不可用。请稍后重试；Herbert 管理员需要检查 SMTP 状态。";
  }
  if (/invalid.*email|email.*invalid/.test(details)) {
    return "邮箱地址格式不正确，请检查后重试。";
  }
  return "验证码暂时无法发送。请稍后重试；若仍失败，请通过页面底部的反馈入口告诉我们。";
}

/**
 * @param {{ status?: number, message?: string, name?: string } | null | undefined} error
 */
export function authVerifyErrorMessage(error) {
  const status = Number(error?.status ?? 0);
  const details = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase();

  if (status === 429 || /rate|too many/.test(details)) {
    return "验证尝试太频繁，请稍等后再试。";
  }
  if (/failed to fetch|fetch failed|network|authretryablefetcherror/.test(details)) {
    return "暂时无法连接登录服务，请检查网络后重新验证。";
  }
  if (/expired|invalid|token|otp/.test(details)) {
    return "验证码不正确或已经过期，请确认后重试。";
  }
  return "暂时无法验证这个验证码，请重新发送后再试。";
}
