import assert from "node:assert/strict";
import test from "node:test";
import { authSendErrorMessage, authVerifyErrorMessage } from "../lib/auth-error-message.mjs";

test("distinguishes rate limits from unavailable login infrastructure", () => {
  assert.match(authSendErrorMessage({ status: 429, message: "over_email_send_rate_limit" }), /60 秒/);
  assert.match(authSendErrorMessage({ name: "AuthRetryableFetchError", message: "Failed to fetch" }), /Supabase 项目正在运行/);
});

test("explains SMTP and email authorization failures without exposing provider details", () => {
  assert.match(authSendErrorMessage({ message: "Error sending confirmation email through SMTP" }), /SMTP/);
  assert.match(authSendErrorMessage({ message: "Email address not authorized" }), /没有允许这个邮箱/);
});

test("keeps OTP verification failures actionable", () => {
  assert.match(authVerifyErrorMessage({ message: "Token has expired" }), /已经过期/);
  assert.match(authVerifyErrorMessage({ status: 429, message: "Too many requests" }), /太频繁/);
});
