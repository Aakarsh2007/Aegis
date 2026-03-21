def process_data():
    print("Starting data processing...")
    is_processing = True
    count = 0
    
    while is_processing:
        count += 1
        if count == 100:
            print("Data processed.")
            is_processing = False # Terminate the loop

process_data()