#include <iostream>
#include <fstream>
#include <string>

using namespace std;

int main() {
    ifstream memFile("/proc/meminfo");

    if (!memFile.is_open()) {
        cout << "Error: Could not open /proc/meminfo. Are you sure you are on Linux?" << endl;
        return 1;
    }

    string line;
    
    while (getline(memFile, line)) {
        if (line.find("MemTotal:") == 0) {
            cout << "Raw OS Data -> " << line << endl;
        }
        if (line.find("MemAvailable:") == 0) {
            cout << "Raw OS Data -> " << line << endl;
        }
    }

    memFile.close();
    
    return 0;
}