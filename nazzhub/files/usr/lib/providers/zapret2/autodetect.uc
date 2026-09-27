#!/usr/bin/env ucode

let fs = require("fs");
let uci_module = require("uci");
let constants = require("core.constants");

const NFQWS2_BIN = "/opt/zapret2/nfq2/nfqws2";
const LUA_DIR = "/opt/zapret2/lua";
const PROBE_NFT_TABLE = "nazzhub_probe2";
const PROBE_QUEUE = 4399;
const DESYNC_MARK = "0x10000000";
const AUTODETECT_STATE_FILE = "/var/run/nazzhub/ui-state/zapret2-autodetect.json";
const STRATEGIES_BASE_DIR = "/usr/share/nazzhub/zapret2-strategies";

function as_string(val) {
    return val == null ? "" : "" + val;
}

function trim(val) {
    return replace(replace(as_string(val), /^[ \t\r\n]+/, ""), /[ \t\r\n]+$/, "");
}

function write_json(val) {
    print(sprintf("%J", val), "\n");
}

function ensure_ui_state_dir() {
    if (!fs.stat("/var/run/nazzhub/ui-state"))
        system("mkdir -p /var/run/nazzhub/ui-state");
}

function save_state(state) {
    ensure_ui_state_dir();
    fs.writefile(AUTODETECT_STATE_FILE, sprintf("%J", state));
}

function read_state() {
    let data = fs.readfile(AUTODETECT_STATE_FILE);
    if (!data)
        return null;
    let state = null;
    try {
        state = json(data);
    } catch (e) {
        state = null;
    }
    return state;
}

function command_output(cmd) {
    let pipe = fs.popen(cmd, "r");
    if (!pipe)
        return "";
    let data = pipe.read("all");
    pipe.close();
    return data == null ? "" : as_string(data);
}

function get_target_info(category) {
    category = lc(as_string(category || "youtube"));
    if (category == "discord") {
        return {
            category: "discord",
            domain: "discord.com",
            default_ip: "162.159.136.232",
            target_url: "https://discord.com"
        };
    } else if (category == "gaming") {
        return {
            category: "gaming",
            domain: "discord.com",
            default_ip: "162.159.136.232",
            target_url: "https://discord.com"
        };
    } else if (category == "general") {
        return {
            category: "general",
            domain: "rutracker.org",
            default_ip: "104.21.32.39",
            target_url: "https://rutracker.org"
        };
    }
    return {
        category: "youtube",
        domain: "www.youtube.com",
        default_ip: "142.251.150.4",
        target_url: "https://www.youtube.com"
    };
}

