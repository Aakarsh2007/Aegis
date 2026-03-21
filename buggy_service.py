import time

def process_data():
    print("Starting data processing...")
    is_processing = True
    count = 0

    while is_processing:
        count += 1
        # Introduce a small delay to prevent the loop from consuming 100% CPU
        time.sleep(0.01)

        if count == 100:
            print("Data processed.")
            is_processing = False

process_data()