"use strict";
"require baseclass";
"require form";
"require ui";
"require uci";
"require view.nazzhub.main as main";

const UCI_PACKAGE = main.FORKOP_UCI_PACKAGE;
const TARGET_SECTION_NAME = "Main";

function getActiveSubscriptionSectionId() {
  const sections = uci.sections(UCI_PACKAGE, "subscription_url") || [];
  const mainSub = sections.find(
    (s) => s.section === TARGET_SECTION_NAME || s[".name"] === "main_sub",
  );
  if (mainSub && mainSub[".name"]) {
    return mainSub[".name"];
  }
  const newId = uci.add(UCI_PACKAGE, "subscription_url", "main_sub");
  const sid = newId || "main_sub";
  uci.set(UCI_PACKAGE, sid, "section", TARGET_SECTION_NAME);
  return sid;
}

function createSubscriptionContent(section, forkopMap) {
  // 1. Welcome & Info Banner
  let o = section.option(form.DummyValue, "_welcome_banner");
  o.rawhtml = true;
  o.cfgvalue = function () {
    return E("div", {
      class: "cbi-value",
      style: "margin-bottom: 1.5rem; padding: 1.25rem; border-radius: 8px; background: rgba(30, 144, 255, 0.07); border-left: 4px solid #1e90ff;"
    }, [
      E("h3", { style: "margin-top: 0; color: #1e90ff; display: flex; align-items: center; gap: 8px;" }, [
        E("span", { style: "font-size: 1.4rem;" }, "🚀"),
        _("NAZZHUB: Быстрый старт и подключение подписки")
      ]),
      E("p", { style: "margin-bottom: 0.5rem; line-height: 1.5;" },
        _("Вставьте вашу ссылку на подписку VPN в поле ниже. При вставке она мгновенно привязывается к основной секции «Main» и заменяет текущий адрес серверов.")
      ),
      E("div", { style: "font-size: 0.9em; opacity: 0.9; margin-top: 8px;" }, [
        E("div", { style: "margin: 4px 0;" }, [
          E("strong", {}, "🛡️ Zapret (DPI): "),
          _("Активирован локальный обход замедлений YouTube и Discord (без расхода трафика подписки).")
        ]),
        E("div", { style: "margin: 4px 0;" }, [
          E("strong", {}, "⚡ Секция Main (VPN): "),
          _("Приоритетная группа серверов с автоматической фильтрацией и переключением на резерв.")
        ]),
        E("div", { style: "margin: 4px 0;" }, [
          E("strong", {}, "🌐 DNS / DoH: "),
          _("Защищенный DNS over HTTPS (AdGuard Unfiltered, Google 8.8.8.8, dns.nazzhub.org/dns-query) + DNS-секция 111.88.96.54.")
        ])
      ])
    ]);
  };

  // 2. Subscription URL input
  o = section.option(
    form.TextValue,
    "url",
    _("URL подписки VPN (Секция Main)"),
    _("Вставьте ссылку на подписку от вашего провайдера (VLESS, Shadowsocks, Trojan, VMess и др.). При вставке подписка сразу попадает в секцию Main."),
  );
  o.rows = 4;
  o.wrap = "soft";
  o.rmempty = false;
  o.placeholder = "https://...";
  o.load = function (section_id) {
    const activeId = getActiveSubscriptionSectionId();
    return (
      uci.get(UCI_PACKAGE, activeId, "url") ||
      uci.get(UCI_PACKAGE, section_id, "url") ||
      ""
    );
  };
  o.write = function (section_id, value) {
    const normalized = (value || "").trim();
    const activeId = getActiveSubscriptionSectionId();
    uci.set(UCI_PACKAGE, activeId, "section", TARGET_SECTION_NAME);
    uci.set(UCI_PACKAGE, activeId, "url", normalized);
    if (section_id && section_id !== activeId) {
      uci.set(UCI_PACKAGE, section_id, "url", normalized);
    }
  };
  o.validate = function (_section_id, value) {
    const val = (value || "").trim();
    if (!val) {
      return _("Пожалуйста, введите URL подписки");
    }
    if (!/^https?:\/\/\S+/i.test(val)) {
      return _("URL должен начинаться с http:// или https://");
    }
    return true;
  };

  // Interactive paste & input listener on the rendered textarea
  const origRender = o.render;
  o.render = function (section_id, option_index, cfgvalue) {
    const node = origRender.call(this, section_id, option_index, cfgvalue);
    const textarea = node.querySelector("textarea");
    if (textarea) {
      const syncToMain = () => {
        const val = textarea.value.trim();
        const activeId = getActiveSubscriptionSectionId();
        uci.set(UCI_PACKAGE, activeId, "section", TARGET_SECTION_NAME);
        uci.set(UCI_PACKAGE, activeId, "url", val);
        const statusEl = document.getElementById("nazzhub-sub-sync-status");
        if (statusEl) {
          if (val) {
            statusEl.innerHTML = `✅ <span style="color: #28a745; font-weight: bold;">Привязано к секции Main:</span> <span style="font-family: monospace; font-size: 0.9em; word-break: break-all;">${val.length > 70 ? val.substring(0, 70) + "..." : val}</span>`;
          } else {
            statusEl.innerHTML = `⚠️ <span style="color: #dc3545;">Поле пустое. Вставьте ссылку на подписку.</span>`;
          }
        }
      };
      textarea.addEventListener("input", syncToMain);
      textarea.addEventListener("paste", () => {
        setTimeout(syncToMain, 30);
      });
    }
    return node;
  };

  // 3. Status indicator & Section Main Target note
  let statusOpt = section.option(form.DummyValue, "_section_link_info");
  statusOpt.rawhtml = true;
  statusOpt.cfgvalue = function () {
    const activeId = getActiveSubscriptionSectionId();
    const currentUrl = uci.get(UCI_PACKAGE, activeId, "url") || "";
    return E("div", {
      id: "nazzhub-sub-sync-status",
      style: "margin-top: -0.75rem; margin-bottom: 1.25rem; padding: 0.6rem 1rem; border-radius: 6px; background: rgba(0, 0, 0, 0.03); border: 1px dashed rgba(0, 0, 0, 0.15); font-size: 0.9em;"
    }, [
      E("span", { style: "font-weight: 500; color: #007bff;" }, "🎯 Секция назначения: "),
      E("strong", {}, "Main"),
      E("span", { style: "opacity: 0.7; margin-left: 8px;" },
        currentUrl
          ? _("(Текущая подписка настроена и готова к обновлению)")
          : _("(Вставьте ссылку, чтобы привязать её к секции Main)")
      )
    ]);
  };

  // 4. Instant Save & Download Action Button
  o = section.option(form.Button, "_update_btn", _("Обновление серверов"));
  o.inputstyle = "apply";
  o.inputtitle = _("Сохранить и загрузить серверы");
  o.onclick = function (ev) {
    ev.preventDefault();
    const targetBtn = ev.target;
    const originalText = targetBtn.textContent;
    const urlTextarea = document.querySelector('textarea[name*="url"]') || document.querySelector('textarea[id*="url"]');
    const newUrl = urlTextarea ? urlTextarea.value.trim() : "";

    if (!newUrl) {
      ui.addNotification(null, E("p", {}, _("Пожалуйста, вставьте URL подписки перед загрузкой")), "danger");
      return;
    }

    if (!/^https?:\/\/\S+/i.test(newUrl)) {
      ui.addNotification(null, E("p", {}, _("URL должен начинаться с http:// или https://")), "danger");
      return;
    }

    targetBtn.disabled = true;
    targetBtn.textContent = _("Сохранение и загрузка серверов...");

    const activeId = getActiveSubscriptionSectionId();
    uci.set(UCI_PACKAGE, activeId, "section", TARGET_SECTION_NAME);
    uci.set(UCI_PACKAGE, activeId, "url", newUrl);

    return uci
      .save()
      .then(() => uci.apply())
      .then(() => {
        if (
          main.ForkopShellMethods &&
          typeof main.ForkopShellMethods.subscriptionUpdateStart === "function"
        ) {
          return main.ForkopShellMethods.subscriptionUpdateStart(TARGET_SECTION_NAME);
        }
        return Promise.resolve({ success: true });
      })
      .then((res) => {
        if (res && res.success && res.data && res.data.job_id) {
          if (typeof main.ForkopShellMethods.waitSubscriptionUpdateJob === "function") {
            return main.ForkopShellMethods.waitSubscriptionUpdateJob(res.data.job_id);
          }
        }
        return res;
      })
      .then((finalRes) => {
        targetBtn.disabled = false;
        targetBtn.textContent = originalText;
        if (finalRes && finalRes.success === false) {
          ui.addNotification(
            null,
            E("p", {}, _("Ошибка при загрузке подписки: ") + (finalRes.error || "")),
            "danger",
          );
        } else {
          ui.addNotification(
            null,
            E("p", {}, _("Подписка секции Main успешно сохранена, серверы загружены!")),
            "info",
          );
        }
      })
      .catch((err) => {
        targetBtn.disabled = false;
        targetBtn.textContent = originalText;
        ui.addNotification(
          null,
          E("p", {}, _("Ошибка: ") + (err.message || err)),
          "danger",
        );
      });
  };

  // 5. Subscription Auto Update Toggle
  o = section.option(
    form.Flag,
    "subscription_update_enabled",
    _("Автообновление подписки"),
    _("Автоматически загружать обновленный список серверов по расписанию."),
  );
  o.default = "1";
  o.rmempty = false;
  o.load = function (section_id) {
    const activeId = getActiveSubscriptionSectionId();
    const val =
      uci.get(UCI_PACKAGE, activeId, "subscription_update_enabled") ||
      uci.get(UCI_PACKAGE, section_id, "subscription_update_enabled");
    return val === undefined ? "1" : val;
  };
  o.write = function (section_id, value) {
    const activeId = getActiveSubscriptionSectionId();
    uci.set(
      UCI_PACKAGE,
      activeId,
      "subscription_update_enabled",
      value ? "1" : "0",
    );
  };

  // 6. Subscription Update Interval
  o = section.option(
    form.ListValue,
    "subscription_update_interval",
    _("Интервал обновления"),
    _("Как часто проверять и обновлять серверы из подписки."),
  );
  o.value("30m", _("Каждые 30 минут"));
  o.value("1h", _("Каждый 1 час (рекомендуется)"));
  o.value("6h", _("Каждые 6 часов"));
  o.value("12h", _("Каждые 12 часов"));
  o.value("1d", _("Каждый день"));
  o.default = "1h";
  o.depends("subscription_update_enabled", "1");
  o.load = function (section_id) {
    const activeId = getActiveSubscriptionSectionId();
    return (
      uci.get(UCI_PACKAGE, activeId, "subscription_update_interval") ||
      uci.get(UCI_PACKAGE, section_id, "subscription_update_interval") ||
      "1h"
    );
  };
  o.write = function (section_id, value) {
    const activeId = getActiveSubscriptionSectionId();
    uci.set(UCI_PACKAGE, activeId, "subscription_update_interval", value || "1h");
  };

  // 7. Section Status Overview Cards
  o = section.option(form.DummyValue, "_sections_summary");
  o.rawhtml = true;
  o.cfgvalue = function () {
    return E("div", { style: "margin-top: 2rem;" }, [
      E("h4", { style: "margin-bottom: 0.75rem;" }, _("Настроенные секции маршрутизации")),
      E("div", {
        style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;"
      }, [
        // Card 1: Zapret
        E("div", {
          style: "padding: 1rem; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.02);"
        }, [
          E("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;" }, [
            E("strong", { style: "font-size: 1.1em;" }, "1. Zapret (DPI Bypass)"),
            E("span", { class: "badge", style: "background: #28a745; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;" }, _("Активно"))
          ]),
          E("p", { style: "font-size: 0.88em; margin: 0; opacity: 0.85;" },
            _("Оптимизированная стратегия NFQWS для обхода замедлений YouTube и Discord без расхода трафика VPN.")
          )
        ]),

        // Card 2: Main VPN
        E("div", {
          style: "padding: 1rem; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.02);"
        }, [
          E("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;" }, [
            E("strong", { style: "font-size: 1.1em;" }, "2. Main (VPN Proxy)"),
            E("span", { class: "badge", style: "background: #007bff; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;" }, _("Секция подписки"))
          ]),
          E("p", { style: "font-size: 0.88em; margin: 0; opacity: 0.85;" },
            _("Маршрутизация через подписку (VLESS/SS/Trojan). Создана группа Priority (уровень 1, все оставшиеся серверы).")
          )
        ]),

        // Card 3: DNS
        E("div", {
          style: "padding: 1rem; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.02);"
        }, [
          E("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;" }, [
            E("strong", { style: "font-size: 1.1em;" }, "3. DNS (Google AI)"),
            E("span", { class: "badge", style: "background: #6f42c1; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;" }, _("111.88.96.54"))
          ]),
          E("p", { style: "font-size: 0.88em; margin: 0; opacity: 0.85;" },
            _("DNS-сервер для резолва доменов Google AI и защиты от DNS-блокировок.")
          )
        ])
      ]),
      E("p", { style: "font-size: 0.85em; opacity: 0.7; margin-top: 1rem;" },
        _("Для изменения списков доменов, порядка секций или добавления новых правил перейдите на вкладку «Секции».")
      )
    ]);
  };
}

const EntryPoint = {
  createSubscriptionContent,
};

return baseclass.extend(EntryPoint);
