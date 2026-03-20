#include <iostream>
#include <fstream>
#include <string>
#include <sstream>

using namespace std;

int main() {
    ifstream memFile("/proc/meminfo");

    if (!memFile.is_open()) {
        cout << "Error: Could not open /proc/meminfo." << endl;
        return 1;
    }

    string line;
    long long totalMem = 0;
    long long availableMem = 0;
    
    while (getline(memFile, line)) {
        if (line.find("MemTotal:") == 0) {
            string label;
            long long value;
            string unit;
            
            stringstream ss(line);
            ss >> label >> value >> unit; 
            totalMem = value;
        }
        
        if (line.find("MemAvailable:") == 0) {
            string label;
            long long value;
            string unit;
            
            stringstream ss(line);
            ss >> label >> value >> unit;
            availableMem = value;
        }
    }

    memFile.close();

    if (totalMem > 0) {
        long long usedMem = totalMem - availableMem;
        double memUsagePercent = (static_cast<double>(usedMem) / totalMem) * 100.0;
        
        cout << "System Memory Usage: " << memUsagePercent << "%" << endl;
    } else {
        cout << "Failed to parse memory." << endl;
    }
    
    return 0;
}