# Herbert 登录与用户 API Key 模块

## 这次解决什么问题

如果 Herbert 面向所有人开放，而所有 AI 请求都使用开发者自己的 API Key，用户越多，开发者承担的模型费用越高，也很容易被恶意请求耗尽额度。

V1.0 采用 BYOK（Bring Your Own Key，用户自带密钥）模式：用户登录 Herbert 后，选择 AI 服务商、模型并连接自己的 API Key。总结、问答和学习材料产生的模型费用由用户自己的服务商账户承担。

## 为什么选择邮箱验证码登录

Herbert 使用 Supabase Email OTP：用户输入邮箱，收到 8 位一次性验证码，再回到原来的 Herbert 页面输入验证码。

最初版本使用 Magic Link。测试时发现，QQ 邮箱可能在 Safari 或邮件内置浏览器里打开链接，而 Herbert 位于另一个浏览器。Supabase 会在打开链接的浏览器里建立登录会话，因此原来的 Herbert 页面仍显示未登录。验证码方案把最后一步留在原页面，避免跨浏览器会话丢失。

这样做的好处是：

- Herbert 不接触和保存用户密码；
- 没有“忘记密码”和重置密码流程；
- Supabase 负责登录会话、刷新令牌和退出登录；
- 第一次使用和以后登录采用同一套界面；
- 不需要把带有登录凭证的链接复制到另一个浏览器。

在正式公开发布前，需要给 Supabase 配置自定义 SMTP 邮件服务。Supabase 自带邮件服务适合开发测试，不适合大量公开用户。

Supabase 的 `signInWithOtp` 同时支持 Magic Link 和 Email OTP。使用哪一种由邮件模板决定：模板包含 `{{ .ConfirmationURL }}` 时发送链接，包含 `{{ .Token }}` 时发送验证码。Herbert 使用 `verifyOtp({ email, token, type: "email" })` 在当前浏览器建立会话。

### Supabase 邮件模板

在 Supabase Dashboard 打开 `Authentication → Email Templates → Magic Link`，把正文改为：

```html
<h2>你的 Herbert 登录验证码</h2>
<p>请回到 Herbert，在原页面输入下面的 8 位验证码：</p>
<p style="font-size: 32px; font-weight: 700; letter-spacing: 8px;">{{ .Token }}</p>
<p>验证码只能使用一次。若不是你本人操作，请忽略这封邮件。</p>
```

模板里不要继续放 `{{ .ConfirmationURL }}`，否则 Supabase 仍会发送魔法链接。

## API Key 的安全边界

```text
浏览器
  ├── 保存 Supabase 登录会话
  ├── 选择 AI 服务商和模型
  ├── 输入 API Key（只在连接或替换时）
  └── 以后只看到服务商、模型与 ••••1234
          │
          ▼ HTTPS
Herbert 服务器
  ├── 验证 Supabase 用户令牌
  ├── 通过固定的官方接口验证 Key
  └── 使用服务器权限访问 Vault
          │
          ▼
Supabase Vault
  └── 加密保存每个用户的 AI API Key
```

完整密钥不会写入 React state 之外的浏览器存储，也不会在保存后由 Herbert 接口返回。AI 请求发生时，服务器按当前用户 ID 从 Vault 临时取出密钥，在内存中调用所选服务商。

## 数据库设计

普通表 `herbert_api_credentials` 只保存：

- Supabase 用户 ID；
- 模型提供商与模型名称；
- Vault 密钥编号；
- 用于界面显示的末尾四位；
- 创建和更新时间。

真正的 API Key 由 Supabase Vault 使用项目独立的加密根密钥保存。普通用户、匿名访问者以及浏览器公开密钥都没有执行读取 Vault 函数的权限，只有服务器的 `service_role` 可以调用。

## AI 请求流程

1. 浏览器从 Supabase 会话取得短期访问令牌。
2. 浏览器请求 Herbert API，并在 `Authorization` 请求头中携带访问令牌。
3. Herbert 向 Supabase Auth 验证令牌，得到可信用户 ID。
4. Herbert 用服务器权限按用户 ID 读取 Vault 密钥。
5. Herbert 用该密钥调用用户选择的 AI 服务商。
6. AI 结果返回用户；完整密钥不会出现在响应中。

总结、问答和复习材料三个接口全部使用同一条认证与取钥流程，避免某个功能遗漏保护。

## 本地课程如何与账号共存

课程、分页文字和总结仍然放在 IndexedDB，不进入云数据库。但是每条课程和文档都增加了 `ownerId`。

同一浏览器登录另一个账号时，只能查询属于该账号的数据。升级前没有 `ownerId` 的旧记录，会在第一次登录时归到第一个登录账号，避免已有学习资料突然消失。

## 验收步骤

1. 未登录时只能看到邮箱登录页。
2. 输入邮箱，收到验证码后留在 Herbert 原页面。
3. 输入 8 位验证码并登录。
4. 第一次登录后，页面要求选择服务商、模型并连接 API Key。
5. 输入错误 Key，确认 Herbert 拒绝保存。
6. 输入正确 Key，确认页面显示末尾四位并进入课程书架。
7. 上传 PDF 并生成总结，确认使用自己的 AI 服务商账户。
8. 在“管理 AI”中替换或删除 Key。
9. 删除 Key 后，确认必须重新连接才能继续使用 AI。
10. 退出登录，确认课程内容不会显示给另一个账号。

## V1.0 的已知限制与后续方向

- 已配置自定义 SMTP 和 Herbert 品牌登录邮件，但投递速度仍受 Brevo 与收件邮箱影响；Gmail 未收到时应先检查垃圾邮件并等待重发倒计时；
- 每次重新发送都会使之前邮件中的验证码失效；页面显示本次发送时间，用户应只使用之后收到的最新邮件；
- V1.0 不增加 Google 或 GitHub 快捷登录，继续使用邮箱验证码；
- 增加验证码或 CAPTCHA，降低批量注册风险；
- 增加服务条款、隐私说明和账号删除功能；
- 为 API 接口增加用户级速率限制；
- 决定 VIP 是否提供课程云同步，而不是把 API Key 当作收费功能。

## 你应该掌握的知识

- 认证回答“你是谁”，授权回答“你能访问谁的数据”；
- 浏览器公开密钥和服务器秘密密钥具有完全不同的权限；
- 数据库加密并不等于任何人都可以读取解密视图，权限控制同样重要；
- API Key 验证应在保存前完成，且日志中不能打印 Key；
- 登录后，本地数据也需要用户隔离，否则共享电脑会泄露学习记录；
- BYOK 把模型成本从平台转移给用户，但平台仍需承担认证、安全和产品责任。
