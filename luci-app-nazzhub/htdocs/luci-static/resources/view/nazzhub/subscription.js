"use strict";
"require baseclass";
"require form";
"require ui";
"require uci";
"require view.nazzhub.main as main";

const UCI_PACKAGE = main.NAZZHUB_UCI_PACKAGE || "nazzhub";
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

function getZapret2SectionId() {
  const sections = uci.sections(UCI_PACKAGE, "section") || [];
  const z2 = sections.find(
    (s) => s.action === "zapret2" || s[".name"] === "zapret2",
  );
  if (z2 && z2[".name"]) {
    return z2[".name"];
  }
  return "zapret2";
}

function ensureZapret2Section() {
  const zid = getZapret2SectionId();
  if (!uci.get(UCI_PACKAGE, zid)) {
    uci.add(UCI_PACKAGE, "section", zid);
    uci.set(UCI_PACKAGE, zid, "label", "Zapret2");
    uci.set(UCI_PACKAGE, zid, "action", "zapret2");
    uci.set(UCI_PACKAGE, zid, "community_lists", ["youtube"]);
  }
  return zid;
}

function ensureDnsSection(sid, label, type, server, enabled) {
  let sec = uci.get(UCI_PACKAGE, sid);
  if (!sec) {
    uci.add(UCI_PACKAGE, "section", sid);
  }
  uci.set(UCI_PACKAGE, sid, "label", label);
  uci.set(UCI_PACKAGE, sid, "action", "dns");
  uci.set(UCI_PACKAGE, sid, "dns_type", type);
  uci.set(UCI_PACKAGE, sid, "dns_server", server);
  uci.set(UCI_PACKAGE, sid, "enabled", enabled ? "1" : "0");
  const currentLists = uci.get(UCI_PACKAGE, sid, "community_lists");
  if (!currentLists || (Array.isArray(currentLists) && currentLists.length === 0)) {
    uci.set(UCI_PACKAGE, sid, "community_lists", ["google_ai", "xbox", "playstation"]);
  }
}

const ZAPRET2_PRESETS = [
  {
    value: "",
    label: _("По умолчанию (пустая / стандартная)"),
  },
  {
    value:
      "--filter-tcp=80,443 --filter-l7=tls --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_md5 --lua-desync=multidisorder:pos=1,midsld --new --filter-udp=443 --payload=quic_initial --lua-desync=fake:blob=fake_default_quic:repeats=6",
    label: _("YouTube & Google (TLS multidisorder + QUIC fake)"),
  },
  {
    value:
      "--filter-tcp=80,443 --filter-l7=tls --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_md5 --lua-desync=multidisorder:pos=1,midsld --new --filter-udp=443,19294-19344,50000-65535 --payload=all --lua-desync=fake:blob=fake_default_udp:repeats=6",
    label: _("Discord (Voice, Chat, Media)"),
  },
  {
    value:
      "--filter-tcp=80,443 --filter-l7=tls --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_md5 --lua-desync=multisplit:pos=1,midsld --new --filter-udp=443-65535 --payload=all --lua-desync=fake:blob=fake_default_quic:repeats=6:payload=all",
    label: _("🎮 Gaming & UDP Realtime (--payload=all)"),
  },
  {
    value:
      "--filter-tcp=80,443-65535 --out-range=-n8 --lua-desync=send:repeats=2 --lua-desync=syndata:blob=stun --lua-desync=hostfakesplit_multi:hosts=google.com,vimeo.com:tcp_ts=-1000:tcp_md5:repeats=2 --new --filter-udp=443-65535 --payload=all --out-range=-d8 --lua-desync=fake:blob=fake_default_quic:repeats=6:payload=all",
    label: _("🌐 All TCP & UDP (hostfakesplit_multi + syndata)"),
  },
  {
    value:
      "--filter-tcp=80,443 --filter-l7=tls --payload=tls_client_hello --out-range=-d1000 --in-range=-s5556 --lua-desync=circular:fails=1:time=300:retrans=3:nld=2 --lua-desync=fake:blob=fake_default_tls:strategy=1 --lua-desync=multidisorder:pos=1,midsld:strategy=1 --lua-desync=multisplit:pos=2,midsld-2:seqovl=1:strategy=2 --lua-desync=fake:blob=tls_clienthello_www_google_com:strategy=3:final --new --filter-udp=443-65535 --payload=all --lua-desync=fake:blob=fake_default_quic:repeats=6",
    label: _("⚡ Circular (Adaptive Lua auto-failover on RST)"),
  },
  {
    value:
      "--filter-tcp=80 --filter-l7=http --payload=http_req --lua-desync=fake:blob=fake_default_http:tcp_md5 --lua-desync=multisplit:pos=method+2 --new --filter-tcp=443 --filter-l7=tls --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_md5:tcp_seq=-10000 --lua-desync=multidisorder:pos=1,midsld --new --filter-udp=443 --filter-l7=quic --payload=quic_initial --lua-desync=fake:blob=fake_default_quic:repeats=6 --new --filter-udp=19294-19344,50000-65535 --payload=all --lua-desync=fake:blob=fake_default_udp:repeats=6",
    label: _("🛡️ Universal Zapret2 (HTTP + HTTPS + QUIC + Voice)"),
  },
];