function resolve_target_ip(domain, fallback_ip) {
    let out = command_output("nslookup " + domain + " 1.1.1.1 2>/dev/null");
    if (out == "")
        out = command_output("nslookup " + domain + " 77.88.8.8 2>/dev/null");

    let lines = split(out, /[\r\n]+/);
    for (let line in lines) {
        let m = match(line, /Address:\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
        if (m && m[1]) {
            let ip = m[1];
            if (ip != "1.1.1.1" && ip != "77.88.8.8" && !match(ip, /:53$/))
                return ip;
        }
    }
    return fallback_ip;
}

const BUILTIN_STRATEGIES = {
    youtube: [
        {
            id: "yt_multidisorder_midsld",
            category: "youtube",
            name: "multidisorder (1,midsld)",
            display_name: "YouTube: multidisorder (1,midsld)",
            strategy: "--filter-tcp=80,443 --filter-l7=tls --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_seq=-10000 --lua-desync=multidisorder:pos=1,midsld --new --filter-udp=443 --payload=quic_initial --lua-desync=fake:blob=fake_default_quic:repeats=6"
        },
        {
            id: "yt_multisplit_midsld",
            category: "youtube",
            name: "multisplit (1,midsld)",
            display_name: "YouTube: multisplit (1,midsld)",
            strategy: "--filter-tcp=80,443 --filter-l7=tls --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_md5 --lua-desync=multisplit:pos=1,midsld --new --filter-udp=443 --payload=quic_initial --lua-desync=fake:blob=fake_default_quic:repeats=6"
        },
        {
            id: "yt_fakesplit_seqovl",
            category: "youtube",
            name: "fakesplit (pos=2, seqovl=1)",
            display_name: "YouTube: fakesplit (seqovl=1)",
            strategy: "--filter-tcp=80,443 --filter-l7=tls --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_md5:repeats=2 --lua-desync=multisplit:pos=2:seqovl=1 --new --filter-udp=443 --payload=quic_initial --lua-desync=fake:blob=fake_default_quic:repeats=6"
        },
        {
            id: "yt_multidisorder_sniext",
            category: "youtube",
            name: "multidisorder (sniext+1)",
            display_name: "YouTube: multidisorder (sniext+1)",
            strategy: "--filter-tcp=80,443 --filter-l7=tls --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_ts=-1000 --lua-desync=multidisorder:pos=1,sniext+1,midsld --new --filter-udp=443 --payload=quic_initial --lua-desync=fake:blob=fake_default_quic:repeats=6"
        },
        {
            id: "yt_circular_failover",
            category: "youtube",
            name: "Circular (адаптивный авто-failover)",
            display_name: "YouTube: Circular (Adaptive Lua failover)",
            strategy: "--filter-tcp=80,443 --filter-l7=tls --payload=tls_client_hello --out-range=-d1000 --in-range=-s5556 --lua-desync=circular:fails=1:time=300:retrans=3:nld=2 --lua-desync=fake:blob=fake_default_tls:strategy=1 --lua-desync=multidisorder:pos=1,midsld:strategy=1 --lua-desync=multisplit:pos=2,midsld-2:seqovl=1:strategy=2 --lua-desync=fake:blob=tls_clienthello_www_google_com:strategy=3:final --new --filter-udp=443-65535 --payload=all --lua-desync=fake:blob=fake_default_quic:repeats=6"
        },
        {
            id: "yt_hostfakesplit",
            category: "youtube",
            name: "hostfakesplit (google mask)",
            display_name: "YouTube: hostfakesplit (google mask)",
            strategy: "--filter-tcp=80,443 --filter-l7=tls --payload=tls_client_hello --lua-desync=send:repeats=2 --lua-desync=hostfakesplit:hosts=google.com:tcp_ts=-1000:tcp_md5:repeats=2 --new --filter-udp=443 --payload=quic_initial --lua-desync=fake:blob=fake_default_quic:repeats=6"
        }
    ],
    discord: [
        {
            id: "dc_all_udp_multidisorder",
            category: "discord",
            name: "Discord: multidisorder + UDP all (Voice)",
            display_name: "Discord: multidisorder + UDP all (Voice)",
            strategy: "--filter-tcp=80,443-65535 --filter-l7=tls --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_seq=-10000 --lua-desync=multidisorder:pos=1,midsld --new --filter-udp=443-65535 --payload=all --lua-desync=fake:blob=fake_default_udp:repeats=6:payload=all"
        },
        {
            id: "dc_syndata_hostfakesplit",
            category: "discord",
            name: "Discord: syndata + hostfakesplit",
            display_name: "Discord: syndata + hostfakesplit",
            strategy: "--filter-tcp=80,443-65535 --lua-desync=send:repeats=2 --lua-desync=syndata:blob=stun --lua-desync=hostfakesplit:hosts=google.com:tcp_ts=-1000:tcp_md5:repeats=2 --new --filter-udp=443-65535 --payload=all --lua-desync=fake:blob=fake_default_quic:repeats=6:payload=all"
        },
        {
            id: "dc_all_udp_multisplit",
            category: "discord",
            name: "Discord: multisplit + UDP all (Voice)",
            display_name: "Discord: multisplit + UDP all (Voice)",
            strategy: "--filter-tcp=80,443-65535 --filter-l7=tls --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_md5 --lua-desync=multisplit:pos=1,midsld --new --filter-udp=443-65535 --payload=all --lua-desync=fake:blob=fake_default_quic:repeats=6:payload=all"
        },
        {
            id: "dc_multidisorder_voice",
            category: "discord",
            name: "Discord: multidisorder + Voice ports",
            display_name: "Discord: multidisorder + Voice ports",
            strategy: "--filter-tcp=80,443 --filter-l7=tls --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_ts=-1000 --lua-desync=multidisorder:pos=1,sniext+1,midsld --new --filter-udp=443,19294-19344,50000-65535 --payload=all --lua-desync=fake:blob=fake_default_udp:repeats=6"
        }
    ],
    gaming: [
        {
            id: "game_all_udp_multisplit",
            category: "gaming",
            name: "Gaming: UDP all + multisplit",
            display_name: "Gaming: UDP all + multisplit",
            strategy: "--filter-tcp=80,443-65535 --filter-l7=tls --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_md5 --lua-desync=multisplit:pos=1,midsld --new --filter-udp=443-65535 --payload=all --lua-desync=fake:blob=fake_default_quic:repeats=6:payload=all"
        },
        {
            id: "game_syndata_hostfakesplit",
            category: "gaming",
            name: "Gaming: syndata stun + hostfakesplit",
            display_name: "Gaming: syndata stun + hostfakesplit",
            strategy: "--filter-tcp=80,443-65535 --lua-desync=send:repeats=2 --lua-desync=syndata:blob=stun --lua-desync=hostfakesplit:hosts=google.com:tcp_ts=-1000:tcp_md5:repeats=2 --new --filter-udp=443-65535 --payload=all --lua-desync=fake:blob=fake_default_quic:repeats=6:payload=all"
        },
        {
            id: "game_all_udp_multidisorder",
            category: "gaming",
            name: "Gaming: UDP all + multidisorder",
            display_name: "Gaming: UDP all + multidisorder",
            strategy: "--filter-tcp=80,443-65535 --filter-l7=tls --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_seq=-10000 --lua-desync=multidisorder:pos=1,midsld --new --filter-udp=443-65535 --payload=all --lua-desync=fake:blob=fake_default_udp:repeats=6:payload=all"
        }
    ],
    general: [
        {
            id: "gen_universal_full",
            category: "general",
            name: "Universal: HTTP + HTTPS + QUIC + Voice",
            display_name: "Universal: HTTP + HTTPS + QUIC + Voice",
            strategy: "--filter-tcp=80 --filter-l7=http --payload=http_req --lua-desync=fake:blob=fake_default_http:tcp_md5 --lua-desync=multisplit:pos=method+2 --new --filter-tcp=443 --filter-l7=tls --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_md5:tcp_seq=-10000 --lua-desync=multidisorder:pos=1,midsld --new --filter-udp=443 --filter-l7=quic --payload=quic_initial --lua-desync=fake:blob=fake_default_quic:repeats=6 --new --filter-udp=19294-19344,50000-65535 --payload=all --lua-desync=fake:blob=fake_default_udp:repeats=6"
        },
        {
            id: "gen_syndata_hostfakesplit",
            category: "general",
            name: "All TCP & UDP: hostfakesplit + syndata",
            display_name: "All TCP & UDP: hostfakesplit + syndata",
            strategy: "--filter-tcp=80,443-65535 --lua-desync=send:repeats=2 --lua-desync=syndata:blob=stun --lua-desync=hostfakesplit:hosts=google.com,vimeo.com:tcp_ts=-1000:tcp_md5:repeats=2 --new --filter-udp=443-65535 --payload=all --lua-desync=fake:blob=fake_default_quic:repeats=6:payload=all"
        },
        {
            id: "gen_circular",
            category: "general",
            name: "Universal: Circular failover",
            display_name: "Universal: Circular failover",
            strategy: "--filter-tcp=80,443 --filter-l7=tls --payload=tls_client_hello --out-range=-d1000 --in-range=-s5556 --lua-desync=circular:fails=1:time=300:retrans=3:nld=2 --lua-desync=fake:blob=fake_default_tls:strategy=1 --lua-desync=multidisorder:pos=1,midsld:strategy=1 --lua-desync=multisplit:pos=2,midsld-2:seqovl=1:strategy=2 --lua-desync=fake:blob=tls_clienthello_www_google_com:strategy=3:final --new --filter-udp=443-65535 --payload=all --lua-desync=fake:blob=fake_default_quic:repeats=6"
        }
    ]
};

function list_strategies(category) {
    category = lc(as_string(category || "all"));
    let results = [];
    let cats = [];

    if (category == "youtube")
        cats = [ "youtube" ];
    else if (category == "discord")
        cats = [ "discord" ];
    else if (category == "gaming")
        cats = [ "gaming" ];
    else if (category == "general")
        cats = [ "general" ];
    else
        cats = [ "youtube", "discord", "gaming", "general" ];

    for (let c in cats) {
        let builtins = BUILTIN_STRATEGIES[c] || [];
        for (let item in builtins)
            push(results, item);

        let dir = STRATEGIES_BASE_DIR + "/" + c;
        let files = fs.glob(dir + "/*.txt");
        if (files && length(files) > 0) {
            for (let file_path in files) {
                let data = fs.readfile(file_path);
                if (data == null)
                    continue;
                let strat = trim(data);
                if (strat == "")
                    continue;
                let filename = replace(file_path, /^.*\//, "");
                let base_name = replace(replace(filename, /\.bat-forkop\.txt$/, ""), /\.txt$/, "");
                push(results, {
                    id: c + "_" + replace(replace(lc(base_name), /[^a-z0-9]/g, "_"), /_+/g, "_"),
                    category: c,
                    filename: filename,
                    name: base_name,
                    display_name: c + ": " + base_name,
                    strategy: strat
                });
            }
        }
    }

    return results;
}

function list_strategies_command(category) {
    let list = list_strategies(category);
    write_json({
        success: true,
        count: length(list),
        strategies: list
    });
}

function cleanup_probe_firewall() {
    system("pkill -9 -f 'qnum=" + PROBE_QUEUE + "' 2>/dev/null || true");
    system("nft delete table inet " + PROBE_NFT_TABLE + " 2>/dev/null || true");
}

function setup_probe_firewall(target_ip) {
    cleanup_probe_firewall();
    system("nft add table inet " + PROBE_NFT_TABLE + " 2>/dev/null || true");
    system("nft 'flush table inet " + PROBE_NFT_TABLE + "' 2>/dev/null || true");
    system("nft 'add chain inet " + PROBE_NFT_TABLE + " postnat { type filter hook postrouting priority 102; }' 2>/dev/null || true");
    system("nft 'add rule inet " + PROBE_NFT_TABLE + " postnat meta nfproto ipv4 tcp dport 443 mark and " + DESYNC_MARK + " == 0 ip daddr " + target_ip + " queue num " + PROBE_QUEUE + "' 2>/dev/null || true");
    system("nft 'add chain inet " + PROBE_NFT_TABLE + " predefrag { type filter hook output priority -402; }' 2>/dev/null || true");
    system("nft 'add rule inet " + PROBE_NFT_TABLE + " predefrag meta nfproto ipv4 mark and " + DESYNC_MARK + " != 0 notrack' 2>/dev/null || true");
}

function test_single_strategy(strategy, domain, target_ip, target_url) {
    if (!fs.stat(NFQWS2_BIN))
        return { success: false, code: 0, time: 0, latency_ms: 0, error: "nfqws2 not installed" };

    let nfqws2_cmd = NFQWS2_BIN +
        " --qnum=" + PROBE_QUEUE +
        " --fwmark=" + DESYNC_MARK +
        " --lua-init=@" + LUA_DIR + "/zapret-lib.lua" +
        " --lua-init=@" + LUA_DIR + "/zapret-antidpi.lua" +
        " --lua-init=@" + LUA_DIR + "/zapret-auto.lua " +
        strategy + " >/dev/null 2>&1 & echo $!";

    let pid = trim(command_output(nfqws2_cmd));
    if (pid == "" || int(pid) <= 0)
        return { success: false, code: 0, time: 0, latency_ms: 0, error: "failed to start nfqws2" };

    system("sleep 0.2");

    let curl_cmd = "curl -k -s -o /dev/null -w '%{http_code}:%{time_total}' -m 3.5 --connect-timeout 2.2 --resolve '" +
        domain + ":443:" + target_ip + "' '" + target_url + "'";
    let output = trim(command_output(curl_cmd));

    system("kill -9 " + pid + " 2>/dev/null || true");
    system("pkill -9 -f 'qnum=" + PROBE_QUEUE + "' 2>/dev/null || true");

    let parts = split(output, ":");
    let code = int(parts[0] || 0);
    let time = length(parts) > 1 ? +parts[1] : 0.0;
    let latency_ms = int(time * 1000);

    let is_ok = code >= 200 && code < 500;
    return {
        success: is_ok,
        code: code,
        time: time,
        latency_ms: latency_ms
    };
}

function autodetect_worker(category, section_name, should_apply) {
    category = lc(as_string(category || "youtube"));
    section_name = as_string(section_name || "zapret2");
    should_apply = as_string(should_apply) == "1";

    let target = get_target_info(category);
    let target_ip = resolve_target_ip(target.domain, target.default_ip);

    let strategies = list_strategies(category);
    if (length(strategies) == 0) {
        let err_res = {
            status: "done",
            success: false,
            message: "No Zapret2 strategies found for category: " + category
        };
        save_state(err_res);
        write_json(err_res);
        return 1;
    }

    setup_probe_firewall(target_ip);

    let tested_results = [];
    let best_strategy = null;
    let min_latency = 99999.0;
    let total = length(strategies);

    for (let i = 0; i < total; i++) {
        let item = strategies[i];
        save_state({
            status: "running",
            category: category,
            target_domain: target.domain,
            target_ip: target_ip,
            target_url: target.target_url,
            current: i + 1,
            total: total,
            current_name: item.name,
            results: tested_results,
            best_strategy: best_strategy
        });

        let res = test_single_strategy(item.strategy, target.domain, target_ip, target.target_url);
        let result_entry = {
            id: item.id,
            category: item.category,
            name: item.name,
            display_name: item.display_name,
            code: res.code,
            time: res.time,
            latency_ms: res.latency_ms,
            working: res.success,
            strategy: item.strategy
        };
        push(tested_results, result_entry);

        if (res.success && res.time < min_latency) {
            min_latency = res.time;
            best_strategy = result_entry;
        }

        save_state({
            status: "running",
            category: category,
            target_domain: target.domain,
            target_ip: target_ip,
            target_url: target.target_url,
            current: i + 1,
            total: total,
            current_name: item.name,
            results: tested_results,
            best_strategy: best_strategy
        });
    }

    cleanup_probe_firewall();

    let applied = false;
    if (best_strategy != null && should_apply) {
        let cursor = uci_module.cursor();
        if (cursor) {
            cursor.set("nazzhub", section_name, "nfqws2_opt", best_strategy.strategy);
            cursor.set("nazzhub", section_name, "enabled", "1");
            cursor.commit("nazzhub");
            applied = true;
            system("/usr/bin/nazzhub reload >/dev/null 2>&1 &");
        }
    }

    let final_res = {
        status: "done",
        success: true,
        category: category,
        target_domain: target.domain,
        target_ip: target_ip,
        target_url: target.target_url,
        tested_count: length(tested_results),
        best_strategy: best_strategy,
        applied: applied,
        results: tested_results
    };
    save_state(final_res);
    write_json(final_res);
    return 0;
}

function autodetect(category, section_name, should_apply) {
    return autodetect_worker(category, section_name, should_apply);
}

function autodetect_async(category, section_name, should_apply) {
    category = lc(as_string(category || "youtube"));
    section_name = as_string(section_name || "zapret2");
    should_apply = as_string(should_apply) == "1";

    let target = get_target_info(category);
    let strategies = list_strategies(category);
    let total = length(strategies);

    let initial_state = {
        status: "running",
        category: category,
        target_domain: target.domain,
        target_url: target.target_url,
        current: 0,
        total: total,
        current_name: "Подготовка изолированного стенда...",
        results: [],
        best_strategy: null
    };
    save_state(initial_state);

    let cmd = "/usr/bin/nazzhub zapret2_autodetect_worker " + category + " " + section_name + " " + (should_apply ? "1" : "0") + " >/dev/null 2>&1 &";
    system(cmd);

    write_json({
        success: true,
        job_id: "zapret2_autodetect",
        total: total,
        message: "Zapret2 autodetect started"
    });
    return 0;
}

function autodetect_status() {
    let state = read_state();
    if (!state) {
        write_json({
            status: "idle",
            success: false,
            message: "No active or saved autodetect results found"
        });
        return 0;
    }
    write_json(state);
    return 0;
}

function apply_strategy(section_name, strategy_text) {
    section_name = as_string(section_name || "zapret2");
    strategy_text = trim(strategy_text);
    if (strategy_text == "") {
        write_json({ success: false, message: "Strategy text is empty" });
        return 1;
    }

    let cursor = uci_module.cursor();
    if (!cursor) {
        write_json({ success: false, message: "Failed to open UCI cursor" });
        return 1;
    }

    cursor.set("nazzhub", section_name, "nfqws2_opt", strategy_text);
    cursor.set("nazzhub", section_name, "enabled", "1");
    cursor.commit("nazzhub");
    system("/usr/bin/nazzhub reload >/dev/null 2>&1 &");

    write_json({
        success: true,
        section: section_name,
        strategy: strategy_text,
        message: "Zapret2 strategy applied to section '" + section_name + "' and service reloaded"
    });
    return 0;
}

let mode = ARGV[0] || "";

if (mode == "list-strategies")
    exit(list_strategies_command(ARGV[1]));
else if (mode == "autodetect")
    exit(autodetect(ARGV[1], ARGV[2], ARGV[3]));
else if (mode == "autodetect-async")
    exit(autodetect_async(ARGV[1], ARGV[2], ARGV[3]));
else if (mode == "autodetect-worker")
    exit(autodetect_worker(ARGV[1], ARGV[2], ARGV[3]));
else if (mode == "autodetect-status")
    exit(autodetect_status());
else if (mode == "apply")
    exit(apply_strategy(ARGV[1], ARGV[2]));
else {
    warn("Usage: autodetect.uc <list-strategies|autodetect|autodetect-async|autodetect-worker|autodetect-status|apply> [args...]\n");
    exit(1);
}
