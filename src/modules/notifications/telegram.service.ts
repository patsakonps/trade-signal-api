import axios from "axios";
import { env } from "../../config/env";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type TelegramSignalMessage = {
  ruleName: string;
  symbol: string;
  timeframe: string;
  signalType: string;
  zone?: string | null;
  price: number | string;
  candleCloseTime: Date;
  indicatorKey: string;
};

export class TelegramService {
  isConfigured(): boolean {
    return Boolean(env.TELEGRAM_BOT_TOKEN.trim());
  }

  getDefaultChatId(): string {
    return env.TELEGRAM_CHAT_ID.trim();
  }

  hasDefaultChatId(): boolean {
    return Boolean(this.getDefaultChatId());
  }

  resolveChatId(chatId?: string | null): string {
    return (chatId || this.getDefaultChatId()).trim();
  }

  private getApiUrl(method: string): string {
    const token = env.TELEGRAM_BOT_TOKEN.trim();
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN is not configured");
    }
    return `https://api.telegram.org/bot${token}/${method}`;
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    const resolvedChatId = this.resolveChatId(chatId);
    if (!resolvedChatId) {
      throw new Error("Telegram chatId is required. Set it in the app or TELEGRAM_CHAT_ID in .env");
    }

    await axios.post(
      this.getApiUrl("sendMessage"),
      {
        chat_id: resolvedChatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      },
      { timeout: 10_000 }
    );
  }

  async sendTestMessage(chatId: string): Promise<void> {
    const time = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    await this.sendMessage(
      chatId,
      [
        "✅ <b>Trade Zone Telegram Test</b>",
        "",
        "Telegram notification is connected.",
        `Time: <code>${escapeHtml(time)}</code>`
      ].join("\n")
    );
  }

  buildSignalMessage(input: TelegramSignalMessage): string {
    const priceText = typeof input.price === "number" ? input.price.toLocaleString(undefined, { maximumFractionDigits: 8 }) : input.price;
    const timeText = input.candleCloseTime.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    const emoji = input.signalType === "BUY" ? "🟢" : input.signalType === "SELL" ? "🔴" : "🟡";

    return [
      `${emoji} <b>Trade Signal Alert</b>`,
      "",
      `<b>${escapeHtml(input.symbol)}</b> · <code>${escapeHtml(input.timeframe)}</code>`,
      `Rule: <b>${escapeHtml(input.ruleName)}</b>`,
      `Indicator: <code>${escapeHtml(input.indicatorKey)}</code>`,
      `Signal: <b>${escapeHtml(input.signalType)}</b>`,
      input.zone ? `Zone: <b>${escapeHtml(input.zone)}</b>` : null,
      `Price: <code>${escapeHtml(priceText)}</code>`,
      `Candle close: <code>${escapeHtml(timeText)}</code>`,
      "",
      "Not financial advice. ตรวจสอบกราฟและความเสี่ยงก่อนตัดสินใจ"
    ]
      .filter(Boolean)
      .join("\n");
  }
}

export const telegramService = new TelegramService();
