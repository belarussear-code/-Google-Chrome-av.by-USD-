(function () {
  if (document.documentElement.getAttribute("data-avbyusd-mounted")) return;
  document.documentElement.setAttribute("data-avbyusd-mounted", "1");

  const INJECT_CLASS = "avbyusd-eq";
  const CACHE_KEY = "avbyusd_rate_cache_v1";
  const CACHE_TTL_MS = 45 * 60 * 1000;
  const MYFIN_USD_URL = "https://myfin.by/currency/usd";
  const NBRB_USD_URL =
    "https://api.nbrb.by/exrates/rates/USD?parammode=2&periodicity=0";
  const PRICE_SELECTOR =
    ".listing-item__price-primary, [class*='listing-item__price-primary'], .listing-index__price, [class*='listing-index__price'], .listing-top__price-primary, [class*='listing-top__price-primary'], .card__price-button, [class*='card__price-button']";

  function injectCss() {
    if (document.getElementById("avbyusd-webview-style")) return;
    const s = document.createElement("style");
    s.id = "avbyusd-webview-style";
    s.textContent =
      "." +
      INJECT_CLASS +
      "{display:block;margin-top:4px;font-size:13px;font-weight:600;color:#1565c0;line-height:1.3;}" +
      "." +
      INJECT_CLASS +
      " .avbyusd-eq__hint{display:block;margin-top:2px;font-size:11px;font-weight:400;color:#607d8b;}" +
      "." +
      INJECT_CLASS +
      ".avbyusd-eq--muted{color:#78909c;font-weight:500;}";
    (document.head || document.documentElement).appendChild(s);
  }

  function parseMyfinNbrbUsd(html) {
    const m = html.match(
      /data-popover-selector="nbrbUSD"[\s\S]{0,5000}?<span class="accent">\s*([\d.,]+)\s*</i
    );
    if (!m) return null;
    const n = parseFloat(String(m[1]).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  async function fetchRateFromNetwork() {
    try {
      const res = await fetch(MYFIN_USD_URL, {
        credentials: "omit",
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
      if (!res.ok) throw new Error("myfin");
      const html = await res.text();
      const rate = parseMyfinNbrbUsd(html);
      if (!rate) throw new Error("myfin parse");
      return { ok: true, bynPerUsd: rate, source: "myfin.by (НБРБ)" };
    } catch (_) {
      const res = await fetch(NBRB_USD_URL, { credentials: "omit" });
      if (!res.ok) return { ok: false, error: "nbrb HTTP" };
      const data = await res.json();
      const scale = Number(data.Cur_Scale) || 1;
      const official = Number(data.Cur_OfficialRate);
      if (!Number.isFinite(official) || official <= 0)
        return { ok: false, error: "nbrb data" };
      return {
        ok: true,
        bynPerUsd: official / scale,
        source: "api.nbrb.by",
      };
    }
  }

  async function requestRate() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const hit = JSON.parse(raw);
        if (
          hit &&
          typeof hit.bynPerUsd === "number" &&
          typeof hit.fetchedAt === "number" &&
          Date.now() - hit.fetchedAt < CACHE_TTL_MS
        ) {
          return {
            ok: true,
            bynPerUsd: hit.bynPerUsd,
            source: (hit.source || "") + " · кэш",
          };
        }
      }
    } catch (_) {}
    const r = await fetchRateFromNetwork();
    if (r.ok) {
      try {
        sessionStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            bynPerUsd: r.bynPerUsd,
            source: r.source,
            fetchedAt: Date.now(),
          })
        );
      } catch (_) {}
    }
    return r;
  }

  function normalizeWs(text) {
    return (text || "")
      .replace(/[\u00a0\u2009\u202f\u2007\u00ad\ufeff]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseBynPrimary(text) {
    if (!text) return null;
    const c = normalizeWs(text);
    if (!c || /договорн|по запросу|цена не указ/i.test(c)) return null;
    if (!/(?:\u0440|р|p)\./i.test(c)) return null;
    const withoutCur = c
      .replace(/\s*(?:\u0440|р|p)\.\s*$/i, "")
      .replace(/\s*\u0440\u0443\u0431\.?\s*$/i, "")
      .trim();
    const compact = withoutCur.replace(/\s/g, "").replace(",", ".");
    const n = parseFloat(compact);
    if (!Number.isFinite(n) || n < 50) return null;
    return n;
  }

  function collectPriceNodes() {
    var list = document.querySelectorAll(PRICE_SELECTOR);
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(list[i]);
    return out;
  }

  function formatUsd(amount) {
    const rounded = Math.round(amount);
    return (
      "≈ " +
      rounded.toLocaleString("ru-BY", {
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }) +
      " $"
    );
  }

  function injectNearPrice(priceEl, rateInfo) {
    if (!priceEl) return;
    const raw = priceEl.textContent || "";
    const byn = parseBynPrimary(raw);
    if (byn == null) return;
    const next = priceEl.nextElementSibling;
    if (!rateInfo.ok) {
      if (next && next.classList && next.classList.contains(INJECT_CLASS)) return;
      const err = document.createElement("div");
      err.className = INJECT_CLASS + " avbyusd-eq--muted";
      err.textContent = "Курс USD не загрузился — потяните вниз для обновления.";
      priceEl.insertAdjacentElement("afterend", err);
      return;
    }
    if (next && next.classList && next.classList.contains(INJECT_CLASS)) {
      if (next.classList.contains("avbyusd-eq--muted")) {
        next.remove();
      } else {
        const same =
          next.dataset.avbyusdByn === String(Math.round(byn)) &&
          next.dataset.avbyusdRate === String(rateInfo.bynPerUsd);
        if (same) return;
        next.remove();
      }
    }
    const usd = byn / rateInfo.bynPerUsd;
    const line = document.createElement("div");
    line.className = INJECT_CLASS;
    line.dataset.avbyusdByn = String(Math.round(byn));
    line.dataset.avbyusdRate = String(rateInfo.bynPerUsd);
    line.textContent = formatUsd(usd);
    const hint = document.createElement("span");
    hint.className = "avbyusd-eq__hint";
    const src = rateInfo.source || "источник";
    hint.textContent =
      "курс " +
      rateInfo.bynPerUsd.toLocaleString("ru-BY", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }) +
      " BYN за 1 USD · " +
      src +
      " · приложение";
    line.appendChild(hint);
    priceEl.insertAdjacentElement("afterend", line);
  }

  let lastRate = null;
  let rateFailLoads = 0;
  let scanTimer = null;

  async function scan() {
    if ((!lastRate || !lastRate.ok) && rateFailLoads < 8) {
      const attempt = await requestRate();
      if (attempt.ok) {
        lastRate = attempt;
      } else {
        rateFailLoads++;
        lastRate = attempt;
      }
    }
    const prices = collectPriceNodes();
    if (!prices.length) return;
    for (let i = 0; i < prices.length; i++) {
      injectNearPrice(prices[i], lastRate || { ok: false });
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(function () {
      scan().catch(function () {});
    }, 200);
  }

  injectCss();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleScan, { once: true });
  } else {
    scheduleScan();
  }

  const obs = new MutationObserver(scheduleScan);
  obs.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("pageshow", function (e) {
    if (e.persisted) scheduleScan();
  });
})();
