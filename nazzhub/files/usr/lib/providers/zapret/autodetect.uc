#!/usr/bin/env ucode

let fs = require("fs");
let uci_module = require("uci");
let constants = require("core.constants");

const STRATEGIES_BASE_DIR = "/usr/share/nazzhub/zapret-strategies";
const FAKE_ASSETS_DIR = "/opt/zapret/files/fake";
const NFQWS_BIN = "/opt/zapret/nfq/nfqws";
const PROBE_NFT_TABLE = "nazzhub_probe";
const PROBE_QUEUE = 4099;
const DESYNC_MARK = "0x10000000";
const AUTODETECT_STATE_FILE = "/var/run/nazzhub/ui-state/zapret-autodetect.json";

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

function command_status(cmd) {
    let status = int(system(cmd));
    return status > 255 ? int(status / 256) : status;
}

function command_output(cmd) {
    let pipe = fs.popen(cmd, "r");
    if (!pipe)
        return "";
    let data = pipe.read("all");
    pipe.close();
    return data == null ? "" : as_string(data);
}

function ensure_fake_assets() {
    if (!fs.stat(FAKE_ASSETS_DIR))
        system("mkdir -p " + FAKE_ASSETS_DIR);
    if (fs.stat(STRATEGIES_BASE_DIR + "/assets"))
        system("cp -n " + STRATEGIES_BASE_DIR + "/assets/*.bin " + FAKE_ASSETS_DIR + "/ 2>/dev/null || true");
}

function clean_strategy_name(filename) {
    let name = replace(filename, /\.bat-forkop\.txt$/, "");
    name = replace(name, /\.txt$/, "");
    return name;
}

function list_strategies(category) {
    category = lc(as_string(category || "all"));
    let categories = [];
    if (category == "youtube")
        categories = [ "youtube" ];
    else if (category == "discord")
        categories = [ "discord" ];
    else if (category == "general")
        categories = [ "general" ];
    else
        categories = [ "youtube", "discord", "general" ];

    let results = [];
    for (let cat in categories) {
        let dir = STRATEGIES_BASE_DIR + "/" + cat;
        let files = fs.glob(dir + "/*.txt");
        if (!files || length(files) == 0)
            continue;

        for (let file_path in files) {
            let data = fs.readfile(file_path);
            if (data == null)
                continue;
            let strat = trim(data);
            if (strat == "")
                continue;

            let filename = replace(file_path, /^.*\//, "");
            let base_name = clean_strategy_name(filename);
            let display_name = (cat == "youtube" ? "YouTube: " : cat == "discord" ? "Discord: " : "General: ") + base_name;

            push(results, {
                id: cat + "_" + replace(replace(lc(base_name), /[^a-z0-9]/g, "_"), /_+/g, "_"),
                category: cat,
                filename: filename,
                name: base_name,
                display_name: display_name,
                strategy: strat
            });
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

function setup_probe_firewall() {
    cleanup_probe_firewall();
}

function cleanup_probe_firewall() {
    system("pkill -9 -f 'qnum=" + PROBE_QUEUE + "' 2>/dev/null || true");
    system("nft delete table inet " + PROBE_NFT_TABLE + " 2>/dev/null || true");
}

function test_single_strategy(strategy, target_url) {
    if (!fs.stat(NFQWS_BIN))
        return { success: false, code: 0, time: 0, error: "nfqws not installed" };

    let nfqws_cmd = NFQWS_BIN + " --qnum=" + PROBE_QUEUE + " --dpi-desync-fwmark=" + DESYNC_MARK + " " + strategy + " >/dev/null 2>&1 & echo $!";
    let pid = trim(command_output(nfqws_cmd));
    if (pid == "" || int(pid) <= 0)
        return { success: false, code: 0, time: 0, error: "failed to start nfqws" };

    system("sleep 0.1");

    let curl_cmd = "curl -k -s -o /dev/null -w '%{http_code}:%{time_total}' -m 1.8 --connect-timeout 1.2 '" + target_url + "'";
    let output = trim(command_output(curl_cmd));

    system("kill -9 " + pid + " 2>/dev/null || true");
    system("pkill -9 -f 'qnum=" + PROBE_QUEUE + "' 2>/dev/null || true");

    let parts = split(output, ":");
    let code = int(parts[0] || 0);
    let time = length(parts) > 1 ? +parts[1] : 0.0;

    let is_ok = code >= 200 && code < 500;
    return {
        success: is_ok,
        code: code,
        time: time
    };
}

function autodetect_worker(category, section_name, should_apply) {
    category = lc(as_string(category || "youtube"));
    section_name = as_string(section_name || "zapret");
    should_apply = as_string(should_apply) == "1";

    ensure_fake_assets();

    let target_url = "https://www.youtube.com";
    if (category == "discord")
        target_url = "https://discord.com";
    else if (category == "general")
        target_url = "https://rutracker.org";

    let strategies = list_strategies(category);
    if (length(strategies) == 0) {
        let err_res = {
            status: "done",
            success: false,
            message: "No strategies found in " + STRATEGIES_BASE_DIR + "/" + category
        };
        save_state(err_res);
        write_json(err_res);
        return 1;
    }

    setup_probe_firewall();

    let tested_results = [];
    let best_strategy = null;
    let min_latency = 99999.0;
    let total = length(strategies);

    for (let i = 0; i < total; i++) {
        let item = strategies[i];
        save_state({
            status: "running",
            category: category,
            target_url: target_url,
            current: i + 1,
            total: total,
            current_name: item.name,
            results: tested_results,
            best_strategy: best_strategy
        });

        let res = test_single_strategy(item.strategy, target_url);
        let result_entry = {
            id: item.id,
            name: item.name,
            display_name: item.display_name,
            code: res.code,
            time: res.time,
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
            target_url: target_url,
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
            cursor.set("nazzhub", section_name, "nfqws_opt", best_strategy.strategy);
            cursor.commit("nazzhub");
            applied = true;
            system("/usr/bin/nazzhub reload >/dev/null 2>&1 || true");
        }
    }

    let final_res = {
        status: "done",
        success: true,
        category: category,
        target_url: target_url,
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
    section_name = as_string(section_name || "zapret");
    should_apply = as_string(should_apply) == "1";

    let strategies = list_strategies(category);
    let total = length(strategies);

    let initial_state = {
        status: "running",
        category: category,
        current: 0,
        total: total,
        current_name: "Инициализация...",
        results: [],
        best_strategy: null
    };
    save_state(initial_state);

    let cmd = "/usr/bin/nazzhub zapret_autodetect_worker " + category + " " + section_name + " " + (should_apply ? "1" : "0") + " >/dev/null 2>&1 &";
    system(cmd);

    write_json({
        success: true,
        job_id: "zapret_autodetect",
        total: total,
        message: "Autodetect started"
    });
    return 0;
}

function autodetect_status() {
    let state = read_state();
    if (!state) {
        write_json({
            status: "idle",
            success: false,
            message: "No autodetect job found"
        });
        return 0;
    }
    write_json(state);
    return 0;
}

function apply_strategy(section_name, strategy_text) {
    section_name = as_string(section_name || "zapret");
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

    cursor.set("nazzhub", section_name, "nfqws_opt", strategy_text);
    cursor.commit("nazzhub");
    system("/usr/bin/nazzhub reload >/dev/null 2>&1 || true");

    write_json({
        success: true,
        section: section_name,
        strategy: strategy_text,
        message: "Strategy applied to section '" + section_name + "'"
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
