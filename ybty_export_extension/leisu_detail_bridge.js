(() => {
  "use strict";
  let attempts = 0;
  const publishTextLiveDom = () => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const eventPattern =
      /(?:^|\s)(?:\d{1,3}(?:\+\d{1,2})?[′']|\d{1,3}[:：]\d{2})|进球|射门|射正|角球|黄牌|红牌|换人|点球|伤停|比赛开始|上半场|中场|下半场|比赛结束|VAR/i;
    const entries = [...document.querySelectorAll("li,p,tr,article,section,div")]
      .filter(visible)
      .map((node) => String(node.innerText || "").replace(/\s+/g, " ").trim())
      .filter((text) => text.length >= 3 && text.length <= 280)
      .filter((text) => eventPattern.test(text))
      .filter((text) => {
        if (/^Lv\d+\s/i.test(text)) return false;
        if (/\d{4}\/\d{1,2}\/\d{1,2}/.test(text)) return false;
        if (/天气[:：]|mmHg|°C|℃|m\/s/.test(text)) return false;
        if (/^\d+\(\d+\)\s*射门\(射正\)/.test(text)) return false;
        if (/^(?:90['′]\s*)?75['′]\s*60['′]\s*HT\s*30['′]\s*15['′]/i.test(text)) {
          return false;
        }
        if (
          /角球\s+进球\s+点球\s+控球率/.test(text) ||
          /越位\s+进攻\s+换人\s+任意球/.test(text)
        ) {
          return false;
        }
        return true;
      });
    const uniqueEntries = [...new Set(entries)].filter(
      (text, index, all) =>
        !all.some(
          (other, otherIndex) =>
            otherIndex !== index &&
            other.length < text.length &&
            text.includes(other) &&
            other.length >= 8
        )
    );
    chrome.runtime.sendMessage({
      type: "CODEX_LEISU_DETAIL_API_RESPONSE",
      match_id: String(location.pathname.match(/detail-(\d+)/)?.[1] || ""),
      url: "dom:text-live",
      status: 200,
      data: {
        encoding: "json",
        content_type: "application/json",
        body: {
          captured_at: Date.now(),
          active_tab: "文字直播",
          entries: uniqueEntries.slice(0, 160)
        }
      }
    });
  };
  const activateTextLive = () => {
    attempts += 1;
    const candidates = [...document.querySelectorAll(
      "button,a,li,div,span"
    )].filter((node) => {
      const text = String(node.textContent || "").replace(/\s+/g, "").trim();
      return text === "文字直播";
    });
    const target = candidates.find((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    });
    if (target) {
      target.click();
      setTimeout(publishTextLiveDom, 900);
      setTimeout(publishTextLiveDom, 2200);
      return;
    }
    if (attempts < 12) setTimeout(activateTextLive, 250);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", activateTextLive, {
      once: true
    });
  } else {
    activateTextLive();
  }

  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.data?.source !== "codex-leisu-detail-api"
    ) {
      return;
    }
    chrome.runtime.sendMessage({
      type: "CODEX_LEISU_DETAIL_API_RESPONSE",
      match_id: String(event.data.match_id || ""),
      url: event.data.url,
      status: event.data.status,
      data: event.data.data
    });
  });
})();
