# NAZZHUB (OpenWrt)

[![Releases](https://img.shields.io/github/v/release/dedderos-prog/nazzhub?label=releases)](https://github.com/dedderos-prog/nazzhub/releases)
[![Build](https://github.com/dedderos-prog/nazzhub/actions/workflows/build.yml/badge.svg)](https://github.com/dedderos-prog/nazzhub/actions/workflows/build.yml)
[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html)

> **NAZZHUB** — служба выборочной и комплексной маршрутизации трафика для роутеров под управлением **OpenWrt** (21.x, 22.x, 23.x, 24.x на opkg/IPK и 25.x+ на apk).  
> Проект представляет собой форк и развитие решений [Forkop](https://github.com/ushan0v/forkop) и [Podkop](https://github.com/itdoginfo/podkop), полностью переписанный на `ucode` с поддержкой гибридной маршрутизации через sing-box, zapret, zapret2 и ByeDPI.

---

### 🚀 Установка на роутер

#### Способ 1: Экспресс-тестовая установка напрямую из репозитория (рекомендуется для тестов)
Не требует предварительной сборки и публикации релизов. Устанавливает актуальные файлы прямо из ветки `main`:

```sh
sh <(wget -O - https://raw.githubusercontent.com/dedderos-prog/nazzhub/main/install-test.sh)
```
*или через `curl`:*
```sh
sh <(curl -fsSL https://raw.githubusercontent.com/dedderos-prog/nazzhub/main/install-test.sh)
```

#### Способ 2: Стандартная пакетная установка из GitHub Releases (как в Forkop)
Когда в репозитории собран и опубликован релиз:

```sh
sh <(wget -O - https://raw.githubusercontent.com/dedderos-prog/nazzhub/main/install.sh)
```
*или через `curl`:*
```sh
sh <(curl -fsSL https://raw.githubusercontent.com/dedderos-prog/nazzhub/main/install.sh)
```

*(Если релиз еще не создан, скрипт автоматически предложит переключиться на тестовую установку).*

#### Способ 3: Прямая загрузка с ПК на роутер по локальной сети
Если нужно протестировать изменения на роутере прямо с компьютера без коммита в GitHub:
* В Windows (PowerShell):
  ```powershell
  .\deploy-local.ps1 192.168.1.1
  ```
* В Linux / macOS:
  ```sh
  ./deploy-local.sh 192.168.1.1
  ```

---

### 📦 Структура пакетов проекта

* **`nazzhub`** — основной бэкенд и демон управления маршрутизацией:
  * Конфигурация: `/etc/config/nazzhub`
  * Инициализационный скрипт: `/etc/init.d/nazzhub`
  * Утилита CLI: `/usr/bin/nazzhub`
  * Модули логики (ucode): `/usr/lib/nazzhub/`
* **`luci-app-nazzhub`** — веб-интерфейс для LuCI:
  * Расположение в меню: **Службы** ➔ **NAZZHUB** (`admin/services/nazzhub`)
  * Ресурсы интерфейса: `/www/luci-static/resources/view/nazzhub/`
* **`luci-i18n-nazzhub-ru`** — русская локализация веб-интерфейса.
* **`fe-app-nazzhub`** — исходный код интерфейса (TypeScript / Vite / tsup).

---

### ✨ Возможности и функционал

* **Быстрый старт и страница подписки**:
  * Специальная первая страница в веб-интерфейсе для мгновенной вставки ссылки на подписку VPN и загрузки серверов в один клик.
* **Преднастроенные секции «из коробки»**:
  * **Zapret**: Локальный обход замедлений YouTube и Discord с оптимизированной стратегией NFQWS без расхода VPN-трафика.
  * **Main (VPN)**: Готовая секция подключения с группой приоритетов `Priority` (уровень 1, все оставшиеся серверы) и списками `russia_outside`, `geoblock`, `meta`, `twitter`.
  * **DNS**: Защищенный резолвер `111.88.96.54` для Google AI и заблокированных доменных зон.
* **Широкий спектр протоколов**: VLESS (Reality), VMess, Shadowsocks, Trojan, Hysteria2, SOCKS5, HTTP, MTProto, Tailscale.
* **Поддержка sing-box extended** с современным транспортом **XHTTP**.
* **Поддержка подписок**: автоматическое обновление конфигураций прокси по расписанию и извлечение нод.
* **Гибридный обход блокировок**:
  * Встроенная интеграция с **Zapret**, **Zapret2** и **ByeDPI (ciadpi)** как независимых действий для правил.
  * Действие **Bypass** для прямого выхода в обход sing-box.
* **Управление списками и гео-базами**:
  * Встроенные списки популярных ресурсов (Discord, YouTube, Meta, Telegram, Cloudflare и др.).
  * Поддержка кастомных списков доменов и IP-подсетей.
  * Поддержка бинарных rule-set (`.srs`).
* **Гибкая маршрутизация DNS**:
  * FakeIP DNS и перенаправление запросов через прокси.
  * Резервные DNS-серверы и привязка отдельных DNS к выбранным доменным зонам.
  * Поддержка IPv6 и защита от утечек DNS.
* **Автоматический выбор узлов (URLTest)**:
  * Тестирование задержки (ping) и автоматическое переключение на наименее нагруженный узел.
  * Поддержка каскадных соединений (прокси через прокси).

---

### 🛠️ Сборка релизов и пакетов через GitHub Actions

В репозитории настроен автоматический CI/CD конвейер:

1. **Создание релиза**:
   * Создайте и запушьте Git-тег с версией формата `x.y.z`, например:
     ```sh
     git tag 1.0.0
     git push origin 1.0.0
     ```
   * Либо запустите workflow вручную в табе **Actions** ➔ **Build packages** с указанием версии (например, `1.0.0`).
2. **Результат**:
   * GitHub Actions скомпилирует пакеты `.ipk` (для OpenWrt 21-24) и `.apk` (для OpenWrt 25+).
   * Автоматически создастся GitHub Release, к которому будут прикреплены собранные архивы пакетов.
   * Команда установки `install.sh` сразу же станет способна загружать и устанавливать этот релиз.

---

### 📜 Лицензия и благодарности

Проект распространяется под лицензией **GPL-2.0-or-later**.

Основан на разработках:
* [Forkop (ushan0v/forkop)](https://github.com/ushan0v/forkop)
* [Podkop (itdoginfo/podkop)](https://github.com/itdoginfo/podkop)
