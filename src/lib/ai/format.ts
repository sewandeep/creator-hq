// The assistant writes simple markdown (**bold**, "- " bullets). These turn it
// into Telegram HTML; the app renders it with the <Md> component.

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function mdToTelegram(md: string) {
  return escHtml(md)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|\n)\s*[-*] /g, "$1• ")
    .replace(/(^|\n)#{1,6} +(.+)/g, "$1<b>$2</b>")
    .slice(0, 3900);
}
