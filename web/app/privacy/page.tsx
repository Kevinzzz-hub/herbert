import type { Metadata } from "next";
import Link from "next/link";
import { HERBERT_VERSION } from "@/lib/version";

export const metadata: Metadata = {
  title: "隐私与数据 | Herbert",
  description: "了解 Herbert 如何处理 PDF、学习记录、登录信息与 DeepSeek API Key。",
  openGraph: {
    title: "隐私与数据 | Herbert",
    description: "Herbert 的本地数据、AI 请求与账号安全说明。",
    type: "website",
    images: [],
  },
  twitter: {
    card: "summary",
    title: "隐私与数据 | Herbert",
    description: "Herbert 的本地数据、AI 请求与账号安全说明。",
    images: [],
  },
};

export default function PrivacyPage() {
  return (
    <main className="policy-shell">
      <header className="site-header policy-header">
        <Link className="brand" href="/" aria-label="返回 Herbert">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-copy"><strong>HERBERT</strong><small>PRIVACY & DATA</small></span>
        </Link>
        <Link className="policy-back" href="/">返回 Herbert <span>→</span></Link>
      </header>

      <article className="policy-page">
        <div className="policy-intro">
          <p>PUBLIC BETA · CLEAR BY DESIGN</p>
          <h1>你的课程资料，<br /><em>应该由你掌握。</em></h1>
          <p>这份说明使用产品语言解释 Herbert 的数据边界。Herbert 不会把你的 PDF 建成自己的训练数据，也不会把原始 PDF 存进 Herbert 的服务器。</p>
        </div>

        <section className="data-map" aria-label="Herbert 数据流">
          <article><span>01</span><h2>保存在当前浏览器</h2><p>课程名称、提取后的 PDF 文字、总结、问答学习材料和测验记录保存在当前浏览器的本地数据库中。</p><strong>清除浏览器数据会删除这些记录</strong></article>
          <article><span>02</span><h2>保存在 Supabase</h2><p>登录邮箱、账号标识和加密后的 DeepSeek API Key 保存在 Supabase。Herbert 不保存密码。</p><strong>网页只显示 Key 的末尾四位</strong></article>
          <article><span>03</span><h2>发送给 DeepSeek</h2><p>生成总结时发送提取文字；课程问答只发送本地选出的相关片段。DeepSeek 费用计入用户自己的账户。</p><strong>原始 PDF 文件不会发送</strong></article>
        </section>

        <section className="policy-details">
          <div>
            <p>WHAT HERBERT ACCEPTS</p>
            <h2>当前使用边界</h2>
            <ul>
              <li>单份 PDF 最大 12 MB、120 页、80,000 个提取字符。</li>
              <li>仅支持可复制文字的 PDF；扫描件、加密或损坏文件可能无法处理。</li>
              <li>课程问答最多向 DeepSeek 发送 10 个相关页面片段，共不超过 18,000 个字符。</li>
              <li>AI 可能出错；重要结论应通过回答下方的文件名与页码回到原文核对。</li>
            </ul>
          </div>
          <div>
            <p>YOUR CONTROLS</p>
            <h2>你可以控制什么</h2>
            <ul>
              <li>删除单份文档记录或整门课程，移除当前浏览器中的学习数据。</li>
              <li>导出课程备份，在换设备或清理浏览器前自行保存。</li>
              <li>在“管理 AI”中替换或删除 DeepSeek API Key。</li>
              <li>退出登录只会结束当前会话，不会自动删除本地课程。</li>
            </ul>
          </div>
        </section>

        <aside className="policy-feedback">
          <div><p>FOUND A PROBLEM?</p><h2>公开测试需要真实反馈</h2><span>请不要在公开反馈中粘贴 API Key、验证码、完整 PDF 内容或私人邮箱。</span></div>
          <a href="https://github.com/Kevinzzz-hub/herbert/issues/new" target="_blank" rel="noreferrer">前往 GitHub 反馈 <span>↗</span></a>
        </aside>
      </article>

      <footer className="site-footer"><span>HERBERT · {HERBERT_VERSION}</span><p>Last updated · 2026-08-31</p></footer>
    </main>
  );
}