function createSubscriptionContent(section, nazzhubMap) {
  // 1. Welcome & Info Banner
  let o = section.option(form.DummyValue, "_welcome_banner");
  o.rawhtml = true;
  o.cfgvalue = function () {
    return E(
      "div",
      {
        class: "cbi-value",
        style:
          "margin-bottom: 1.5rem; padding: 1.25rem; border-radius: 8px; background: rgba(30, 144, 255, 0.07); border-left: 4px solid #1e90ff;",
      },
      [
        E(
          "h3",
          {
            style:
              "margin-top: 0; color: #1e90ff; display: flex; align-items: center; gap: 8px;",
          },
          [
            E("span", { style: "font-size: 1.4rem;" }, "🚀"),
            _("NAZZHUB: Быстрый старт и подключение"),
          ],
        ),
        E(
          "p",
          { style: "margin-bottom: 0.5rem; line-height: 1.5;" },
          _(
            "Управляйте стратегией Zapret2, DNS для консолей Xbox/PS5 и подпиской VPN в одном месте.",
          ),
        ),
        E("div", { style: "font-size: 0.9em; opacity: 0.9; margin-top: 8px;" }, [
          E("div", { style: "margin: 4px 0;" }, [
            E("strong", {}, "🛡️ Zapret (DPI): "),
            _(
              "Локальный обход замедлений YouTube и Discord (без расхода трафика подписки).",
            ),
          ]),
          E("div", { style: "margin: 4px 0;" }, [
            E("strong", {}, "🎮 Xbox / PS5 DNS: "),
            _(
              "Smart DNS (DoT / DoH) для обхода региональных ошибок 0x80a40401, PSN и Google AI.",
            ),
          ]),
          E("div", { style: "margin: 4px 0;" }, [
            E("strong", {}, "⚡ Секция Main (VPN): "),
            _(
              "Маршрутизация остальных заблокированных сайтов через подписку (VLESS/SS/Trojan).",
            ),
          ]),
        ]),
      ],
    );
  };

  // 2. Subscription URL input
  o = section.option(
    form.TextValue,
    "url",
    _("URL подписки VPN (Секция Main)"),
    _(
      "Вставьте ссылку на подписку от вашего провайдера (VLESS, Shadowsocks, Trojan, VMess и др.). Если подписки нет, оставьте поле пустым.",
    ),
  );
  o.rows = 4;
  o.wrap = "soft";
  o.rmempty = true;
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
      return true;
    }
    if (!/^https?:\/\/\S+/i.test(val)) {
      return _("URL должен начинаться с http:// или https://");
    }
    return true;
  };

  // Interactive paste & input listener on the rendered textarea
  const origRenderWidget = o.renderWidget;
  o.renderWidget = function (section_id, option_index, cfgvalue) {
    const res = origRenderWidget.apply(this, [
      section_id,
      option_index,
      cfgvalue,
    ]);
    const attachListener = (node) => {
      if (!node) return node;
      const textarea =
        node && typeof node.querySelector === "function"
          ? node.querySelector("textarea")
          : node;
      if (textarea && typeof textarea.addEventListener === "function") {
        const syncToMain = () => {
          const val = (textarea.value || "").trim();
          const activeId = getActiveSubscriptionSectionId();
          uci.set(UCI_PACKAGE, activeId, "section", TARGET_SECTION_NAME);
          uci.set(UCI_PACKAGE, activeId, "url", val);
          const statusEl = document.getElementById("nazzhub-sub-sync-status");
          if (statusEl) {
            if (val) {
              statusEl.innerHTML = `✅ <span style="color: #28a745; font-weight: bold;">Привязано к секции Main:</span> <span style="font-family: monospace; font-size: 0.9em; word-break: break-all;">${val.length > 70 ? val.substring(0, 70) + "..." : val}</span>`;
            } else {
              statusEl.innerHTML = `ℹ️ <span style="color: #6c757d;">Поле пустое. Подписка не используется.</span>`;
            }
          }
        };
        textarea.addEventListener("input", syncToMain);
        textarea.addEventListener("paste", () => {
          setTimeout(syncToMain, 50);
        });
      }
      return node;
    };

    if (res instanceof Promise) {
      return res.then(attachListener);
    }
    return attachListener(res);
  };

  // 3. Status indicator & Section Main Target note
  let statusOpt = section.option(form.DummyValue, "_section_link_info");
  statusOpt.rawhtml = true;
  statusOpt.cfgvalue = function () {
    const activeId = getActiveSubscriptionSectionId();
    const currentUrl = uci.get(UCI_PACKAGE, activeId, "url") || "";
    return E(
      "div",
      {
        id: "nazzhub-sub-sync-status",
        style:
          "margin-top: -0.75rem; margin-bottom: 1.25rem; padding: 0.6rem 1rem; border-radius: 6px; background: rgba(0, 0, 0, 0.03); border: 1px dashed rgba(0, 0, 0, 0.15); font-size: 0.9em;",
      },
      [
        E(
          "span",
          { style: "font-weight: 500; color: #007bff;" },
          "🎯 Секция назначения: ",
        ),
        E("strong", {}, "Main"),
        E(
          "span",
          { style: "opacity: 0.7; margin-left: 8px;" },
          currentUrl
            ? _("(Текущая подписка настроена и готова к обновлению)")
            : _("(Подписка не настроена, можно добавить позже)"),
        ),
      ],
    );
  };

  // 4. Instant Save & Download Action Button
  o = section.option(form.Button, "_update_btn", _("Обновление серверов"));
  o.inputstyle = "apply";
  o.inputtitle = _("Сохранить и загрузить серверы");
  o.onclick = function (ev) {
    ev.preventDefault();
    const targetBtn = ev.target;
    const originalText = targetBtn.textContent;
    const urlTextarea =
      document.querySelector('textarea[name*="url"]') ||
      document.querySelector('textarea[id*="url"]');
    const newUrl = urlTextarea ? urlTextarea.value.trim() : "";

    if (!newUrl) {
      ui.addNotification(
        null,
        E("p", {}, _("Пожалуйста, вставьте URL подписки перед загрузкой")),
        "danger",
      );
      return;
    }

    if (!/^https?:\/\/\S+/i.test(newUrl)) {
      ui.addNotification(
        null,
        E("p", {}, _("URL должен начинаться с http:// или https://")),
        "danger",
      );
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
        const shellMethods =
          main.NAZZHUBShellMethods || main.NazzhubShellMethods;
        if (
          shellMethods &&
          typeof shellMethods.subscriptionUpdateStart === "function"
        ) {
          return shellMethods.subscriptionUpdateStart(TARGET_SECTION_NAME);
        }
        return Promise.resolve({ success: true });
      })
      .then((res) => {
        const shellMethods =
          main.NAZZHUBShellMethods || main.NazzhubShellMethods;
        if (res && res.success && res.data && res.data.job_id) {
          if (
            shellMethods &&
            typeof shellMethods.waitSubscriptionUpdateJob === "function"
          ) {
            return shellMethods.waitSubscriptionUpdateJob(res.data.job_id);
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
            E(
              "p",
              {},
              _("Ошибка при загрузке подписки: ") + (finalRes.error || ""),
            ),
            "danger",
          );
        } else {
          ui.addNotification(
            null,
            E(
              "p",
              {},
              _(
                "Подписка секции Main успешно сохранена, серверы загружены!",
              ),
            ),
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
    uci.set(
      UCI_PACKAGE,
      activeId,
      "subscription_update_interval",
      value || "1h",
    );
  };

  // 7. Zapret2 Strategy Preset Dropdown
  o = section.option(
    form.ListValue,
    "_zapret2_preset",
    _("Стратегия Zapret (DPI Bypass)"),
    _(
      "Выберите готовую проверенную стратегию Zapret2 для обхода замедлений YouTube, Discord, игр и сайтов.",
    ),
  );
  ZAPRET2_PRESETS.forEach((p) => {
    o.value(p.value, p.label);
  });
  o.default = "";
  o.load = function () {
    const zid = getZapret2SectionId();
    const val = (uci.get(UCI_PACKAGE, zid, "nfqws2_opt") || "").trim();
    const matched = ZAPRET2_PRESETS.find((p) => p.value.trim() === val);
    if (matched) return matched.value;
    if (val) {
      this.value(val, _("Пользовательская стратегия (из вкладки Секции)"));
      return val;
    }
    return "";
  };
  o.write = function (_section_id, value) {
    const zid = ensureZapret2Section();
    const cleanVal = (value || "").trim();
    uci.set(UCI_PACKAGE, zid, "nfqws2_opt", cleanVal);
    if (cleanVal) {
      uci.set(UCI_PACKAGE, zid, "enabled", "1");
    }
  };

  // 8. Xbox DNS - DoT Switch
  o = section.option(
    form.Flag,
    "_xbox_dns_dot",
    _("DoT xbox-dns.ru (порт 853)"),
    _(
      "Безопасный DNS over TLS (xbox-dns.ru:853). Обход региональных ошибок 0x80a40401 на Xbox и PS5, а также доступ к Google AI.",
    ),
  );
  o.default = "1";
  o.load = function () {
    const val = uci.get(UCI_PACKAGE, "xbox_dns_dot", "enabled");
    return val === undefined ? "1" : val === "1" ? "1" : "0";
  };
  o.write = function (_section_id, value) {
    ensureDnsSection(
      "xbox_dns_dot",
      "Xbox DNS (DoT)",
      "dot",
      "xbox-dns.ru",
      Boolean(value),
    );
  };

  // 9. Xbox DNS - DoH Switch
  o = section.option(
    form.Flag,
    "_xbox_dns_doh",
    _("DoH xbox-dns.ru/dns-query (порт 443)"),
    _(
      "Защищенный DNS over HTTPS (https://xbox-dns.ru/dns-query). Альтернативный канал, если провайдер блокирует порт 853.",
    ),
  );
  o.default = "0";
  o.load = function () {
    const val = uci.get(UCI_PACKAGE, "xbox_dns_doh", "enabled");
    return val === "1" ? "1" : "0";
  };
  o.write = function (_section_id, value) {
    ensureDnsSection(
      "xbox_dns_doh",
      "Xbox DNS (DoH)",
      "doh",
      "xbox-dns.ru/dns-query",
      Boolean(value),
    );
  };

  // 10. Section Status Overview Cards
  o = section.option(form.DummyValue, "_sections_summary");
  o.rawhtml = true;
  o.cfgvalue = function () {
    const zid = getZapret2SectionId();
    const zapretEnabled = uci.get(UCI_PACKAGE, zid, "enabled") !== "0";
    const zapretOpt = (uci.get(UCI_PACKAGE, zid, "nfqws2_opt") || "").trim();
    const presetObj = ZAPRET2_PRESETS.find((p) => p.value.trim() === zapretOpt);
    const zapretLabel = presetObj
      ? presetObj.label
      : zapretOpt
        ? _("Пользовательская")
        : _("По умолчанию");

    const dotEnabled = uci.get(UCI_PACKAGE, "xbox_dns_dot", "enabled") === "1";
    const dohEnabled = uci.get(UCI_PACKAGE, "xbox_dns_doh", "enabled") === "1";

    const activeId = getActiveSubscriptionSectionId();
    const subUrl = (uci.get(UCI_PACKAGE, activeId, "url") || "").trim();

    return E("div", { style: "margin-top: 2rem;" }, [
      E(
        "h4",
        { style: "margin-bottom: 0.75rem;" },
        _("Настроенные секции маршрутизации"),
      ),
      E(
        "div",
        {
          style:
            "display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem;",
        },
        [
          // Card 1: Zapret
          E(
            "div",
            {
              style:
                "padding: 1rem; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.02);",
            },
            [
              E(
                "div",
                {
                  style:
                    "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;",
                },
                [
                  E(
                    "strong",
                    { style: "font-size: 1.05em;" },
                    "1. Zapret (DPI Bypass)",
                  ),
                  E(
                    "span",
                    {
                      class: "badge",
                      style: `background: ${zapretEnabled ? "#28a745" : "#6c757d"}; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;`,
                    },
                    zapretEnabled ? _("Активно") : _("Отключено"),
                  ),
                ],
              ),
              E(
                "div",
                {
                  style:
                    "font-size: 0.88em; font-weight: 500; color: #1e90ff; margin-bottom: 4px;",
                },
                zapretLabel,
              ),
              E(
                "p",
                { style: "font-size: 0.84em; margin: 0; opacity: 0.85;" },
                _(
                  "Локальный обход замедлений YouTube и Discord без расхода трафика VPN.",
                ),
              ),
            ],
          ),

          // Card 2: Main VPN
          E(
            "div",
            {
              style:
                "padding: 1rem; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.02);",
            },
            [
              E(
                "div",
                {
                  style:
                    "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;",
                },
                [
                  E(
                    "strong",
                    { style: "font-size: 1.05em;" },
                    "2. Main (VPN Proxy)",
                  ),
                  E(
                    "span",
                    {
                      class: "badge",
                      style: `background: ${subUrl ? "#007bff" : "#ffc107"}; color: ${subUrl ? "#fff" : "#000"}; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;`,
                    },
                    subUrl ? _("Подписка активна") : _("Без подписки"),
                  ),
                ],
              ),
              E(
                "p",
                { style: "font-size: 0.85em; margin: 0; opacity: 0.85;" },
                subUrl
                  ? _(
                      "Маршрутизация заблокированных сайтов через подписку (VLESS/SS/Trojan).",
                    )
                  : _(
                      "Подписка не привязана. Трафик вне Zapret и Smart DNS идет напрямую.",
                    ),
              ),
            ],
          ),

          // Card 3: DoT xbox-dns.ru
          E(
            "div",
            {
              style:
                "padding: 1rem; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.02);",
            },
            [
              E(
                "div",
                {
                  style:
                    "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;",
                },
                [
                  E(
                    "strong",
                    { style: "font-size: 1.05em;" },
                    "3. DoT: xbox-dns.ru",
                  ),
                  E(
                    "span",
                    {
                      class: "badge",
                      style: `background: ${dotEnabled ? "#6f42c1" : "#6c757d"}; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;`,
                    },
                    dotEnabled ? _("Активно (TLS: 853)") : _("Отключено"),
                  ),
                ],
              ),
              E(
                "p",
                { style: "font-size: 0.85em; margin: 0; opacity: 0.85;" },
                _(
                  "Smart DNS для консолей Xbox, PS5 и Google AI. Обход ошибки 0x80a40401.",
                ),
              ),
            ],
          ),

          // Card 4: DoH xbox-dns.ru
          E(
            "div",
            {
              style:
                "padding: 1rem; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.02);",
            },
            [
              E(
                "div",
                {
                  style:
                    "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;",
                },
                [
                  E(
                    "strong",
                    { style: "font-size: 1.05em;" },
                    "4. DoH: xbox-dns.ru",
                  ),
                  E(
                    "span",
                    {
                      class: "badge",
                      style: `background: ${dohEnabled ? "#20c997" : "#6c757d"}; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;`,
                    },
                    dohEnabled ? _("Активно (HTTPS: 443)") : _("Отключено"),
                  ),
                ],
              ),
              E(
                "p",
                { style: "font-size: 0.85em; margin: 0; opacity: 0.85;" },
                _(
                  "Защищенный DNS over HTTPS для консолей и AI-сервисов.",
                ),
              ),
            ],
          ),
        ],
      ),
      E(
        "p",
        { style: "font-size: 0.85em; opacity: 0.7; margin-top: 1rem;" },
        _(
          "Для тонкой настройки списков доменов, порядка секций или добавления новых правил перейдите на вкладку «Секции».",
        ),
      ),
    ]);
  };
}

const EntryPoint = {
  createSubscriptionContent,
};

return baseclass.extend(EntryPoint);
