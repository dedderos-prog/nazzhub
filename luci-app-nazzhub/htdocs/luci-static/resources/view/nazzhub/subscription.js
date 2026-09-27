"use strict";
"require baseclass";
"require form";
"require ui";
"require uci";
"require fs";
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
      "--filter-tcp=80,443-65535 --out-range=-n8 --lua-desync=send:repeats=2 --lua-desync=syndata:blob=stun --lua-desync=hostfakesplit:hosts=google.com,vimeo.com:tcp_ts=-1000:tcp_md5:repeats=2 --new --filter-udp=443-65535 --payload=all --out-range=-d8 --lua-desync=fake:blob=fake_default_quic:repeats=6:payload=all",
    label: _("🌐 All TCP & UDP (hostfakesplit + syndata)"),
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

function showZapret2AutodetectModal() {
  const zid = getZapret2SectionId();
  let pollTimer = null;
  const prevRpcTimeout = L.env.rpctimeout;
  L.env.rpctimeout = 600;

  const categorySelect = E(
    "select",
    {
      class: "cbi-input-select",
      style: "width: 100%; margin-bottom: 12px; font-weight: 500;",
    },
    [
      E("option", { value: "youtube", selected: "selected" }, _("YouTube & Google (www.youtube.com)")),
      E("option", { value: "discord" }, _("Discord (голос, чат, стримы)")),
      E("option", { value: "gaming" }, _("🎮 Игры & UDP Realtime")),
      E("option", { value: "general" }, _("🌐 Общие сайты (Rutracker и блокировки)")),
      E("option", { value: "all" }, _("⚡ Все категории (полное тестирование)"))
    ]
  );

  const autoApplyCheckbox = E("input", {
    type: "checkbox",
    id: "zapret2_autoapply_cb",
    checked: true,
    style: "vertical-align: middle; margin-right: 8px;"
  });

  const autoApplyLabel = E(
    "label",
    { style: "display: block; margin-bottom: 14px; cursor: pointer; font-size: 0.95em;" },
    [
      autoApplyCheckbox,
      _("Автоматически применить лучшую найденную стратегию в Zapret2")
    ]
  );

  const statusContainer = E("div", {
    id: "zapret2_autodetect_status",
    style: "margin-top: 15px;"
  });

  const liveTableContainer = E("div", {
    style: "margin-top: 15px; max-height: 380px; overflow-y: auto;"
  });

  function applyStrategyToUi(stratText, stratName) {
    ensureZapret2Section();
    uci.set(UCI_PACKAGE, zid, "nfqws2_opt", stratText);
    uci.set(UCI_PACKAGE, zid, "enabled", "1");

    const selectElem = document.querySelector('select[name*="_zapret2_preset"]');
    if (selectElem) {
      let optionExists = false;
      for (let i = 0; i < selectElem.options.length; i++) {
        if (selectElem.options[i].value.trim() === stratText.trim()) {
          selectElem.selectedIndex = i;
          optionExists = true;
          break;
        }
      }
      if (!optionExists && stratText) {
        const newOpt = new Option(stratName || "Подобранная стратегия", stratText, true, true);
        selectElem.add(newOpt);
      }
      selectElem.dispatchEvent(new Event("change", { bubbles: true }));
    }

    fs.exec("/usr/bin/nazzhub", ["apply_zapret2_strategy", zid, stratText]).catch(() => {});

    ui.addNotification(
      null,
      E("p", {}, _("✓ Стратегия '") + (stratName || "Zapret2") + _("' успешно применена к секции Zapret2!")),
      "info"
    );
  }

  function updateTable(results, best) {
    liveTableContainer.innerHTML = "";
    const table = E("table", { class: "table", style: "width: 100%; font-size: 0.9em; border-collapse: collapse;" }, [
      E("tr", { class: "tr cbi-section-table-titles", style: "background: rgba(0,0,0,0.04);" }, [
        E("th", { class: "th", style: "padding: 8px 6px; text-align: left;" }, _("Стратегия")),
        E("th", { class: "th", style: "padding: 8px 6px; text-align: center; width: 130px;" }, _("Статус")),
        E("th", { class: "th", style: "padding: 8px 6px; text-align: center; width: 95px;" }, _("Задержка")),
        E("th", { class: "th", style: "padding: 8px 6px; text-align: center; width: 110px;" }, _("Действие"))
      ])
    ]);

    results.forEach((item) => {
      const isBest = best && best.id === item.id;
      const isWorking = item.working || (item.code >= 200 && item.code < 500);
      const latencyMs = item.latency_ms || Math.round((item.time || 0) * 1000);

      const statusBadge = isWorking
        ? E("span", { class: "badge", style: "background: #28a745; color: #fff; padding: 3px 7px; border-radius: 4px; font-weight: bold; font-size: 0.85em;" }, "🟢 " + item.code + " OK")
        : E("span", { class: "badge", style: "background: #dc3545; color: #fff; padding: 3px 7px; border-radius: 4px; font-size: 0.85em;" }, item.code ? "🔴 " + item.code + " Error" : _("🔴 DPI Drop"));

      const latencyBadge = isWorking
        ? E("strong", { style: "color: #2e7d32; font-size: 0.95em;" }, latencyMs + " ms")
        : E("span", { style: "color: #888;" }, "—");

      const applyBtn = E(
        "button",
        {
          class: "btn cbi-button cbi-button-apply",
          style: "padding: 2px 8px; font-size: 0.85em; margin: 0;",
          type: "button",
          click: function () {
            applyStrategyToUi(item.strategy, item.name);
          }
        },
        _("Применить")
      );

      const row = E(
        "tr",
        {
          class: "tr cbi-section-table-row",
          style: isBest
            ? "background: rgba(40, 167, 69, 0.12); font-weight: 500;"
            : (isWorking ? "background: rgba(40, 167, 69, 0.04);" : "")
        },
        [
          E("td", { class: "td", style: "padding: 7px 6px; word-break: break-word;" }, [
            isBest ? E("span", { style: "margin-right: 4px;" }, "⭐ ") : "",
            E("span", {}, item.display_name || item.name)
          ]),
          E("td", { class: "td", style: "padding: 7px 6px; text-align: center;" }, [statusBadge]),
          E("td", { class: "td", style: "padding: 7px 6px; text-align: center;" }, [latencyBadge]),
          E("td", { class: "td", style: "padding: 7px 6px; text-align: center;" }, isWorking ? [applyBtn] : [E("span", { style: "color: #aaa;" }, "—")])
        ]
      );
      table.appendChild(row);
    });

    liveTableContainer.appendChild(table);
  }

  function finishAutodetect(payload) {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    L.env.rpctimeout = prevRpcTimeout;
    runButton.disabled = false;
    runButton.textContent = _("⚡ Запустить снова");
    categorySelect.disabled = false;
    autoApplyCheckbox.disabled = false;

    if (!payload || !payload.success) {
      statusContainer.innerHTML = "";
      statusContainer.appendChild(
        E("div", { class: "alert-message danger" }, [
          E("strong", {}, _("Ошибка: ")),
          payload && payload.message ? payload.message : _("Тестирование завершилось неудачно.")
        ])
      );
      return;
    }

    const testedResults = payload.results || [];
    const best = payload.best_strategy;
    statusContainer.innerHTML = "";

    if (best) {
      const latencyMs = best.latency_ms || Math.round((best.time || 0) * 1000);
      statusContainer.appendChild(
        E("div", {
          class: "alert-message success",
          style: "margin-bottom: 12px; padding: 12px 16px; border-left: 5px solid #28a745; background: rgba(40, 167, 69, 0.1);"
        }, [
          E("h4", { style: "margin: 0 0 6px 0; color: #1b5e20; font-size: 1.1em;" }, _("🎉 Найдена лучшая рабочая стратегия Zapret2!")),
          E("div", { style: "margin-bottom: 8px;" }, [
            _("Стратегия: "),
            E("strong", { style: "color: #0d47a1;" }, best.display_name || best.name),
            _(" — Задержка: "),
            E("strong", { style: "color: #2e7d32;" }, latencyMs + " ms"),
            " (HTTP " + best.code + ")"
          ]),
          payload.applied
            ? E("div", { style: "color: #1b5e20; font-weight: bold; margin-bottom: 6px;" }, _("✓ Стратегия автоматически применена в Zapret2 и сервис перезапущен."))
            : E("button", {
                class: "btn cbi-button cbi-button-apply",
                style: "font-weight: bold;",
                type: "button",
                click: function () {
                  applyStrategyToUi(best.strategy, best.name);
                }
              }, _("✔ Применить эту стратегию"))
        ])
      );
    } else {
      statusContainer.appendChild(
        E("div", { class: "alert-message warning", style: "margin-bottom: 12px;" }, [
          E("strong", {}, _("⚠️ Ни одна из стратегий не смогла обойти блокировку в этой категории.")),
          E("p", { style: "margin: 6px 0 0 0; font-size: 0.9em;" }, _("Попробуйте категорию 'Все категории' или 'Universal', либо проверьте интернет-соединение."))
        ])
      );
    }

    if (testedResults.length > 0) {
      liveTableContainer.style.display = "block";
      updateTable(testedResults, best);
      statusContainer.appendChild(liveTableContainer);
    }
  }

  const runButton = E(
    "button",
    {
      class: "btn cbi-button cbi-button-action",
      style: "font-size: 1.05em; padding: 6px 16px;",
      type: "button",
      click: function () {
        const selectedCategory = categorySelect.value;
        const shouldApply = autoApplyCheckbox.checked ? "1" : "0";

        runButton.disabled = true;
        categorySelect.disabled = true;
        autoApplyCheckbox.disabled = true;
        runButton.textContent = _("⏳ Тестирование стратегий...");

        statusContainer.innerHTML = "";
        liveTableContainer.innerHTML = "";

        const progressHeader = E("div", { style: "margin-bottom: 6px; font-weight: bold;" }, _("Запуск изолированного теста Zapret2..."));
        const progressDetail = E("div", { style: "margin-bottom: 8px; color: #555; font-size: 0.95em;" }, _("Подготовка стенда на очереди 4399..."));
        const progressBarInner = E("div", {
          style: "height: 8px; width: 0%; background: #1e90ff; border-radius: 4px; transition: width 0.3s;"
        });
        const progressBar = E("div", {
          style: "height: 8px; width: 100%; background: #e0e0e0; border-radius: 4px; margin-bottom: 12px; overflow: hidden;"
        }, [progressBarInner]);

        statusContainer.appendChild(progressHeader);
        statusContainer.appendChild(progressDetail);
        statusContainer.appendChild(progressBar);
        statusContainer.appendChild(liveTableContainer);

        fs.exec("/usr/bin/nazzhub", ["zapret2_autodetect_async", selectedCategory, zid, shouldApply])
          .then((res) => {
            let startRes = null;
            try {
              startRes = JSON.parse((res && res.stdout ? res.stdout : "{}").trim() || "{}");
            } catch (e) {
              startRes = null;
            }

            if (!startRes || !startRes.success) {
              return fs.exec("/usr/bin/nazzhub", ["zapret2_autodetect", selectedCategory, zid, shouldApply])
                .then((syncRes) => {
                  let payload = null;
                  try {
                    payload = JSON.parse((syncRes && syncRes.stdout ? syncRes.stdout : "{}").trim() || "{}");
                  } catch (e) {
                    payload = null;
                  }
                  finishAutodetect(payload);
                });
            }

            pollTimer = setInterval(() => {
              fs.exec("/usr/bin/nazzhub", ["zapret2_autodetect_status"])
                .then((statusRes) => {
                  let state = null;
                  try {
                    state = JSON.parse((statusRes && statusRes.stdout ? statusRes.stdout : "{}").trim() || "{}");
                  } catch (e) {
                    state = null;
                  }

                  if (!state) return;

                  if (state.status === "running") {
                    const cur = state.current || 0;
                    const total = state.total || 1;
                    const pct = Math.round((cur / total) * 100);
                    progressBarInner.style.width = pct + "%";
                    progressHeader.textContent = _("Тестирование стратегий: ") + cur + " / " + total + " (" + pct + "%)";
                    progressDetail.textContent = (state.current_name ? _("Текущая: ") + state.current_name : _("Тестирование...")) +
                      (state.target_domain ? " [" + state.target_domain + " -> " + (state.target_ip || "") + "]" : "");
                    if (state.results && state.results.length > 0) {
                      liveTableContainer.style.display = "block";
                      updateTable(state.results, state.best_strategy);
                    }
                  } else if (state.status === "done") {
                    progressBarInner.style.width = "100%";
                    finishAutodetect(state);
                  }
                })
                .catch(() => {});
            }, 800);
          })
          .catch((err) => {
            L.env.rpctimeout = prevRpcTimeout;
            runButton.disabled = false;
            categorySelect.disabled = false;
            autoApplyCheckbox.disabled = false;
            statusContainer.innerHTML = "";
            statusContainer.appendChild(
              E("div", { class: "alert-message danger" }, [
                E("strong", {}, _("Ошибка запуска: ")),
                err && err.message ? err.message : String(err)
              ])
            );
          });
      }
    },
    _("⚡ Запустить автоподбор")
  );

  // Check if there are already cached results to display immediately
  fs.exec("/usr/bin/nazzhub", ["zapret2_autodetect_status"]).then((res) => {
    try {
      const state = JSON.parse((res && res.stdout ? res.stdout : "{}").trim() || "{}");
      if (state && state.results && state.results.length > 0) {
        liveTableContainer.style.display = "block";
        updateTable(state.results, state.best_strategy);
        statusContainer.appendChild(liveTableContainer);
      }
    } catch (e) {}
  }).catch(() => {});

  const modalBody = E("div", {}, [
    E("p", { style: "margin-bottom: 12px; color: #444; font-size: 0.95em; line-height: 1.45;" }, [
      _("Автоподборщик безопасно тестирует каждую стратегию Zapret2 на изолированном сетевом стенде (очередь 4399) без нарушения работы основного интернета роутера, измеряет отклик (latency) и код ответа (HTTP 200).")
    ]),
    E("label", { style: "font-weight: bold; display: block; margin-bottom: 4px;" }, _("Категория сервиса:")),
    categorySelect,
    autoApplyLabel,
    E("div", { style: "margin-bottom: 14px;" }, [runButton]),
    statusContainer
  ]);

  ui.showModal(_("🔍 Автоподбор стратегий Zapret2"), [
    modalBody,
    E("div", { class: "button-row", style: "margin-top: 15px; text-align: right;" }, [
      E("button", {
        class: "btn cbi-button cbi-button-neutral",
        type: "button",
        click: function () {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          L.env.rpctimeout = prevRpcTimeout;
          ui.hideModal();
        }
      }, _("Закрыть"))
    ])
  ]);
}

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

  // 7b. Zapret2 Strategy Autodetector Trigger
  o = section.option(
    form.Button,
    "_zapret2_autodetect_btn",
    _("Автоподборщик стратегий Zapret2"),
    _(
      "Безопасный перебор стратегий Zapret2 на изолированном сетевом стенде (очередь 4399). Тестирует обход DPI для YouTube, Discord и игр с измерением пинга и подбором лучшей рабочей стратегии.",
    ),
  );
  o.inputtitle = _("🔍 Запустить автоподбор стратегии");
  o.inputstyle = "action";
  o.onclick = function (ev) {
    ev.preventDefault();
    showZapret2AutodetectModal();
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
