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

#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#include <sys/statvfs.h>
#endif

#include "httplib.h"

using namespace std;

// ─── Config ──────────────────────────────────────────────────────────────────
struct Config {
    string endpoint  = "http://localhost:3000";
    string apiKey    = "";
    string logFile   = "real_server_error.log";
    string probeId   = "";
    int    interval  = 5; // default telemetry tick interval
    int    heartbeat = 60; // heartbeat every 60s
    bool   dryRun    = false;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
static string getEnv(const char* name, const string& defaultVal = "") {
    const char* val = getenv(name);
    return val ? string(val) : defaultVal;
}

static string getHostname() {
    char buf[256] = {};
#ifdef _WIN32
    DWORD size = sizeof(buf);
    GetComputerNameA(buf, &size);
#else
    gethostname(buf, sizeof(buf) - 1);
#endif
    return string(buf);
}

// ─── Telemetry ────────────────────────────────────────────────────────────────
vector<long long> getCpuTicks() {
#ifdef _WIN32
    // Windows stub
    return {0LL, 0LL};
#else
    ifstream statFile("/proc/stat");
    if (!statFile.is_open()) {
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
#endif
}

double getMemoryUsage() {
#ifdef _WIN32
    // Windows Memory info
    MEMORYSTATUSEX memInfo;
    memInfo.dwLength = sizeof(MEMORYSTATUSEX);
    GlobalMemoryStatusEx(&memInfo);
    return (double)memInfo.dwMemoryLoad;
#else
    ifstream memFile("/proc/meminfo");
    if (!memFile.is_open()) {
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
#endif
}

double getDiskUsage() {
#ifdef _WIN32
    // Windows Disk Info
    ULARGE_INTEGER freeBytesAvailable, totalNumberOfBytes, totalNumberOfFreeBytes;
    if (GetDiskFreeSpaceExA("C:\\", &freeBytesAvailable, &totalNumberOfBytes, &totalNumberOfFreeBytes)) {
        double total = (double)totalNumberOfBytes.QuadPart;
        double free = (double)totalNumberOfFreeBytes.QuadPart;
        return ((total - free) / total) * 100.0;
    }
    return 0.0;
#else
    struct statvfs stat;
    if (statvfs("/", &stat) == 0) {
        double total = (double)stat.f_blocks * stat.f_frsize;
        double free = (double)stat.f_bfree * stat.f_frsize;
        if (total > 0) {
            return ((total - free) / total) * 100.0;
        }
    }
    return 0.0;
#endif
}

string executeCommand(const string& cmd) {
#ifdef _WIN32
    return ""; // Windows command check stub
#else
    char buffer[128];
    string result = "";
    FILE* pipe = popen((cmd + " 2>/dev/null").c_str(), "r");
    if (!pipe) return "";
    while (!feof(pipe)) {
        if (fgets(buffer, 128, pipe) != NULL)
            result += buffer;
    }
    pclose(pipe);
    // strip trailing whitespaces
    while (!result.empty() && (result.back() == '\n' || result.back() == '\r' || result.back() == ' ')) {
        result.pop_back();
    }
    return result;
#endif
}

string getDockerStatus() {
    string raw = executeCommand("docker ps --format \"{{.Names}}: {{.Status}}\"");
    if (raw.empty()) return "no active containers or docker not running";
    return raw;
}

string getServiceStatus(const string& serviceName) {
    string status = executeCommand("systemctl is-active " + serviceName);
    if (status.empty()) return "unknown";
    return status;
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
        ofstream touch(filepath, ios::app);
        return "";
    }

    stringstream buffer;
    buffer << file.rdbuf();
    string content = buffer.str();
    file.close();

    if (content.length() > 8192) {
        content = content.substr(0, 8192) + "\n[...truncated]";
    }

    if (!content.empty()) {
        ofstream clearFile(filepath, ios::trunc);
        clearFile.close();
    }

    return content;
}

pair<string, int> parseEndpoint(const string& endpoint) {
    string url = endpoint;
    bool isHttps = (url.rfind("https://", 0) == 0);
    if (url.rfind("http://", 0) == 0)  url = url.substr(7);
    if (url.rfind("https://", 0) == 0) url = url.substr(8);

    size_t colonPos = url.rfind(':');
    if (colonPos != string::npos) {
        string host = url.substr(0, colonPos);
        string portStr = url.substr(colonPos + 1);
        size_t slashPos = portStr.find('/');
        if (slashPos != string::npos) portStr = portStr.substr(0, slashPos);
        try {
            return {host, stoi(portStr)};
        } catch (...) {}
    }

    return {url, isHttps ? 443 : 3000};
}

// ─── HTTP Telemetry Dispatch ──────────────────────────────────────────────────
bool sendPayload(const Config& cfg, const string& path, const string& jsonPayload) {
    if (cfg.dryRun) {
        cout << "[DRY-RUN] " << path << " -> " << jsonPayload << endl;
        return true;
    }

    auto [host, port] = parseEndpoint(cfg.endpoint);
    httplib::Client cli(host, port);
    cli.set_connection_timeout(10);
    cli.set_read_timeout(15);

    httplib::Headers headers = {{"Content-Type", "application/json"}};
    if (!cfg.apiKey.empty()) {
        headers.emplace("Authorization", "Bearer " + cfg.apiKey);
    }

    auto res = cli.Post(path.c_str(), headers, jsonPayload, "application/json");
    if (res && res->status == 200) {
        return true;
    }
    
    cerr << "[WARN] Dispatch failed to " << host << ":" << port << path 
         << " (Error: " << (res ? to_string(res->status) : httplib::to_string(res.error())) << ")" << endl;
    return false;
}

// Config Parser
Config parseConfig(int argc, char* argv[]) {
    Config cfg;
    cfg.endpoint = getEnv("AEGIS_ENDPOINT", cfg.endpoint);
    cfg.apiKey   = getEnv("AEGIS_API_KEY",  cfg.apiKey);
    cfg.logFile  = getEnv("AEGIS_LOG_FILE", cfg.logFile);
    cfg.probeId  = getEnv("AEGIS_PROBE_ID", "");
    
    string intervalEnv = getEnv("AEGIS_INTERVAL", "5");
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

// ─── Main ─────────────────────────────────────────────────────────────────────
int main(int argc, char* argv[]) {
    Config cfg = parseConfig(argc, argv);

    cout << "🛡️  Aegis Production Probe v3.0" << endl;
    cout << "   Probe ID        : " << cfg.probeId << endl;
    cout << "   Endpoint        : " << cfg.endpoint << endl;
    cout << "   Auth            : " << (cfg.apiKey.empty() ? "local / public" : "Bearer ***") << endl;
    cout << "   Log Target      : " << cfg.logFile << endl;
    cout << "   Tick Interval   : " << cfg.interval << "s" << endl;
    cout << "   Heartbeat       : " << cfg.heartbeat << "s" << endl;
    if (cfg.dryRun) cout << "   ⚠️ DRY RUN MODE ACTIVE" << endl;

    vector<string> retryQueue;
    int currentBackoff = 0; // exponent index
    auto lastHeartbeat = chrono::steady_clock::now();

    while (true) {
        vector<long long> prevCpu = getCpuTicks();
        
        // Wait based on tick interval or exponential backoff
        int sleepTime = cfg.interval;
        if (currentBackoff > 0) {
            sleepTime = cfg.interval * (1 << currentBackoff); // 2^backoff multiplier
            if (sleepTime > cfg.heartbeat) sleepTime = cfg.heartbeat;
            cout << "🔌 Backing off... next try in " << sleepTime << " seconds" << endl;
        }
        
        this_thread::sleep_for(chrono::seconds(sleepTime));

        vector<long long> currCpu = getCpuTicks();
        double cpuUsage = 0.0;
        long long totalDelta = currCpu[1] - prevCpu[1];
        long long idleDelta  = currCpu[0] - prevCpu[0];
        if (totalDelta > 0) {
            cpuUsage = (static_cast<double>(totalDelta - idleDelta) / totalDelta) * 100.0;
        }

        double memUsage = getMemoryUsage();
        double diskUsage = getDiskUsage();

        // Check for immediate crash / stack trace logs
        string rawLogs = readAndClearLog(cfg.logFile);
        bool hasCrash = rawLogs.length() > 5;

        // Build telemetry packet
        string escapedLogs = escapeJSON(rawLogs);
        string dockerInfo = escapeJSON(getDockerStatus());
        string systemdInfo = escapeJSON(getServiceStatus("ssh")); // check SSH service as a proxy sample

        string payload = "{\"probe_id\":\"" + escapeJSON(cfg.probeId) + "\""
                         ",\"cpu\":" + to_string(cpuUsage) +
                         ",\"memory\":" + to_string(memUsage) +
                         ",\"disk\":" + to_string(diskUsage) +
                         ",\"hostname\":\"" + escapeJSON(getHostname()) + "\""
                         ",\"version\":\"3.0.0\""
                         ",\"stack_trace\":\"" + escapedLogs + "\"}";

        if (hasCrash) {
            cout << "🚨 CRASH LOGS DETECTED! Processing immediate dispatch..." << endl;
        }

        // Try to dispatch metric payload
        bool ok = sendPayload(cfg, "/api/webhooks/probe", payload);
        if (ok) {
            // Reset backoff and attempt sending retry queue (batching)
            currentBackoff = 0;
            if (!retryQueue.empty()) {
                cout << "📦 Retrying " << retryQueue.size() << " queued telemetries..." << endl;
                bool retryOk = true;
                for (auto it = retryQueue.begin(); it != retryQueue.end(); ) {
                    if (sendPayload(cfg, "/api/webhooks/probe", *it)) {
                        it = retryQueue.erase(it);
                    } else {
                        retryOk = false;
                        break; // Server went down again
                    }
                }
                if (retryOk) {
                    cout << "✅ Queued telemetries dispatched successfully." << endl;
                }
            }
            cout << "[TELEMETRY OK] CPU: " << cpuUsage << "% | RAM: " << memUsage << "% | Disk: " << diskUsage << "%" << endl;
        } else {
            // Push payload to retry queue
            if (retryQueue.size() < 50) { // Limit queue size to avoid memory issues
                retryQueue.push_back(payload);
            }
            currentBackoff = min(6, currentBackoff + 1); // Max 64x multiplier backoff
        }

        // Dispatch 60s Heartbeat
        auto now = chrono::steady_clock::now();
        if (chrono::duration_cast<chrono::seconds>(now - lastHeartbeat).count() >= cfg.heartbeat) {
            lastHeartbeat = now;
            long long ts = chrono::duration_cast<chrono::seconds>(chrono::system_clock::now().time_since_epoch()).count();
            string hbPayload = "{\"probe_id\":\"" + escapeJSON(cfg.probeId) + "\""
                               ",\"status\":\"online\",\"timestamp\":" + to_string(ts) + "}";

            cout << "💓 Sending heartbeat..." << endl;
            sendPayload(cfg, "/api/v1/health", hbPayload);
        }
    }

    return 0;
}
