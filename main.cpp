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

int main() {
    cout << "Aegis Probe initialized. Establishing network link..." << endl;

    httplib::Client cli("localhost", 3000);

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

        string jsonPayload = "{\"cpu\": " + to_string(cpuUsage) + ", \"memory\": " + to_string(memUsage) + "}";

        if (auto res = cli.Post("/metrics", jsonPayload, "application/json")) {
            cout << "[SUCCESS] Telemetry transmitted. Orchestrator replied: " << res->status << endl;
        } else {
            cout << "[ERROR] Connection failed. Is the Orchestrator running?" << endl;
        }
    }

    return 0;
}