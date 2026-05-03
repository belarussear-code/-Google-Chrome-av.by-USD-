(function () {
  const INJECT_CLASS = "avbyusd-eq";
  /** Список: primary, индексная цена, кнопка на карточке */
  const PRICE_SELECTOR =
    ".listing-item__price-primary, [class*='listing-item__price-primary'], .listing-index__price, [class*='listing-index__price'], .listing-top__price-primary, [class*='listing-top__price-primary'], .card__price-button, [class*='card__price-button']";

  function normalizeWs(text) {
    return (text || "")
      .replace(/[\u00a0\u2009\u202f\u2007\u00ad\ufeff]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Только текст блока вида «20 043 р.» (кирилл. р. или лат. p.) */
  function parseBynPrimary(text) {
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
    return [...document.querySelectorAll(PRICE_SELECTOR)];
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

  function requestRate(forceRefresh) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: "GET_USD_RATE", forceRefresh },
          (res) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }
            resolve(res || { ok: false, error: "empty" });
          }
        );
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
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
      err.className = `${INJECT_CLASS} avbyusd-eq--muted`;
      err.textContent = "Курс USD не загрузился — обновите страницу.";
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
    hint.textContent = `курс ${rateInfo.bynPerUsd.toLocaleString("ru-BY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })} BYN за 1 USD · ${src}`;
    line.appendChild(hint);

    priceEl.insertAdjacentElement("afterend", line);
  }

  let lastRate = null;
  let rateFailLoads = 0;
  let scanTimer = null;

  async function scan() {
    if ((!lastRate || !lastRate.ok) && rateFailLoads < 8) {
      const attempt = await requestRate(false);
      if (attempt.ok) {
        lastRate = attempt;
      } else {
        rateFailLoads++;
        lastRate = attempt;
      }
    }

    const prices = collectPriceNodes();
    if (!prices.length) return;

    for (const el of prices) {
      injectNearPrice(el, lastRate || { ok: false });
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scan().catch(() => {});
    }, 200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleScan, { once: true });
  } else {
    scheduleScan();
  }

  const obs = new MutationObserver(scheduleScan);
  obs.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) scheduleScan();
  });
})();
