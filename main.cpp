#include <iostream>
#include <fstream>
#include <string>
#include <sstream>
#include <vector>
#include <thread>
#include <chrono>
#include <map>
#include <cstring>
#include <climits>
#include <unistd.h>
#include "httplib.h"

using namespace std;

// ─── Config ──────────────────────────────────────────────────────────────────
struct Config {
    string endpoint  = "http://localhost:3000";
    string apiKey    = "";
    string logFile   = "real_server_error.log";
    string probeId   = "";
    int    interval  = 2;
    bool   dryRun    = false;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
static string getEnv(const char* name, const string& defaultVal = "") {
    const char* val = getenv(name);
    return val ? string(val) : defaultVal;
}

static string getHostname() {
    char buf[HOST_NAME_MAX + 1] = {};
    gethostname(buf, HOST_NAME_MAX);
    return string(buf);
}

// Parse CLI flags and env vars
Config parseConfig(int argc, char* argv[]) {
    Config cfg;
    cfg.endpoint = getEnv("AEGIS_ENDPOINT", cfg.endpoint);
    cfg.apiKey   = getEnv("AEGIS_API_KEY",  cfg.apiKey);
    cfg.logFile  = getEnv("AEGIS_LOG_FILE", cfg.logFile);
    cfg.probeId  = getEnv("AEGIS_PROBE_ID", "");
    string intervalEnv = getEnv("AEGIS_INTERVAL", "2");
    try { cfg.interval = stoi(intervalEnv); } catch (...) {}

    for (int i = 1; i < argc; i++) {
        string arg = argv[i];
        if (arg == "--dry-run") {
            cfg.dryRun = true;
        } else if (arg == "--endpoint" && i + 1 < argc) {
            cfg.endpoint = argv[++i];
        } else if (arg == "--api-key" && i + 1 < argc) {
            cfg.apiKey = argv[++i];
        } else if (arg == "--log-file" && i + 1 < argc) {
            cfg.logFile = argv[++i];
        } else if (arg == "--probe-id" && i + 1 < argc) {
            cfg.probeId = argv[++i];
        } else if (arg == "--interval" && i + 1 < argc) {
            try { cfg.interval = stoi(argv[++i]); } catch (...) {}
        }
    }

    if (cfg.probeId.empty()) {
        cfg.probeId = getHostname();
    }

    return cfg;
}

// ─── Telemetry ────────────────────────────────────────────────────────────────
vector<long long> getCpuTicks() {
    ifstream statFile("/proc/stat");
    if (!statFile.is_open()) {
        cerr << "[WARN] Cannot read /proc/stat — sending cpu=0.0" << endl;
        return {0LL, 0LL};
    }
    string line;
    getline(statFile, line);
    statFile.close();

    stringstream ss(line);
    string label;
    ss >> label;

    long long user, nice, system, idle, iowait, irq, softirq, steal;
    ss >> user >> nice >> system >> idle >> iowait >> irq >> softirq >> steal;

    long long idleTicks    = idle + iowait;
    long long nonIdleTicks = user + nice + system + irq + softirq + steal;
    long long totalTicks   = idleTicks + nonIdleTicks;

    return {idleTicks, totalTicks};
}

double getMemoryUsage() {
    ifstream memFile("/proc/meminfo");
    if (!memFile.is_open()) {
        cerr << "[WARN] Cannot read /proc/meminfo — sending memory=0.0" << endl;
        return 0.0;
    }
    string line;
    long long totalMem = 0, availableMem = 0;

    while (getline(memFile, line)) {
        if (line.rfind("MemTotal:", 0) == 0) {
            string label, unit;
            long long value;
            stringstream ss(line);
            ss >> label >> value >> unit;
            totalMem = value;
        }
        if (line.rfind("MemAvailable:", 0) == 0) {
            string label, unit;
            long long value;
            stringstream ss(line);
            ss >> label >> value >> unit;
            availableMem = value;
        }
    }
    memFile.close();

    if (totalMem == 0) return 0.0;
    return (static_cast<double>(totalMem - availableMem) / totalMem) * 100.0;
}

// ─── JSON helpers ─────────────────────────────────────────────────────────────
string escapeJSON(const string& input) {
    string output;
    output.reserve(input.size());
    for (char c : input) {
        switch (c) {
            case '"':  output += "\\\""; break;
            case '\\': output += "\\\\"; break;
            case '\n': output += "\\n";  break;
            case '\r': output += "\\r";  break;
            case '\t': output += "\\t";  break;
            default:   output += c;
        }
    }
    return output;
}

string readAndClearLog(const string& filepath) {
    ifstream file(filepath);
    if (!file.is_open()) {
        // Touch the file if it doesn't exist
        ofstream touch(filepath, ios::app);
        return "";
    }

    stringstream buffer;
    buffer << file.rdbuf();
    string content = buffer.str();
    file.close();

    // Truncate to 4KB to prevent huge payloads
    if (content.length() > 4096) {
        content = content.substr(0, 4096) + "\n[...truncated]";
    }

    if (!content.empty()) {
        ofstream clearFile(filepath, ios::trunc);
        clearFile.close();
    }

    return content;
}

// ─── HTTP sending ─────────────────────────────────────────────────────────────
// Parse host and port from a URL like "http://host:port" or "https://host:port"
pair<string, int> parseEndpoint(const string& endpoint) {
    string url = endpoint;
    // Strip scheme
    bool isHttps = (url.rfind("https://", 0) == 0);
    if (url.rfind("http://", 0) == 0)  url = url.substr(7);
    if (url.rfind("https://", 0) == 0) url = url.substr(8);

    // Find port
    size_t colonPos = url.rfind(':');
    if (colonPos != string::npos) {
        string host = url.substr(0, colonPos);
        string portStr = url.substr(colonPos + 1);
        // Remove any path
        size_t slashPos = portStr.find('/');
        if (slashPos != string::npos) portStr = portStr.substr(0, slashPos);
        try {
            return {host, stoi(portStr)};
        } catch (...) {}
    }

    return {url, isHttps ? 443 : 3000};
}

bool sendMetrics(const Config& cfg, const string& jsonPayload) {
    auto [host, port] = parseEndpoint(cfg.endpoint);
    httplib::Client cli(host, port);
    cli.set_connection_timeout(10);
    cli.set_read_timeout(15);

    httplib::Headers headers = {{"Content-Type", "application/json"}};
    if (!cfg.apiKey.empty()) {
        headers.emplace("Authorization", "Bearer " + cfg.apiKey);
    }

    auto res = cli.Post("/api/v1/metrics", headers, jsonPayload, "application/json");
    if (res) {
        return true;
    }
    cerr << "[ERROR] Failed to reach Orchestrator at " << host << ":" << port
         << " — " << httplib::to_string(res.error()) << endl;
    return false;
}

bool sendHealth(const Config& cfg, long long ts) {
    auto [host, port] = parseEndpoint(cfg.endpoint);
    httplib::Client cli(host, port);
    cli.set_connection_timeout(5);
    cli.set_read_timeout(5);

    string payload = "{\"probe_id\":\"" + escapeJSON(cfg.probeId) +
                     "\",\"status\":\"online\",\"timestamp\":" + to_string(ts) + "}";

    httplib::Headers headers = {{"Content-Type", "application/json"}};
    if (!cfg.apiKey.empty()) {
        headers.emplace("Authorization", "Bearer " + cfg.apiKey);
    }

    auto res = cli.Post("/api/v1/health", headers, payload, "application/json");
    return !!res;
}

// ─── Main loop ────────────────────────────────────────────────────────────────
int main(int argc, char* argv[]) {
    Config cfg = parseConfig(argc, argv);

    cout << "🛡️  Aegis Probe v2.0 Initialized" << endl;
    cout << "   Probe ID  : " << cfg.probeId << endl;
    cout << "   Endpoint  : " << cfg.endpoint << endl;
    cout << "   Auth      : " << (cfg.apiKey.empty() ? "none (LOCAL_MODE)" : "Bearer ***") << endl;
    cout << "   Log file  : " << cfg.logFile << endl;
    cout << "   Interval  : " << cfg.interval << "s" << endl;
    if (cfg.dryRun) cout << "   ⚡ DRY RUN MODE — no HTTP requests" << endl;

    int loopCount = 0;

    while (true) {
        vector<long long> prevCpu = getCpuTicks();
        this_thread::sleep_for(chrono::seconds(cfg.interval));
        vector<long long> currCpu = getCpuTicks();
        double memUsage = getMemoryUsage();

        long long totalDelta = currCpu[1] - prevCpu[1];
        long long idleDelta  = currCpu[0] - prevCpu[0];
        double cpuUsage = 0.0;
        if (totalDelta > 0) {
            cpuUsage = (static_cast<double>(totalDelta - idleDelta) / totalDelta) * 100.0;
        }

        string rawLogs  = readAndClearLog(cfg.logFile);
        string safeLogs = escapeJSON(rawLogs);

        bool hasCrash = rawLogs.length() > 5;
        if (hasCrash) {
            cerr << "\n🚨 FATAL CRASH DETECTED IN LOGS! Alerting Orchestrator..." << endl;
            cpuUsage = 100.0;
        }

        string jsonPayload =
            "{\"probe_id\":\"" + escapeJSON(cfg.probeId) + "\""
            ",\"cpu\":"        + to_string(cpuUsage)      +
            ",\"memory\":"     + to_string(memUsage)      +
            ",\"stack_trace\":\"" + safeLogs + "\"}";

        if (cfg.dryRun) {
            cout << "[DRY-RUN] " << jsonPayload << endl;
        } else {
            bool ok = sendMetrics(cfg, jsonPayload);
            if (ok) {
                if (hasCrash) {
                    cout << "✅ [CRITICAL] Crash trace sent to Orchestrator." << endl;
                } else {
                    cout << "[OK] CPU: " << cpuUsage << "% | RAM: " << memUsage << "%" << endl;
                }
            }
            // else: error already printed in sendMetrics
        }

        // Heartbeat every 30s (15 × 2s intervals by default)
        loopCount++;
        int heartbeatEvery = max(1, 30 / cfg.interval);
        if (loopCount % heartbeatEvery == 0) {
            long long ts = chrono::duration_cast<chrono::seconds>(
                chrono::system_clock::now().time_since_epoch()
            ).count();

            if (cfg.dryRun) {
                cout << "[DRY-RUN] Heartbeat ts=" << ts << endl;
            } else {
                sendHealth(cfg, ts);
            }
        }
    }

    return 0;
}
