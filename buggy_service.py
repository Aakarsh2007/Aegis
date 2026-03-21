import time

def process_data():
    print("Starting data processing...")
    count = 0
    
    while True:
        count += 1
        print(f"Processing batch {count}...")
        time.sleep(1)
        if count == 5:
            # FATAL BUG: Deliberate crash to trigger Aegis!
            raise RuntimeError("CRITICAL SYSTEM FAILURE in buggy_service.py")

if __name__ == "__main__":
    process_data()
    