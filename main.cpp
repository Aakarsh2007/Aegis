#include <iostream>
#include <fstream>
#include <string>
#include <sstream>
#include <vector>
#include <thread>
#include <chrono>

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

int main() {
    cout << "Aegis Probe Booting Up..." << endl;

    vector<long long> prevCpu = getCpuTicks();
    long long prevIdle = prevCpu[0];
    long long prevTotal = prevCpu[1];

    cout << "Calculating CPU Usage (1 second window)..." << endl;
    this_thread::sleep_for(chrono::seconds(1));

    vector<long long> currCpu = getCpuTicks();
    long long currIdle = currCpu[0];
    long long currTotal = currCpu[1];

    long long totalDelta = currTotal - prevTotal;
    long long idleDelta = currIdle - prevIdle;

    double cpuUsagePercent = (static_cast<double>(totalDelta - idleDelta) / totalDelta) * 100.0;

    cout << "-----------------------------------" << endl;
    cout << "System CPU Usage:    " << cpuUsagePercent << "%" << endl;
    
    return 0;
}