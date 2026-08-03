import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

const SHARE_URL = "https://focushourglass.com";
const SHARE_TEXT =
  "I'm using Focus Hourglass to protect my deep work hours — try it with me:";

export function ShareWithFriend() {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const data = {
      title: "Focus Hourglass",
      text: SHARE_TEXT,
      url: SHARE_URL,
    };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch {
      // user dismissed the native sheet — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(`${SHARE_TEXT} ${SHARE_URL}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="w-full max-w-md rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md px-4 py-3 transition-all hover:border-white/[0.12] hover:bg-white/[0.04] flex items-center justify-center gap-2"
      aria-label="Share Focus Hourglass with a friend"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-amber-300" strokeWidth={2} />
      ) : (
        <Share2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
      )}
      <span className="text-xs text-foreground/85">
        {copied ? "Link copied" : "Share with a friend"}
      </span>
      {!copied && (
        <Copy className="h-3 w-3 text-muted-foreground/50" strokeWidth={1.75} />
      )}
    </button>
  );
}
