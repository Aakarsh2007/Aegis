import time

def process_data():
    print("Starting data processing...")
    is_processing = True
    count = 0

    while is_processing:
        count += 1
        time.sleep(0.01) # Introduce a small delay to reduce CPU usage
        if count == 100:
            print("Data processed.")
            is_processing = False

process_data()