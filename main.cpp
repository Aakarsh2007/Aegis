#include <iostream>
#include <fstream>
#include <string>
#include <sstream>
#include <vector>
#include <thread>
#include <chrono>
#include "httplib.h"

using namespace std;

vector<long long> getCpuTicks() {
    ifstream statFile("/proc/stat");
    string line;
    getline(statFile, line);
    statFile.close();

    stringstream ss(line);
    string label;
    ss >> label;

    long long user, nice, system, idle, iowait, irq, softirq, steal;
    ss >> user >> nice >> system >> idle >> iowait >> irq >> softirq >> steal;

    long long idleTicks = idle + iowait;
    long long nonIdleTicks = user + nice + system + irq + softirq + steal;
    long long totalTicks = idleTicks + nonIdleTicks;

    return {idleTicks, totalTicks};
}

double getMemoryUsage() {
    ifstream memFile("/proc/meminfo");
    string line;
    long long totalMem = 0, availableMem = 0;

    while (getline(memFile, line)) {
        if (line.find("MemTotal:") == 0) {
            string label, unit;
            long long value;
            stringstream ss(line);
            ss >> label >> value >> unit;
            totalMem = value;
        }
        if (line.find("MemAvailable:") == 0) {
            string label, unit;
            long long value;
            stringstream ss(line);
            ss >> label >> value >> unit;
            availableMem = value;
        }
    }
    memFile.close();

    if (totalMem == 0) return 0.0;
    long long usedMem = totalMem - availableMem;
    return (static_cast<double>(usedMem) / totalMem) * 100.0;
}

string escapeJSON(const string& input) {
    string output;
    for (char c : input) {
        if (c == '"') output += "\\\"";
        else if (c == '\\') output += "\\\\";
        else if (c == '\n') output += "\\n";
        else if (c == '\r') output += "\\r";
        else if (c == '\t') output += "\\t";
        else output += c;
    }
    return output;
}

string readAndClearLog(const string& filepath) {
    ifstream file(filepath);
    if (!file.is_open()) return "";
    
    stringstream buffer;
    buffer << file.rdbuf();
    string content = buffer.str();
    file.close();

    if (content.length() > 0) {
        ofstream clearFile(filepath, ios::trunc);
        clearFile.close();
    }

    return content;
}

int main() {
    cout << "🛡️ Aegis Autonomous Watcher Initialized." << endl;
    httplib::Client cli("localhost", 3000);
    const string log_file = "real_server_error.log";

    ofstream touchFile(log_file, ios::app);
    touchFile.close();

    while (true) {
        vector<long long> prevCpu = getCpuTicks();
        this_thread::sleep_for(chrono::seconds(2));
        vector<long long> currCpu = getCpuTicks();
        double memUsage = getMemoryUsage();

        long long totalDelta = currCpu[1] - prevCpu[1];
        long long idleDelta = currCpu[0] - prevCpu[0];
        double cpuUsage = 0.0;
        if (totalDelta > 0) {
            cpuUsage = (static_cast<double>(totalDelta - idleDelta) / totalDelta) * 100.0;
        }

        string raw_logs = readAndClearLog(log_file);
        string safe_logs = escapeJSON(raw_logs);

        if (raw_logs.length() > 5) {
            cout << "\n🚨 FATAL CRASH DETECTED IN LOGS! Elevating alert to Orchestrator..." << endl;
            cpuUsage = 100.0; 
        }

        string jsonPayload = "{\"cpu\": " + to_string(cpuUsage) + 
                             ", \"memory\": " + to_string(memUsage) + 
                             ", \"stack_trace\": \"" + safe_logs + "\"}";

        if (auto res = cli.Post("/metrics", jsonPayload, "application/json")) {
            if (raw_logs.length() > 5) {
                cout << "✅ [CRITICAL] Stack trace sent. Orchestrator replied: " << res->status << "\n" << endl;
            } else {
                cout << "[SUCCESS] Health ping OK. CPU: " << cpuUsage << "% | RAM: " << memUsage << "%" << endl;
            }
        } else {
            cout << "❌ [ERROR] Connection failed. Is Orchestrator running?" << endl;
        }
    }

    return 0;
}
